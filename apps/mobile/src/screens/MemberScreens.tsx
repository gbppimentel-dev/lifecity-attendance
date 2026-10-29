import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import { dateTime } from '../lib/format';
import { MemberQR } from '../components/MemberQR';
import { Screen, Card, Title, TextBody, Button, Field, Notice, Select, Chip, useToast } from '../ui';

type Profile = {
  id: string; first_name: string; last_name: string; member_number: string;
  email: string | null; mobile: string | null; status: 'active' | 'inactive';
  qr_token: string | null; churches: string[]; ministries: string[];
};
type Service = {
  id: string; name: string; starts_at: string; location: string | null;
  is_sunday_service: boolean; state: 'upcoming' | 'in-progress'; available_until: string;
};
type Portal = { profile: Profile; services: Service[]; service_total: number; service_page: number; server_time: string };
type Named = { id: string; name: string };
type Values = { first_name: string; last_name: string; email: string; churches: string[]; ministries: string[] };
type ProfileRequest = { id: string; member_id: string; base: Values; requested: Values; status: string; review_note: string; updated_at: string; created_at: string };
type Editor = { member_id: string; values: Values; mobile: string; requests: ProfileRequest[]; churches: Named[]; ministries: Named[] };
type LinkRequest = { id: string; full_name: string; member_number: string; contact: string; church: string; status: string; review_note: string; created_at: string; updated_at: string };
type Entry = { id: string; event_id: string; checked_in_at: string; service_name: string; service_date: string | null; service_location: string | null; archived: boolean };
type History = { member_id: string; total: number; services: number; latest: string | null; page: number; page_size: number; rows: Entry[] };
type Ticket = { id: string; subject: string; status: string; updated_at: string; status_revision: number; unread: boolean };
type Feedback = { rows: Ticket[]; total: number; unread: number; page: number };
const statusLabels: Record<string, string> = { pending: 'Pending Review', approved: 'Approved', declined: 'Declined', cancelled: 'Cancelled', new: 'New', reviewing: 'In Progress', resolved: 'Completed', closed: 'Considered' };
const statusLabel = (value: string) => statusLabels[value] || value;
const errorMessage = (error: unknown) => {
  const failure = error as { code?: string; message?: string };
  return failure?.code === 'P0001' && failure.message ? failure.message
    : failure?.code === 'PGRST202' ? 'This feature is unavailable. Please contact the Owner.'
    : 'The action could not be confirmed. Refresh to check the current state before trying again.';
};

/** Focused screens refresh without replacing the current content with a blank page. */
function useRpc<T>(rpc: string, args: Record<string, unknown>, validate: (value: unknown) => T, identity = '', poll = false) {
  const focused = useIsFocused();
  const [data, setData] = useState<T | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [loadedKey, setLoadedKey] = useState(''), [revision, setRevision] = useState(0);
  const key = JSON.stringify([rpc, args, identity]);
  const argsRef = useRef(args), validateRef = useRef(validate), sequence = useRef(0);
  argsRef.current = args; validateRef.current = validate;
  useEffect(() => {
    if (!focused) return;
    let alive = true;
    const request = ++sequence.current;
    setLoading(true); setError('');
    void (async () => {
      try {
        const result = await supabase.rpc(rpc, argsRef.current);
        if (result.error) throw result.error;
        const next = validateRef.current(result.data);
        if (alive && sequence.current === request) { setData(next); setLoadedKey(key); }
      } catch (failure) {
        if (alive && sequence.current === request) { setData(null); setLoadedKey(''); setError(errorMessage(failure)); }
      } finally { if (alive && sequence.current === request) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [key, revision, focused]);
  useEffect(() => {
    if (!focused) return;
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') setRevision(value => value + 1); });
    const timer = poll ? setInterval(() => { if (AppState.currentState === 'active') setRevision(value => value + 1); }, 45000) : null;
    return () => { subscription.remove(); if (timer) clearInterval(timer); };
  }, [focused, poll]);
  return { data: loadedKey === key ? data : null, loading, error, refresh: () => setRevision(value => value + 1) };
}

function useWriter() {
  const { session, account } = useSession();
  const focused = useIsFocused();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), generation = useRef(0), alive = useRef(true);
  const identity = `${session?.user.id || ''}:${account?.member_id || ''}`;
  const live = useRef({ identity, uid: session?.user.id, account, focused });
  live.current = { identity, uid: session?.user.id, account, focused };
  const eligible = () => alive.current && identity === live.current.identity && !!live.current.uid
    && live.current.account?.user_id === live.current.uid && live.current.account.status === 'active'
    && ['owner', 'admin', 'user'].includes(live.current.account.role)
    && live.current.focused && AppState.currentState === 'active';
  useEffect(() => { generation.current++; setError(''); }, [identity]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; }; }, []);
  async function run(work: () => PromiseLike<{ error: unknown }>, done: () => void) {
    // Native Alert callbacks can survive a navigation or account change. The
    // closure's identity must still match the live, foreground session.
    if (lock.current || !eligible()) return;
    const started = generation.current;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await work();
      if (result.error) throw result.error;
      if (eligible() && started === generation.current) done();
    } catch (failure) { if (eligible() && started === generation.current) setError(errorMessage(failure)); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return { busy, error, run };
}

function Loading({ show }: { show: boolean }) {
  return show ? <ActivityIndicator style={styles.loading} color="#147d73" accessibilityLabel="Loading" /> : null;
}
function PageControls({ page, total, size, disabled, onChange }: { page: number; total: number; size: number; disabled: boolean; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, size)));
  if (total <= size) return null;
  return <Card><TextBody>Page {page} of {pages} · {total.toLocaleString()} Results</TextBody><View style={styles.between}>
    <Button title="Previous" variant="secondary" disabled={disabled || page <= 1} onPress={() => onChange(page - 1)} />
    <Button title="Next" variant="secondary" disabled={disabled || page >= pages} onPress={() => onChange(page + 1)} />
  </View></Card>;
}
function LabelValue({ label, value }: { label: string; value: string | null | undefined }) {
  return <View style={styles.fact}><Text style={styles.label}>{label}</Text><Text selectable style={styles.factValue}>{value || 'Not Provided'}</Text></View>;
}
function ServiceCard({ service }: { service: Service }) {
  const date = new Date(service.starts_at);
  return <Card style={styles.service}>
    <View style={styles.between}>
      <View style={styles.calendar}><Text style={styles.month}>{new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short' }).format(date).toUpperCase()}</Text><Text style={styles.day}>{new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', day: 'numeric' }).format(date)}</Text></View>
      <View style={styles.tags}><Chip>{service.state === 'in-progress' ? 'In Progress' : 'Upcoming'}</Chip>{service.is_sunday_service ? <Chip>Sunday Service</Chip> : null}</View>
    </View>
    <Text style={styles.heading}>{service.name}</Text><TextBody>{dateTime(service.starts_at)}</TextBody><TextBody>{service.location || 'Venue to Be Confirmed'}</TextBody>
  </Card>;
}
function checkedPortal(value: unknown, memberId: string): Portal {
  const data = value as Portal;
  if (!data?.profile || data.profile.id !== memberId || !Array.isArray(data.services)
    || !Number.isInteger(data.service_total) || !Number.isInteger(data.service_page)
    || !['active', 'inactive'].includes(data.profile.status)
    || !Array.isArray(data.profile.churches) || !Array.isArray(data.profile.ministries)) throw new Error('Member connection changed');
  return data;
}

export function MemberHomeScreen() {
  const { account, refreshAccount } = useSession();
  const focused = useIsFocused();
  const navigation = useNavigation<any>();
  const memberId = account?.member_id || '';
  const [page, setPage] = useState(1);
  const portal = useRpc<Portal>('lc_my_member_portal', { p_service_page: page }, value => checkedPortal(value, memberId), memberId, true);
  const [qr, setQr] = useState<Profile | null>(null), [qrBusy, setQrBusy] = useState(false), [qrError, setQrError] = useState('');
  const alive = useRef(true), qrGeneration = useRef(0), qrLock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; qrGeneration.current++; }; }, []);
  useEffect(() => { setQr(null); qrGeneration.current++; }, [memberId, portal.data?.profile.qr_token, portal.data?.profile.status]);
  useEffect(() => { if (!focused) { setQr(null); qrGeneration.current++; } }, [focused]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') { setQr(null); qrGeneration.current++; } });
    return () => subscription.remove();
  }, []);
  async function showQr() {
    if (qrLock.current || !focused || AppState.currentState !== 'active') return;
    qrLock.current = true; setQrBusy(true); setQrError('');
    const started = ++qrGeneration.current;
    try {
      const result = await supabase.rpc('lc_my_member_portal', { p_service_page: 1 });
      if (result.error) throw result.error;
      const latest = checkedPortal(result.data, memberId).profile;
      if (latest.status !== 'active' || !latest.qr_token) throw new Error('QR is unavailable');
      if (alive.current && started === qrGeneration.current) setQr(latest);
    } catch { if (alive.current && started === qrGeneration.current) setQrError('Your QR could not be opened. Refresh access or contact the church team.'); }
    finally { qrLock.current = false; if (alive.current) setQrBusy(false); }
  }
  const profile = portal.data?.profile;
  return <Screen>
    <Card style={styles.hero}><Text style={styles.eyebrow}>MEMBER SPACE</Text><Title>{profile ? `Hi, ${profile.first_name}.` : 'Your Member Space'}</Title><TextBody>Your profile, QR code and service schedule.</TextBody><Button title="Refresh" variant="secondary" loading={portal.loading} onPress={() => { portal.refresh(); void refreshAccount(); }} /></Card>
    {portal.error ? <Notice message={portal.error} tone="error" /> : null}<Loading show={portal.loading && !portal.data} />
    {profile ? <>
      <View style={styles.actionGrid}><View style={styles.flex}><Button title="My QR Code" loading={qrBusy} disabled={profile.status !== 'active' || !profile.qr_token} onPress={() => void showQr()} /></View><View style={styles.flex}><Button title="My Profile" variant="secondary" onPress={() => navigation.navigate('MemberProfile')} /></View></View>
      {qrError ? <Notice message={qrError} tone="error" /> : null}
      {profile.status === 'inactive' ? <Notice message="Your member profile is inactive. Contact the church team before checking in." tone="info" /> : null}
      <View style={styles.between}><Text style={styles.section}>Coming Up at LifeCity</Text><Text style={styles.muted}>{portal.data!.service_total} Services</Text></View>
      <TextBody>All times are in Manila.</TextBody>
      {portal.data!.services.length ? portal.data!.services.map(service => <ServiceCard key={service.id} service={service} />) : <Card><Text style={styles.heading}>No Services Scheduled</Text><TextBody>Check again later for the next service.</TextBody></Card>}
      <PageControls page={portal.data!.service_page} total={portal.data!.service_total} size={12} disabled={portal.loading} onChange={setPage} />
      <Card><View style={styles.between}><Text style={styles.heading}>{profile.first_name} {profile.last_name}</Text><Chip>{profile.status === 'active' ? 'Active' : 'Inactive'}</Chip></View><LabelValue label="Member Number" value={profile.member_number} /><LabelValue label="Email" value={profile.email} /><LabelValue label="Mobile Number" value={profile.mobile} /><LabelValue label="Churches" value={profile.churches.join(' · ')} /><LabelValue label="Ministries" value={profile.ministries.join(' · ') || 'None'} /><Button title="Edit Profile & Requests" variant="secondary" onPress={() => navigation.navigate('MemberProfile')} /></Card>
      <View style={styles.actionGrid}><View style={styles.flex}><Button title="Attendance" variant="secondary" onPress={() => navigation.navigate('MemberHistory')} /></View><View style={styles.flex}><Button title="App Feedback" variant="secondary" onPress={() => navigation.navigate('MemberFeedback')} /></View></View>
    </> : null}
    <Modal visible={!!qr} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setQr(null)}>
      <Screen topInset><Button title="Close QR Code" variant="secondary" onPress={() => setQr(null)} />{qr ? <MemberQR profile={qr} /> : null}<TextBody>Keep your QR code private. Show it to the check-in team when attending a service.</TextBody></Screen>
    </Modal>
  </Screen>;
}

function AffiliationPicker({ title, items, selected, disabled, onChange }: { title: string; items: Named[]; selected: string[]; disabled: boolean; onChange: (ids: string[]) => void }) {
  const [search, setSearch] = useState('');
  const visible = items.filter(item => item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <Card><View style={styles.between}><Text style={styles.heading}>{title}</Text><Chip>{selected.length} Selected</Chip></View>
    {items.length > 6 ? <Field label={`Find ${title}`} value={search} onChangeText={setSearch} placeholder={`Search ${title.toLowerCase()}`} editable={!disabled} /> : null}
    <View style={styles.choices}>{visible.map(item => {
      const chosen = selected.includes(item.id);
      return <Pressable key={item.id} accessibilityRole="checkbox" accessibilityLabel={item.name} accessibilityState={{ checked: chosen, disabled }} disabled={disabled} onPress={() => onChange(chosen ? selected.filter(id => id !== item.id) : [...selected, item.id])} style={({ pressed }) => [styles.choice, chosen && styles.selectedChoice, pressed && styles.pressed]}><Text style={[styles.check, chosen && styles.selectedCheck]}>{chosen ? '✓' : ''}</Text><Text style={styles.choiceName}>{item.name}</Text></Pressable>;
    })}</View>{!visible.length ? <TextBody>No Matching {title}</TextBody> : null}
  </Card>;
}
const valueKeys = ['first_name', 'last_name', 'email', 'churches', 'ministries'] as const;
const labels: Record<keyof Values, string> = { first_name: 'First Name', last_name: 'Last Name', email: 'Profile Email', churches: 'Churches', ministries: 'Ministries' };
function equal(first: unknown, second: unknown) { return JSON.stringify(first) === JSON.stringify(second); }
function displayValue(values: Values, key: keyof Values, editor: Editor) {
  if (key === 'churches' || key === 'ministries') return values[key].map(id => editor[key].find(item => item.id === id)?.name || 'Unavailable Entry').join(' · ') || 'None';
  return values[key] || 'Not Provided';
}
function ChangeSummary({ base, requested, editor }: { base: Values; requested: Values; editor: Editor }) {
  return <View style={styles.comparisons}>{valueKeys.filter(key => !equal(base[key], requested[key])).map(key => <View key={key} style={styles.comparison}>
    <Text style={styles.label}>{labels[key]}</Text><Text selectable style={styles.oldValue}>{displayValue(base, key, editor)}</Text><Text selectable style={styles.newValue}>{displayValue(requested, key, editor)}</Text>
  </View>)}</View>;
}

export function MemberProfileScreen() {
  const { account, refreshAccount } = useSession();
  const memberId = account?.member_id || '';
  const result = useRpc<Editor>('lc_profile_editor', {}, value => {
    const data = value as Editor;
    if (data?.member_id !== memberId || !data.values || !Array.isArray(data.requests) || !Array.isArray(data.churches) || !Array.isArray(data.ministries)) throw new Error('Invalid profile');
    return data;
  }, memberId);
  const { busy, error, run } = useWriter();
  const toast = useToast();
  const [editor, setEditor] = useState<Editor | null>(null), [draft, setDraft] = useState<Values | null>(null), [mobile, setMobile] = useState(''), [tab, setTab] = useState('details'), [review, setReview] = useState(false);
  const forceHydrate = useRef(false);
  useEffect(() => {
    if (!result.data) return;
    const dirty = editor && draft && (valueKeys.some(key => !equal(editor.values[key], draft[key])) || mobile.trim() !== (editor.mobile || ''));
    // Returning from Android background must not erase an in-progress draft, or
    // silently advance its compare-and-set baseline to newer server values.
    if (dirty && !forceHydrate.current && editor.member_id === memberId) return;
    forceHydrate.current = false;
    setEditor(result.data); setDraft({ ...result.data.values, churches: [...result.data.values.churches], ministries: [...result.data.values.ministries] }); setMobile(result.data.mobile || ''); setReview(false);
  }, [result.data]);
  const data = editor?.member_id === memberId ? editor : null;
  const pending = data?.requests.find(request => request.status === 'pending');
  const changed = !!data && !!draft && valueKeys.some(key => !equal(data.values[key], draft[key]));
  const valid = !!draft && draft.first_name.trim().length > 0 && draft.last_name.trim().length > 0 && draft.churches.length > 0 && (!draft.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()));
  async function saveMobile() {
    if (!data) return;
    await run(() => supabase.rpc('lc_update_my_mobile', { p_member_id: data.member_id, p_expected_mobile: data.mobile, p_mobile: mobile.trim() }), () => { toast.show('Mobile Number Saved'); setEditor({ ...data, mobile: mobile.trim() }); result.refresh(); void refreshAccount(); });
  }
  async function sendRequest() {
    if (!data || !draft || !changed || !valid || pending) return;
    const requested = { ...draft, first_name: draft.first_name.trim(), last_name: draft.last_name.trim(), email: draft.email.trim() };
    await run(() => supabase.rpc('lc_request_profile_changes', { p_member_id: data.member_id, p_expected: data.values, p_requested: requested }), () => { toast.show('Profile Request Sent'); forceHydrate.current = true; setTab('requests'); result.refresh(); });
  }
  function cancelRequest(request: ProfileRequest) {
    Alert.alert('Cancel This Request?', 'Your saved profile will stay the same.', [{ text: 'Keep Request', style: 'cancel' }, { text: 'Cancel Request', style: 'destructive', onPress: () => void run(() => supabase.rpc('lc_cancel_profile_request', { p_id: request.id, p_expected_updated_at: request.updated_at }), () => { toast.show('Request Cancelled'); forceHydrate.current = true; result.refresh(); }) }]);
  }
  return <Screen><Title>Profile & Requests</Title><Select label="Section" value={tab} options={[{ label: 'Profile Details', value: 'details' }, { label: 'Your Requests', value: 'requests' }]} onChange={next => { setTab(next); setReview(false); }} />
    {result.error || error ? <Notice message={error || result.error} tone="error" /> : null}<Loading show={result.loading && !data} />
    {data && draft ? tab === 'details' ? <>
      <Card><Text style={styles.heading}>Mobile Number</Text><TextBody>Saved directly to your member profile.</TextBody><Field label="Mobile Number" keyboardType="phone-pad" value={mobile} onChangeText={setMobile} maxLength={30} editable={!busy} placeholder="09171234567" /><Button title="Save Mobile Number" disabled={busy || mobile.trim() === (data.mobile || '')} loading={busy} onPress={() => Alert.alert('Save Mobile Number?', `${data.mobile || 'Not Provided'} → ${mobile.trim() || 'Not Provided'}`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Save', onPress: () => void saveMobile() }])} /></Card>
      {pending ? <Card style={styles.pending}><Text style={styles.heading}>A Request Is Pending</Text><TextBody>Other profile changes are available after the request is reviewed or cancelled.</TextBody><Button title="View Request" variant="secondary" onPress={() => setTab('requests')} /></Card> : <>
        <Card><Text style={styles.heading}>Request Profile Changes</Text><TextBody>Your church team reviews these changes before saving.</TextBody>
          <Field label="First Name" value={draft.first_name} onChangeText={value => { setDraft({ ...draft, first_name: value }); setReview(false); }} maxLength={100} editable={!busy} autoComplete="given-name" />
          <Field label="Last Name" value={draft.last_name} onChangeText={value => { setDraft({ ...draft, last_name: value }); setReview(false); }} maxLength={100} editable={!busy} autoComplete="family-name" />
          <Field label="Profile Email (Optional)" value={draft.email} onChangeText={value => { setDraft({ ...draft, email: value }); setReview(false); }} keyboardType="email-address" autoCapitalize="none" maxLength={254} editable={!busy} /><TextBody>Your Google sign-in email stays the same.</TextBody>
        </Card>
        <AffiliationPicker title="Churches" items={data.churches} selected={draft.churches} disabled={busy} onChange={ids => { setDraft({ ...draft, churches: ids }); setReview(false); }} />
        <AffiliationPicker title="Ministries" items={data.ministries} selected={draft.ministries} disabled={busy} onChange={ids => { setDraft({ ...draft, ministries: ids }); setReview(false); }} />
        {!draft.churches.length ? <Notice message="Select at least one Church." tone="info" /> : null}
        {review ? <Card><Text style={styles.heading}>Review Your Request</Text><TextBody>Current details appear above the requested values.</TextBody><ChangeSummary base={data.values} requested={draft} editor={data} /><Button title="Send for Approval" disabled={busy || !valid || !changed} loading={busy} onPress={() => void sendRequest()} /><Button title="Back to Editing" variant="secondary" disabled={busy} onPress={() => setReview(false)} /></Card> : <Button title="Review Changes" disabled={busy || !valid || !changed} onPress={() => setReview(true)} />}
      </>}
    </> : <>
      {!data.requests.length ? <Card><Text style={styles.heading}>No Profile Requests</Text><TextBody>Submitted changes and review messages will appear here.</TextBody></Card> : data.requests.map(request => <Card key={request.id}><View style={styles.between}><Chip>{statusLabel(request.status)}</Chip><Text style={styles.muted}>{dateTime(request.created_at)}</Text></View><ChangeSummary base={request.base} requested={request.requested} editor={data} />{request.review_note ? <Notice message={request.review_note} tone="info" /> : null}{request.status === 'pending' ? <Button title="Cancel Request" variant="secondary" disabled={busy} onPress={() => cancelRequest(request)} /> : null}</Card>)}
    </> : null}
    <Button title="Reload Profile" variant="secondary" disabled={busy || result.loading} onPress={() => {
      if ((changed && !pending) || (data && mobile.trim() !== (data.mobile || ''))) Alert.alert('Discard Unsaved Changes?', 'Reloading will replace your draft with the saved profile.', [{ text: 'Keep Editing', style: 'cancel' }, { text: 'Reload', onPress: () => { forceHydrate.current = true; result.refresh(); } }]);
      else { forceHydrate.current = true; result.refresh(); }
    }} />
  </Screen>;
}

export function MemberHistoryScreen() {
  const { account } = useSession();
  const memberId = account?.member_id || '';
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [page, setPage] = useState(1), [range, setRange] = useState('all'), [order, setOrder] = useState('newest');
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const day = ['year', 'month', 'day'].map(key => parts.find(part => part.type === key)?.value).join('-');
  const start = range === 'today' ? day : range === 'month' ? `${day.slice(0, 7)}-01` : null;
  const result = useRpc<History>('lc_my_attendance_history', { p_search: query, p_start: start, p_end: range === 'all' ? null : day, p_page: page, p_order: order }, value => {
    const data = value as History;
    if (data?.member_id !== memberId || !Array.isArray(data.rows) || !Number.isInteger(data.total) || !Number.isInteger(data.page_size) || data.page_size < 1) throw new Error('Invalid attendance response');
    return data;
  }, memberId);
  const searching = search.trim() !== query;
  const data = searching ? null : result.data;
  return <Screen><Title>My Attendance</Title><TextBody>Check-ins recorded for your member profile. All times are in Manila.</TextBody>
    <Card><Field label="Find a Service" value={search} onChangeText={setSearch} placeholder="Service name" /><Select label="Date Range" value={range} onChange={value => { setRange(value); setPage(1); }} options={[{ label: 'All Time', value: 'all' }, { label: 'This Month', value: 'month' }, { label: 'Today', value: 'today' }]} /><Select label="Sort" value={order} onChange={value => { setOrder(value); setPage(1); }} options={[{ label: 'Newest First', value: 'newest' }, { label: 'Oldest First', value: 'oldest' }]} /><Button title="Refresh" variant="secondary" loading={result.loading} onPress={result.refresh} /></Card>
    {result.error ? <Notice message={result.error} tone="error" /> : null}<Loading show={(result.loading || searching) && !data} />
    {data ? <><Card style={styles.hero}><Text style={styles.stat}>{data.total.toLocaleString()}</Text><TextBody>Matching Check-Ins · {data.services} Services</TextBody>{data.latest ? <TextBody>Latest: {dateTime(data.latest)}</TextBody> : null}</Card>
      {!data.rows.length ? <Card><Text style={styles.heading}>No Matching Check-Ins</Text><TextBody>Try another service or date range.</TextBody></Card> : data.rows.map(entry => <Card key={entry.id}><Text style={styles.heading}>{entry.service_name}</Text><TextBody>Checked In: {dateTime(entry.checked_in_at)}</TextBody>{entry.service_date ? <TextBody>Service: {dateTime(entry.service_date)}</TextBody> : null}{entry.service_location ? <TextBody>{entry.service_location}</TextBody> : null}{entry.archived ? <Chip>Archived Service</Chip> : null}</Card>)}
      <PageControls page={data.page} total={data.total} size={data.page_size} disabled={result.loading || searching} onChange={setPage} />
    </> : null}
  </Screen>;
}

export function MemberFeedbackScreen() {
  const { session } = useSession();
  const [page, setPage] = useState(1), [compose, setCompose] = useState(false), [category, setCategory] = useState('bug'), [subject, setSubject] = useState(''), [message, setMessage] = useState(''), [anonymous, setAnonymous] = useState(false);
  const payload = useRef<{ id: string; category: string; subject: string; message: string; anonymous: boolean } | null>(null);
  const result = useRpc<Feedback>('lc_my_feedback', { p_page: page }, value => {
    const data = value as Feedback;
    if (!data || !Array.isArray(data.rows) || !Number.isInteger(data.total) || !Number.isInteger(data.page)) throw new Error('Invalid feedback response');
    return data;
  }, session?.user.id || '');
  const { busy, error, run } = useWriter();
  const toast = useToast();
  async function send() {
    if (!session || subject.trim().length < 3 || message.trim().length < 10) return;
    // An ambiguous network result retries the exact request, with its original idempotency key.
    payload.current ??= { id: Crypto.randomUUID(), category, subject: subject.trim(), message: message.trim(), anonymous };
    const saved = payload.current;
    await run(() => supabase.rpc('lc_submit_feedback', { p_request_id: saved.id, p_category: saved.category, p_subject: saved.subject, p_message: saved.message, p_anonymous: saved.anonymous, p_page: 'Android · Member Feedback' }), () => { toast.show('Feedback Sent'); payload.current = null; setSubject(''); setMessage(''); setAnonymous(false); setCompose(false); setPage(1); result.refresh(); });
  }
  function read(ticket: Ticket) {
    void run(() => supabase.rpc('lc_read_feedback', { p_id: ticket.id, p_revision: ticket.status_revision }), result.refresh);
  }
  const frozen = busy || !!payload.current;
  return <Screen><Title>App Feedback</Title><TextBody>Send a suggestion or report a problem to the Owner.</TextBody>
    {!compose ? <Button title="Send Feedback" onPress={() => setCompose(true)} /> : <Card>
      <Text style={styles.heading}>New Feedback</Text>
      {payload.current ? <Notice message="Your submission was not confirmed. Retry sends the same message once; check Your Tickets before starting another." tone="info" /> : null}
      <Select label="Category" value={category} onChange={value => { if (!frozen) setCategory(value); }} options={[{ label: 'Bug Report', value: 'bug' }, { label: 'Feature Idea', value: 'idea' }, { label: 'Improvement', value: 'improvement' }, { label: 'Other', value: 'other' }]} />
      <Field label="Subject" value={subject} onChangeText={setSubject} maxLength={160} editable={!frozen} placeholder="A short title" />
      <Field label="Message" value={message} onChangeText={setMessage} maxLength={5000} multiline numberOfLines={6} editable={!frozen} placeholder="What happened, or what would you improve?" style={styles.message} />
      <Text style={styles.muted}>{message.length.toLocaleString()} / 5,000</Text>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: anonymous, disabled: frozen }} disabled={frozen} onPress={() => setAnonymous(value => !value)} style={[styles.choice, anonymous && styles.selectedChoice]}><Text style={[styles.check, anonymous && styles.selectedCheck]}>{anonymous ? '✓' : ''}</Text><Text style={styles.choiceName}>Submit Anonymously</Text></Pressable>
      <Button title={payload.current ? 'Retry Submission' : 'Send Feedback'} loading={busy} disabled={busy || subject.trim().length < 3 || message.trim().length < 10} onPress={() => void send()} />
      <Button title={payload.current ? 'Check Your Tickets' : 'Cancel'} variant="secondary" disabled={busy} onPress={() => { setCompose(false); result.refresh(); }} />
      {payload.current ? <Button title="Discard Draft" variant="secondary" disabled={busy} onPress={() => Alert.alert('Discard This Draft?', 'The earlier submission may already have been received. Check Your Tickets before sending the same message again.', [{ text: 'Keep Draft', style: 'cancel' }, { text: 'Discard Draft', style: 'destructive', onPress: () => { payload.current = null; setSubject(''); setMessage(''); setCompose(false); } }])} /> : null}
    </Card>}
    {error || result.error ? <Notice message={error || result.error} tone="error" /> : null}
    <View style={styles.between}><Text style={styles.section}>Your Tickets</Text><Button title="Refresh" variant="secondary" disabled={busy} loading={result.loading} onPress={result.refresh} /></View>
    <Loading show={result.loading && !result.data} />
    {result.data ? <><TextBody>{result.data.total} Tickets · {result.data.unread} Updates</TextBody>{!result.data.rows.length ? <Card><Text style={styles.heading}>No Feedback Tickets</Text><TextBody>Your submitted feedback will appear here.</TextBody></Card> : result.data.rows.map(ticket => <Card key={ticket.id}><View style={styles.between}><Chip>{statusLabel(ticket.status)}</Chip>{ticket.unread ? <Chip>New Update</Chip> : null}</View><Text style={styles.heading}>{ticket.subject}</Text><TextBody>{dateTime(ticket.updated_at)}</TextBody><Text style={styles.muted}>#{ticket.id.slice(0, 8).toUpperCase()}</Text>{ticket.unread ? <Button title="Mark as Read" variant="secondary" disabled={busy} onPress={() => read(ticket)} /> : <Text style={styles.muted}>Read</Text>}</Card>)}<PageControls page={result.data.page} total={result.data.total} size={10} disabled={busy || result.loading} onChange={setPage} /></> : null}
  </Screen>;
}

export function LinkMemberScreen() {
  const { session, refreshAccount, signOut } = useSession();
  const [form, setForm] = useState({ name: '', number: '', contact: '', church: '' });
  const [signOutError, setSignOutError] = useState(''), [signingOut, setSigningOut] = useState(false);
  const signOutLock = useRef(false), linkAlive = useRef(true);
  useEffect(() => { linkAlive.current = true; return () => { linkAlive.current = false; }; }, []);
  async function leave() {
    if (signOutLock.current) return;
    signOutLock.current = true; setSigningOut(true); setSignOutError('');
    try { await signOut(); }
    catch { if (linkAlive.current) setSignOutError('Could not sign out. Please try again.'); }
    finally { signOutLock.current = false; if (linkAlive.current) setSigningOut(false); }
  }
  const result = useRpc<LinkRequest[]>('lc_my_member_requests', {}, value => { if (!Array.isArray(value)) throw new Error('Invalid requests'); return value as LinkRequest[]; }, session?.user.id || '');
  const { busy, error, run } = useWriter();
  const toast = useToast();
  const pending = result.data?.find(request => request.status === 'pending');
  function submit() {
    if (form.name.trim().length < 3 || pending) return;
    void run(() => supabase.rpc('lc_submit_member_request', { p_full_name: form.name.trim(), p_member_number: form.number.trim(), p_contact: form.contact.trim(), p_church: form.church.trim() }), () => { toast.show('Member Link Request Sent'); result.refresh(); void refreshAccount(); });
  }
  function cancel(request: LinkRequest) {
    Alert.alert('Cancel This Request?', 'You can submit corrected details afterward.', [{ text: 'Keep Request', style: 'cancel' }, { text: 'Cancel Request', style: 'destructive', onPress: () => void run(() => supabase.rpc('lc_cancel_member_request', { p_id: request.id, p_expected_updated_at: request.updated_at }), () => { toast.show('Request Cancelled'); result.refresh(); }) }]);
  }
  return <Screen><Card style={styles.hero}><Text style={styles.eyebrow}>YOUR LIFECITY ACCOUNT</Text><Title>Connect Your Member Profile</Title><TextBody>Ask the church team to connect this login to your existing member record.</TextBody><TextBody>{session?.user.email || 'Signed-In Account'}</TextBody></Card>
    {error || result.error || signOutError ? <Notice message={error || result.error || signOutError} tone="error" /> : null}<Loading show={result.loading && !result.data} />
    {pending ? <Card><Chip>Pending Review</Chip><Text style={styles.heading}>{pending.full_name}</Text><TextBody>Your details are waiting for verification. A new member record has not been created.</TextBody><Button title="Cancel Request" variant="secondary" disabled={busy} onPress={() => cancel(pending)} /></Card> : result.data ? <Card><Text style={styles.heading}>Your Existing Church Profile</Text><Field label="Full Name" value={form.name} onChangeText={value => setForm({ ...form, name: value })} maxLength={150} editable={!busy} /><Field label="Member Number (Optional)" value={form.number} onChangeText={value => setForm({ ...form, number: value })} maxLength={80} editable={!busy} autoCapitalize="characters" /><Field label="Email or Mobile Number (Optional)" value={form.contact} onChangeText={value => setForm({ ...form, contact: value })} maxLength={150} editable={!busy} autoCapitalize="none" /><Field label="Church (Optional)" value={form.church} onChangeText={value => setForm({ ...form, church: value })} maxLength={150} editable={!busy} /><TextBody>The reviewing team verifies your details before connecting your profile.</TextBody><Button title="Send Link Request" loading={busy} disabled={busy || form.name.trim().length < 3} onPress={submit} /></Card> : null}
    {result.data?.filter(request => request.id !== pending?.id).map(request => <Card key={request.id}><Chip>{statusLabel(request.status)}</Chip><Text style={styles.heading}>{request.full_name}</Text><TextBody>{dateTime(request.created_at)}</TextBody>{request.review_note ? <Notice message={request.review_note} tone="info" /> : null}</Card>)}
    <Button title="Refresh Access" variant="secondary" disabled={busy || signingOut} loading={result.loading} onPress={() => { result.refresh(); void refreshAccount(); }} /><Button title="Sign Out" variant="secondary" disabled={busy || signingOut} loading={signingOut} onPress={() => void leave()} />
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { backgroundColor: '#eaf7f3', gap: 12 }, eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.1, color: '#147d73' },
  heading: { fontSize: 18, lineHeight: 25, fontWeight: '700', color: '#173f3b' }, section: { fontSize: 21, lineHeight: 28, fontWeight: '700', color: '#173f3b', flexShrink: 1 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  actionGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' }, flex: { flex: 1, minWidth: 135 },
  tags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' },
  service: { gap: 9 }, calendar: { width: 56, minHeight: 65, borderRadius: 14, backgroundColor: '#e3f4ef', alignItems: 'center', paddingVertical: 7 },
  month: { color: '#147d73', fontSize: 11, fontWeight: '700' }, day: { color: '#147d73', fontSize: 27, fontWeight: '800' },
  label: { color: '#5f7974', fontSize: 12, fontWeight: '600', marginBottom: 4 }, fact: { paddingVertical: 9, borderBottomColor: '#e7efed', borderBottomWidth: StyleSheet.hairlineWidth }, factValue: { fontSize: 15, lineHeight: 22, color: '#173f3b' },
  muted: { color: '#637d78', fontSize: 12, lineHeight: 18, flexShrink: 1 }, loading: { marginVertical: 18 },
  choices: { gap: 7 }, choice: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderColor: '#d9e8e3', borderWidth: 1, flexDirection: 'row', gap: 11, alignItems: 'center', backgroundColor: '#f8fbfa' },
  selectedChoice: { backgroundColor: '#e6f5f0', borderColor: '#81bdb0' }, pressed: { opacity: 0.75 }, check: { width: 21, height: 21, borderRadius: 6, borderColor: '#b9d4cb', borderWidth: 1, textAlign: 'center', fontSize: 14, color: '#fff', overflow: 'hidden' }, selectedCheck: { backgroundColor: '#147d73', borderColor: '#147d73' }, choiceName: { fontSize: 15, color: '#284d45', flex: 1 },
  pending: { backgroundColor: '#f5f1fd' }, comparisons: { gap: 10 }, comparison: { gap: 4, padding: 12, borderRadius: 12, backgroundColor: '#f6f9f8' }, oldValue: { color: '#6a807b', fontSize: 14, lineHeight: 21 }, newValue: { color: '#68549b', backgroundColor: '#efeafa', padding: 9, borderRadius: 8, fontSize: 15, lineHeight: 22 },
  stat: { color: '#147d73', fontSize: 38, fontWeight: '800' }, message: { minHeight: 150, textAlignVertical: 'top' },
});
