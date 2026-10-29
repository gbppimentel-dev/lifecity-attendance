import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import { dateTime, nameOf } from '../lib/format';
import { shareTextFile } from '../lib/files';
import { Screen, Card, Title, TextBody, Button, Field, Notice, Select, Chip, useToast } from '../ui';

type Account = { user_id: string; email: string | null; display_name: string; role: 'owner' | 'admin' | 'user'; status: 'active' | 'suspended'; member_id: string | null; member_name: string | null; member_number?: string | null; updated_at: string };
type Candidate = { id: string; first_name: string; last_name: string; member_number: string; email: string | null; mobile: string | null; status: string; updated_at: string; already_linked: boolean };
type Named = { id: string; name: string };
type Values = { first_name: string; last_name: string; email: string; churches: string[]; ministries: string[] };
type ProfileRequest = { id: string; member_id: string; base: Values; requested: Values; current_values?: Values | null; status: string; review_note: string; updated_at: string; created_at: string; account_email?: string; account_status?: string; linked_member_id?: string | null };
type LinkRequest = { id: string; user_id: string; full_name: string; member_number: string; contact: string; church: string; status: string; review_note: string; created_at: string; updated_at: string; email?: string; account_status?: string; account_updated_at?: string; linked_member_id?: string | null };
type Activity = { id: string; category: string; action: string; created_at: string; actor_name: string; actor_email: string | null; target_name: string; target_email: string | null; target_member_number?: string | null; before_value: Record<string, unknown>; after_value: Record<string, unknown> };
type Identity = { name: string; email: string | null };
type Feedback = { id: string; category: string; subject: string; message: string; anonymous: boolean; identity: Identity | null; status: string; page: string; created_at: string };
type Page<T> = { rows: T[]; total: number; page: number; page_size?: number; pending?: number };
const requestStatuses = [{ label: 'Pending Review', value: 'pending' }, { label: 'Approved', value: 'approved' }, { label: 'Declined', value: 'declined' }, { label: 'Cancelled', value: 'cancelled' }, { label: 'All Requests', value: 'all' }];
const ticketStatuses = [{ value: 'new', label: 'New' }, { value: 'reviewing', label: 'In Progress' }, { value: 'resolved', label: 'Completed' }, { value: 'closed', label: 'Considered' }];
const categories = [{ value: 'bug', label: 'Bug Report' }, { value: 'idea', label: 'Feature Idea' }, { value: 'improvement', label: 'Improvement' }, { value: 'other', label: 'Other' }];
const activityCategories = [{ value: 'all', label: 'All Categories' }, { value: 'access', label: 'Account Access' }, { value: 'links', label: 'Member Linking' }, { value: 'appearance', label: 'Appearance' }, { value: 'profiles', label: 'Member Profiles' }, { value: 'directory', label: 'Member Directory' }, { value: 'services', label: 'Services' }, { value: 'assignments', label: 'Churches & Ministries' }, { value: 'attendance', label: 'Attendance' }];
const statusName = (value: string) => [...requestStatuses, ...ticketStatuses].find(option => option.value === value)?.label || titleCase(value);
const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
function failureText(error: unknown) {
  const failure = error as { code?: string; message?: string };
  return failure?.code === 'P0001' && failure.message ? failure.message : failure?.code === 'PGRST202'
    ? 'This Owner feature is unavailable. Check the installed database updates.'
    : 'The action could not be confirmed. Refresh the current information before trying again.';
}
function useSearch() {
  const [search, setSearch] = useState(''), [query, setQuery] = useState('');
  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  return { search, setSearch, query, searching: search.trim() !== query };
}
function useRead<T>(rpc: string, args: Record<string, unknown>, enabled = true) {
  const focused = useIsFocused();
  const [data, setData] = useState<Page<T> | null>(null), [loadedKey, setLoadedKey] = useState(''), [loading, setLoading] = useState(enabled), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  const argsRef = useRef(args), sequence = useRef(0);
  argsRef.current = args;
  const key = JSON.stringify([rpc, args]);
  useEffect(() => {
    if (!focused || !enabled) { setLoading(false); return; }
    let alive = true;
    const id = ++sequence.current;
    setLoading(true); setError('');
    void (async () => {
      try {
        const result = await supabase.rpc(rpc, argsRef.current);
        if (result.error) throw result.error;
        if (!result.data || !Array.isArray(result.data.rows) || !Number.isInteger(result.data.total) || !Number.isInteger(result.data.page)) throw new Error('Invalid response');
        if (alive && id === sequence.current) { setData(result.data as Page<T>); setLoadedKey(key); }
      } catch (failure) { if (alive && id === sequence.current) { setData(null); setLoadedKey(''); setError(failureText(failure)); } }
      finally { if (alive && id === sequence.current) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [key, focused, enabled, revision]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state === 'active' && focused) setRevision(value => value + 1); });
    return () => subscription.remove();
  }, [focused]);
  return { data: enabled && loadedKey === key ? data : null, error, loading, refresh: () => setRevision(value => value + 1) };
}
function useWrite() {
  const { session, account } = useSession();
  const focused = useIsFocused();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), alive = useRef(true);
  const boundUid = session?.user.id;
  const live = useRef({ uid: boundUid, account, focused });
  live.current = { uid: boundUid, account, focused };
  const eligible = () => alive.current && !!boundUid && boundUid === live.current.uid
    && live.current.account?.user_id === boundUid && live.current.account.role === 'owner'
    && live.current.account.status === 'active' && live.current.focused && AppState.currentState === 'active';
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function run(work: () => PromiseLike<{ error: unknown }>, done: () => void) {
    if (lock.current || !eligible()) return;
    lock.current = true; setBusy(true); setError('');
    try { const result = await work(); if (result.error) throw result.error; if (eligible()) done(); }
    catch (failure) { if (eligible()) setError(failureText(failure)); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return { busy, error, run };
}
function Pager({ data, size, busy, onChange }: { data: Page<unknown>; size: number; busy: boolean; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(data.total / (data.page_size || size)));
  return <Card><TextBody>{data.total.toLocaleString()} Results · Page {data.page} of {pages}</TextBody>{pages > 1 ? <View style={styles.between}><Button title="Previous" variant="secondary" disabled={busy || data.page <= 1} onPress={() => onChange(data.page - 1)} /><Button title="Next" variant="secondary" disabled={busy || data.page >= pages} onPress={() => onChange(data.page + 1)} /></View> : null}</Card>;
}
function ReadState({ loading, error, empty }: { loading: boolean; error: string; empty: boolean }) {
  return <>{error ? <Notice message={error} tone="error" /> : null}{loading ? <ActivityIndicator color="#147d73" style={{ margin: 15 }} accessibilityLabel="Loading" /> : null}{!loading && !error && empty ? <Card><TextBody>No Matching Results</TextBody></Card> : null}</>;
}
function Fact({ label, value }: { label: string; value?: string | null }) { return <View style={styles.fact}><Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value || 'Not Provided'}</Text></View>; }
function VerifyCheck({ value, onChange, disabled }: { value: boolean; onChange: (value: boolean) => void; disabled: boolean }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value, disabled }} disabled={disabled} onPress={() => onChange(!value)} style={[styles.verify, value && styles.verified]}><Text style={styles.check}>{value ? '✓' : '○'}</Text><Text style={styles.verifyText}>I verified that this person owns the selected member profile.</Text></Pressable>;
}

export default function OwnerScreen() {
  const { account } = useSession();
  const [tab, setTab] = useState('accounts');
  if (account?.role !== 'owner' || account.status !== 'active') return <Screen><Notice message="Active Owner access is required." tone="error" /></Screen>;
  return <Screen><Card style={styles.hero}><Text style={styles.eyebrow}>OWNER WORKSPACE</Text><Title>Accounts & Access</Title><TextBody>Manage logins, review requests and monitor saved activity.</TextBody><Chip>Owner Controls</Chip></Card>
    <Select label="Workspace" value={tab} onChange={setTab} options={[{ label: 'Accounts', value: 'accounts' }, { label: 'Profile Requests', value: 'profiles' }, { label: 'Member Link Requests', value: 'links' }, { label: 'Activity History', value: 'activity' }, { label: 'App Feedback', value: 'feedback' }]} />
    {tab === 'accounts' ? <Accounts key={account.user_id} /> : tab === 'profiles' ? <ProfileRequests /> : tab === 'links' ? <LinkRequests /> : tab === 'activity' ? <ActivityHistory /> : <FeedbackInbox />}
  </Screen>;
}

function CandidateSearch({ selected, onSelect, disabled, blocked = false }: { selected: Candidate | null; onSelect: (candidate: Candidate | null) => void; disabled: boolean; blocked?: boolean }) {
  const search = useSearch();
  const [page, setPage] = useState(1);
  const result = useRead<Candidate>('lc_owner_member_candidates', { p_search: search.query, p_page: page }, search.query.length >= 2 && !blocked);
  const visible = !search.searching ? result.data : null;
  return <><Field label="Find Existing Members" value={search.search} onChangeText={value => { search.setSearch(value); setPage(1); onSelect(null); }} placeholder="Member number, name, email or mobile" editable={!disabled && !blocked} maxLength={200} />
    {search.query.length < 2 ? <TextBody>Enter at least two characters.</TextBody> : <ReadState loading={(result.loading || search.searching) && !visible} error={result.error} empty={visible?.rows.length === 0} />}
    {visible?.rows.map(candidate => <Pressable key={candidate.id} accessibilityRole="radio" accessibilityState={{ selected: selected?.id === candidate.id, disabled: disabled || blocked || candidate.already_linked }} disabled={disabled || blocked || candidate.already_linked} onPress={() => onSelect(candidate)} style={[styles.candidate, selected?.id === candidate.id && styles.selected, candidate.already_linked && styles.dim]}><Text style={styles.heading}>{nameOf(candidate)}</Text><TextBody>{candidate.member_number} · {titleCase(candidate.status)}{candidate.already_linked ? ' · Already Linked' : ''}</TextBody><TextBody>{candidate.email || 'No Email'} · {candidate.mobile || 'No Mobile'}</TextBody></Pressable>)}
    {visible ? <Pager data={visible} size={25} busy={disabled || result.loading || search.searching} onChange={value => { setPage(value); onSelect(null); }} /> : null}
  </>;
}

function Accounts() {
  const { account, refreshAccount } = useSession();
  const search = useSearch();
  const [page, setPage] = useState(1), [role, setRole] = useState('all'), [status, setStatus] = useState('all'), [link, setLink] = useState('all'), [linkTarget, setLinkTarget] = useState<Account | null>(null);
  const result = useRead<Account>('lc_owner_accounts_page', { p_search: search.query, p_page: page, p_role: role, p_status: status, p_link: link, p_size: 25 });
  const { busy, error, run } = useWrite();
  const toast = useToast();
  const data = !search.searching ? result.data : null;
  const blocked = busy || result.loading || search.searching;
  function changeAccess(row: Account, action: 'grant_admin' | 'revoke_admin' | 'suspend' | 'reactivate') {
    if (row.role === 'owner' || row.user_id === account?.user_id || blocked) return;
    const labels = { grant_admin: 'Grant Admin', revoke_admin: 'Remove Admin', suspend: 'Suspend Access', reactivate: 'Reactivate Access' };
    const details = action === 'grant_admin' ? 'This grants access to members, services, scanning, records and exports. Owner controls remain protected.' : action === 'revoke_admin' ? 'This removes the staff workspace. The account and linked member record stay available.' : action === 'suspend' ? 'This blocks account access without deleting the member profile or attendance.' : 'This restores access to this account.';
    Alert.alert(`${labels[action]}?`, `${row.display_name || row.email}\n\n${details}`, [{ text: 'Cancel', style: 'cancel' }, { text: labels[action], style: action === 'suspend' ? 'destructive' : 'default', onPress: () => void run(() => supabase.rpc('lc_owner_change_access', { p_user_id: row.user_id, p_action: action, p_expected_updated_at: row.updated_at }), () => { toast.show(`${labels[action]} Completed`); result.refresh(); }) }]);
  }
  return <><Card><Text style={styles.section}>Accounts</Text><TextBody>Account access is separate from member Active/Inactive status.</TextBody><Field label="Find an Account" value={search.search} onChangeText={value => { search.setSearch(value); setPage(1); }} editable={!busy} placeholder="Name, email, member or account ID" /><Select label="Role" value={role} disabled={busy} onChange={value => { setRole(value); setPage(1); }} options={[{ label: 'All Roles', value: 'all' }, { label: 'Owner', value: 'owner' }, { label: 'Admin', value: 'admin' }, { label: 'User', value: 'user' }]} /><Select label="Access" value={status} disabled={busy} onChange={value => { setStatus(value); setPage(1); }} options={[{ label: 'All Access', value: 'all' }, { label: 'Active', value: 'active' }, { label: 'Suspended', value: 'suspended' }]} /><Select label="Member Link" value={link} disabled={busy} onChange={value => { setLink(value); setPage(1); }} options={[{ label: 'All Accounts', value: 'all' }, { label: 'Linked Members', value: 'linked' }, { label: 'Not Linked', value: 'unlinked' }]} /><Button title="Refresh Accounts" variant="secondary" disabled={busy} loading={result.loading} onPress={result.refresh} /></Card>
    <ReadState loading={(result.loading || search.searching) && !data} error={error || result.error} empty={data?.rows.length === 0} />
    {data?.rows.map(row => <Card key={row.user_id}><Text style={styles.heading}>{row.display_name || row.email}{row.user_id === account?.user_id ? ' · You' : ''}</Text><TextBody>{row.email}</TextBody><View style={styles.between}><Chip>{titleCase(row.role)}</Chip><Chip>{titleCase(row.status)}</Chip></View><Fact label="Linked Member" value={row.member_id ? `${row.member_name || 'Connected'}${row.member_number ? ` · ${row.member_number}` : ''}` : 'Not Linked'} /><Button title={row.member_id ? 'Unlink Member' : 'Link Member'} variant="secondary" disabled={blocked} onPress={() => setLinkTarget(row)} />{row.role === 'owner' || row.user_id === account?.user_id ? <TextBody>Your Role & Access Are Protected</TextBody> : <View style={styles.buttons}><Button title={row.role === 'admin' ? 'Remove Admin' : 'Grant Admin'} variant="secondary" disabled={blocked} onPress={() => changeAccess(row, row.role === 'admin' ? 'revoke_admin' : 'grant_admin')} /><Button title={row.status === 'active' ? 'Suspend Access' : 'Reactivate Access'} variant={row.status === 'active' ? 'danger' : 'secondary'} disabled={blocked} onPress={() => changeAccess(row, row.status === 'active' ? 'suspend' : 'reactivate')} /></View>}</Card>)}
    {data ? <Pager data={data} size={25} busy={blocked} onChange={setPage} /> : null}
    {linkTarget ? <AccountLink account={linkTarget} onClose={() => setLinkTarget(null)} onDone={() => { setLinkTarget(null); result.refresh(); void refreshAccount(); }} /> : null}
  </>;
}

function AccountLink({ account, onClose, onDone }: { account: Account; onClose: () => void; onDone: () => void }) {
  const [candidate, setCandidate] = useState<Candidate | null>(null), [verified, setVerified] = useState(false);
  const { busy, error, run } = useWrite();
  const toast = useToast();
  function save() {
    if (!account.member_id && (!candidate || !verified || candidate.already_linked)) return;
    Alert.alert(account.member_id ? 'Unlink This Member?' : 'Connect This Member?', account.member_id ? `${account.member_name || 'This member'} will no longer be linked to ${account.email || account.display_name}. Their profile and attendance remain saved.` : `${account.email || account.display_name}\n→ ${nameOf(candidate)} · ${candidate!.member_number}`, [{ text: 'Cancel', style: 'cancel' }, { text: account.member_id ? 'Unlink' : 'Connect', onPress: () => void run(() => supabase.rpc('lc_owner_set_member_link', { p_user_id: account.user_id, p_member_id: account.member_id ? null : candidate!.id, p_expected_updated_at: account.updated_at, p_expected_member_updated_at: account.member_id ? null : candidate!.updated_at }), () => { toast.show(account.member_id ? 'Member Unlinked' : 'Member Linked'); onDone(); }) }]);
  }
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) onClose(); }}><Screen topInset><Button title="Close" variant="secondary" disabled={busy} onPress={onClose} /><Title>{account.member_id ? 'Unlink Member' : 'Link Member'}</Title><Card><Fact label="Login Account" value={account.email || account.display_name} />{account.member_id ? <Fact label="Current Member" value={account.member_name} /> : <><CandidateSearch selected={candidate} onSelect={value => { setCandidate(value); setVerified(false); }} disabled={busy} />{candidate ? <><Fact label="Member to Connect" value={`${nameOf(candidate)} · ${candidate.member_number}`} /><VerifyCheck value={verified} onChange={setVerified} disabled={busy} /></> : null}</>}<TextBody>Linking changes the connection only. Contact details, roles and attendance remain saved.</TextBody>{error ? <Notice message={error} tone="error" /> : null}<Button title={account.member_id ? 'Confirm Unlink' : 'Confirm Link'} loading={busy} disabled={busy || (!account.member_id && (!candidate || !verified))} onPress={save} /></Card></Screen></Modal>;
}

const profileKeys = ['first_name', 'last_name', 'email', 'churches', 'ministries'] as const;
const profileLabels: Record<keyof Values, string> = { first_name: 'First Name', last_name: 'Last Name', email: 'Profile Email', churches: 'Churches', ministries: 'Ministries' };
const same = (first: unknown, second: unknown) => JSON.stringify(first) === JSON.stringify(second);
type Catalog = { churches: Named[]; ministries: Named[] };
function profileValue(value: Values, field: keyof Values, catalog: Catalog) {
  return field === 'churches' || field === 'ministries' ? value[field].map(id => catalog[field].find(item => item.id === id)?.name || 'Unavailable Entry').join(' · ') || 'None' : value[field] || 'Not Provided';
}
function ProfileRequests() {
  const [status, setStatus] = useState('pending'), [page, setPage] = useState(1);
  const search = useSearch();
  const result = useRead<ProfileRequest>('lc_owner_profile_requests_search', { p_status: status, p_page: page, p_search: search.query });
  const data = !search.searching ? result.data as (Page<ProfileRequest> & Catalog) | null : null;
  return <><Card><Text style={styles.section}>Profile Change Requests</Text><Select label="Status" value={status} onChange={value => { setStatus(value); setPage(1); }} options={requestStatuses} /><Field label="Search Requests" value={search.search} onChangeText={value => { search.setSearch(value); setPage(1); }} placeholder="Name, email or member ID" /><Button title="Refresh Requests" variant="secondary" loading={result.loading} onPress={result.refresh} /></Card><ReadState loading={(result.loading || search.searching) && !data} error={result.error} empty={data?.rows.length === 0} />
    {data?.rows.map(request => <ProfileReview key={`${request.id}:${request.updated_at}`} request={request} catalog={{ churches: data.churches || [], ministries: data.ministries || [] }} blocked={result.loading || search.searching} onDone={result.refresh} />)}
    {data ? <Pager data={data} size={20} busy={result.loading || search.searching} onChange={setPage} /> : null}
  </>;
}
function ProfileReview({ request, catalog, blocked, onDone }: { request: ProfileRequest; catalog: Catalog; blocked: boolean; onDone: () => void }) {
  const [note, setNote] = useState('');
  const { busy, error, run } = useWrite();
  const toast = useToast();
  const fields = profileKeys.filter(key => !same(request.base[key], request.requested[key]));
  const conflict = !request.current_values || fields.some(key => !same(request.current_values?.[key], request.base[key]));
  const approvalBlocked = conflict || request.account_status !== 'active' || request.linked_member_id !== request.member_id;
  function review(decision: 'approved' | 'declined') {
    if (busy || blocked || (decision === 'approved' && approvalBlocked) || (decision === 'declined' && note.trim().length < 3)) return;
    Alert.alert(decision === 'approved' ? 'Approve These Changes?' : 'Decline This Request?', decision === 'approved' ? 'The requested fields will update this member profile.' : 'The member will see your review message.', [{ text: 'Cancel', style: 'cancel' }, { text: decision === 'approved' ? 'Approve Changes' : 'Decline', onPress: () => void run(() => supabase.rpc('lc_review_profile_request', { p_id: request.id, p_decision: decision, p_expected_updated_at: request.updated_at, p_note: note.trim() }), () => { toast.show('Profile Request Reviewed'); onDone(); }) }]);
  }
  return <Card><View style={styles.between}><Text style={styles.heading}>{request.base.first_name} {request.base.last_name}</Text><Chip>{statusName(request.status)}</Chip></View><TextBody>{request.account_email}</TextBody><TextBody>{dateTime(request.created_at)}</TextBody>{fields.map(field => <View style={styles.comparison} key={field}><Text style={styles.label}>{profileLabels[field]}</Text><Text style={styles.caption}>{request.current_values && request.status === 'pending' ? 'Current' : 'At Submission'}</Text><Text selectable style={styles.value}>{profileValue(request.status === 'pending' && request.current_values ? request.current_values : request.base, field, catalog)}</Text>{request.current_values && !same(request.current_values[field], request.base[field]) ? <Text style={styles.warning}>Changed Since Request</Text> : null}<Text style={styles.caption}>Requested</Text><Text selectable style={styles.requested}>{profileValue(request.requested, field, catalog)}</Text></View>)}
    {request.review_note ? <Notice message={request.review_note} tone="info" /> : null}{error ? <Notice message={error} tone="error" /> : null}
    {request.status === 'pending' ? <>{approvalBlocked ? <Notice message="The profile, access or member connection has changed. Refresh before approving, or decline with a message." tone="info" /> : null}<Field label="Message to Member (Required to Decline)" value={note} onChangeText={setNote} maxLength={500} multiline editable={!busy && !blocked} /><Button title="Approve Changes" disabled={busy || blocked || approvalBlocked} loading={busy} onPress={() => review('approved')} /><Button title="Decline Request" variant="secondary" disabled={busy || blocked || note.trim().length < 3} onPress={() => review('declined')} /></> : null}
  </Card>;
}

function LinkRequests() {
  const [status, setStatus] = useState('pending'), [page, setPage] = useState(1), [review, setReview] = useState<LinkRequest | null>(null);
  const search = useSearch();
  const result = useRead<LinkRequest>('lc_owner_member_requests_search', { p_status: status, p_page: page, p_search: search.query });
  const data = !search.searching ? result.data : null;
  return <><Card><Text style={styles.section}>Member Link Requests</Text><TextBody>Verify an account before connecting its member profile.</TextBody><Select label="Status" value={status} onChange={value => { setStatus(value); setPage(1); }} options={requestStatuses} /><Field label="Search Requests" value={search.search} onChangeText={value => { search.setSearch(value); setPage(1); }} placeholder="Name, email or member ID" /><Button title="Refresh Requests" variant="secondary" loading={result.loading} onPress={result.refresh} /></Card><ReadState loading={(result.loading || search.searching) && !data} error={result.error} empty={data?.rows.length === 0} />
    {data?.rows.map(request => <Card key={request.id}><View style={styles.between}><Text style={styles.heading}>{request.full_name}</Text><Chip>{statusName(request.status)}</Chip></View><TextBody>{request.email}</TextBody><Fact label="Member Number" value={request.member_number} /><Fact label="Contact" value={request.contact} /><Fact label="Church" value={request.church} /><TextBody>{dateTime(request.created_at)}</TextBody>{request.review_note ? <Notice message={request.review_note} tone="info" /> : null}{request.status === 'pending' ? <Button title="Review Member Link" variant="secondary" disabled={result.loading || search.searching} onPress={() => setReview(request)} /> : null}</Card>)}
    {data ? <Pager data={data} size={25} busy={result.loading || search.searching} onChange={setPage} /> : null}
    {review ? <LinkReview request={review} onClose={() => setReview(null)} onDone={() => { setReview(null); result.refresh(); }} /> : null}
  </>;
}
function LinkReview({ request, onClose, onDone }: { request: LinkRequest; onClose: () => void; onDone: () => void }) {
  const [candidate, setCandidate] = useState<Candidate | null>(null), [verified, setVerified] = useState(false), [note, setNote] = useState('');
  const { busy, error, run } = useWrite();
  const toast = useToast();
  const blocked = request.account_status !== 'active' || !!request.linked_member_id;
  function review(decision: 'approved' | 'declined') {
    if (busy || (decision === 'approved' && (!candidate || !verified || candidate.already_linked || blocked)) || (decision === 'declined' && note.trim().length < 3)) return;
    Alert.alert(decision === 'approved' ? 'Approve This Member Link?' : 'Decline This Request?', decision === 'approved' ? `${request.email || request.full_name}\n→ ${nameOf(candidate)} · ${candidate!.member_number}` : 'The applicant will see your message.', [{ text: 'Cancel', style: 'cancel' }, { text: decision === 'approved' ? 'Approve Link' : 'Decline', onPress: () => void run(() => supabase.rpc('lc_review_member_request', { p_id: request.id, p_decision: decision, p_expected_updated_at: request.updated_at, p_expected_account_updated_at: request.account_updated_at, p_member_id: decision === 'approved' ? candidate!.id : null, p_expected_member_updated_at: decision === 'approved' ? candidate!.updated_at : null, p_note: note.trim() }), () => { toast.show('Member Link Request Reviewed'); onDone(); }) }]);
  }
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) onClose(); }}><Screen topInset><Button title="Close Review" variant="secondary" disabled={busy} onPress={onClose} /><Title>Verify Member Connection</Title><Card><Fact label="Login Account" value={request.email} /><Fact label="Requested Name" value={request.full_name} /><Fact label="Provided Contact" value={request.contact} /><Fact label="Provided Church" value={request.church} />{blocked ? <Notice message="This account is suspended or already linked. Approval is unavailable; review the account or decline with a message." tone="info" /> : <><CandidateSearch selected={candidate} disabled={busy} onSelect={value => { setCandidate(value); setVerified(false); }} />{candidate ? <><Fact label="Member to Connect" value={`${nameOf(candidate)} · ${candidate.member_number}`} /><VerifyCheck value={verified} onChange={setVerified} disabled={busy} /></> : null}</>}<Field label="Message to Applicant (Required to Decline)" value={note} onChangeText={setNote} maxLength={500} multiline editable={!busy} />{error ? <Notice message={error} tone="error" /> : null}<Button title="Approve Link" loading={busy} disabled={busy || blocked || !candidate || !verified} onPress={() => review('approved')} /><Button title="Decline Request" variant="secondary" disabled={busy || note.trim().length < 3} onPress={() => review('declined')} /></Card></Screen></Modal>;
}

function printable(value: unknown): string {
  return value == null || value === '' ? 'Not Provided' : Array.isArray(value) ? value.length ? value.map(printable).join(', ') : 'None' : typeof value === 'object' ? JSON.stringify(value) : typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value);
}
function activityTitle(value: string) { return ({ attendance_insert: 'Check-In Recorded', attendance_delete: 'Check-In Removed', member_insert: 'Member Created', member_update: 'Member Updated', service_insert: 'Service Created', service_update: 'Service Updated', grant_admin: 'Admin Access Granted', revoke_admin: 'Admin Access Removed', suspend: 'Access Suspended', reactivate: 'Access Reactivated' } as Record<string, string>)[value] || titleCase(value); }
function csvCell(value: unknown) { let text = value == null ? '' : String(value); if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; }
function ActivityHistory() {
  const search = useSearch();
  const [category, setCategory] = useState('all'), [days, setDays] = useState('30'), [order, setOrder] = useState('newest'), [page, setPage] = useState(1), [expanded, setExpanded] = useState<string | null>(null), [exporting, setExporting] = useState(false), [exportError, setExportError] = useState('');
  const result = useRead<Activity>('lc_owner_activity', { p_search: search.query, p_category: category, p_days: Number(days), p_page: page, p_size: 25, p_oldest: order === 'oldest' });
  const data = !search.searching ? result.data : null;
  const exportLock = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function exportActivity() {
    if (exportLock.current || result.loading || search.searching) return;
    exportLock.current = true; setExporting(true); setExportError('');
    try {
      const response = await supabase.rpc('lc_export_activity', { p_search: search.query, p_category: category, p_days: Number(days), p_oldest: order === 'oldest', p_detailed: true });
      if (response.error) throw response.error;
      if (!response.data || !Array.isArray(response.data.rows) || typeof response.data.as_of !== 'string') throw new Error('Invalid export');
      if (!alive.current) return;
      const rows = response.data.rows as Activity[];
      const lines: unknown[][] = [['Time (Manila)', 'Category', 'Activity', 'Changed By', 'Changed By Email', 'Affected', 'Member Number', 'Before', 'After', 'Exported At (UTC)'], ...rows.map(row => [dateTime(row.created_at), activityCategories.find(option => option.value === row.category)?.label || row.category, activityTitle(row.action), row.actor_name, row.actor_email, row.target_name, row.target_member_number, JSON.stringify(row.before_value), JSON.stringify(row.after_value), response.data.as_of])];
      await shareTextFile(`LifeCity-Activity-${new Date().toISOString().slice(0, 10)}.csv`, '\uFEFF' + lines.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n');
    } catch (failure) { if (alive.current) setExportError(failureText(failure)); }
    finally { exportLock.current = false; if (alive.current) setExporting(false); }
  }
  return <><Card><Text style={styles.section}>Activity History</Text><TextBody>Review saved changes. All times are in Manila.</TextBody><Field label="Find Activity" value={search.search} onChangeText={value => { search.setSearch(value); setPage(1); }} placeholder="Person, email or action" editable={!exporting} /><Select label="Category" value={category} disabled={exporting} onChange={value => { setCategory(value); setPage(1); }} options={activityCategories} /><Select label="Period" value={days} disabled={exporting} onChange={value => { setDays(value); setPage(1); }} options={[{ label: 'Last 7 Days', value: '7' }, { label: 'Last 30 Days', value: '30' }, { label: 'Last 90 Days', value: '90' }, { label: 'All Time', value: '0' }]} /><Select label="Order" value={order} disabled={exporting} onChange={value => { setOrder(value); setPage(1); }} options={[{ label: 'Newest First', value: 'newest' }, { label: 'Oldest First', value: 'oldest' }]} /><Button title="Refresh Activity" variant="secondary" disabled={exporting} loading={result.loading} onPress={result.refresh} /><Button title="Share Detailed CSV" variant="secondary" loading={exporting} disabled={result.loading || search.searching || !!result.error} onPress={() => void exportActivity()} /><TextBody>Exports matching activity across all pages, up to 10,000 entries.</TextBody></Card><ReadState loading={(result.loading || search.searching) && !data} error={exportError || result.error} empty={data?.rows.length === 0} />
    {data?.rows.map(row => <Card key={row.id}><Chip>{activityCategories.find(option => option.value === row.category)?.label || row.category}</Chip><Text style={styles.heading}>{activityTitle(row.action)}</Text><TextBody>{dateTime(row.created_at)}</TextBody><Fact label="Changed By" value={row.actor_name} /><Fact label="Affected" value={`${row.target_name || 'Record'}${row.target_member_number ? ` · ${row.target_member_number}` : ''}`} /><Button title={expanded === row.id ? 'Hide Changes' : 'View Changes'} variant="secondary" onPress={() => setExpanded(value => value === row.id ? null : row.id)} />{expanded === row.id ? [...new Set([...Object.keys(row.before_value || {}), ...Object.keys(row.after_value || {})])].filter(key => !same(row.before_value?.[key], row.after_value?.[key])).map(key => <View style={styles.comparison} key={key}><Text style={styles.label}>{key === 'VIP' ? 'Starred' : key}</Text><Text style={styles.caption}>Before</Text><Text selectable style={styles.value}>{printable(row.before_value?.[key])}</Text><Text style={styles.caption}>After</Text><Text selectable style={styles.requested}>{printable(row.after_value?.[key])}</Text></View>) : null}</Card>)}
    {data ? <Pager data={data} size={25} busy={result.loading || search.searching || exporting} onChange={setPage} /> : null}
  </>;
}

function FeedbackInbox() {
  const focused = useIsFocused();
  const { session, account } = useSession();
  const [status, setStatus] = useState('all'), [category, setCategory] = useState('all'), [page, setPage] = useState(1), [expanded, setExpanded] = useState<string | null>(null), [identities, setIdentities] = useState<Record<string, Identity>>({});
  const search = useSearch();
  const result = useRead<Feedback>('lc_feedback_page', { p_status: status, p_category: category, p_query: search.query, p_page: page });
  const { busy, error, run } = useWrite();
  const data = !search.searching ? result.data : null;
  const toast = useToast();
  const alive = useRef(true), identityLock = useRef(false), epoch = useRef(0);
  const boundUid = session?.user.id, viewKey = JSON.stringify([status, category, search.query, page]);
  const live = useRef({ uid: boundUid, account, focused, viewKey });
  live.current = { uid: boundUid, account, focused, viewKey };
  const canReadIdentity = () => alive.current && !!boundUid && boundUid === live.current.uid && live.current.account?.user_id === boundUid
    && live.current.account.role === 'owner' && live.current.account.status === 'active'
    && live.current.focused && live.current.viewKey === viewKey && AppState.currentState === 'active';
  const [revealing, setRevealing] = useState(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; epoch.current++; }; }, []);
  useEffect(() => { epoch.current++; setIdentities({}); setExpanded(null); }, [status, category, search.query, page]);
  useEffect(() => { if (!focused) { epoch.current++; setIdentities({}); } }, [focused]);
  useEffect(() => { const subscription = AppState.addEventListener('change', state => { if (state !== 'active') { epoch.current++; setIdentities({}); } }); return () => subscription.remove(); }, []);
  function reveal(row: Feedback) {
    if (identities[row.id]) { setIdentities(previous => { const next = { ...previous }; delete next[row.id]; return next; }); return; }
    Alert.alert('Reveal Sender Identity?', 'This feedback was submitted anonymously. Only the Owner can reveal the sender.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Reveal Identity', onPress: () => {
      if (identityLock.current || !canReadIdentity()) return;
      const started = epoch.current;
      identityLock.current = true; setRevealing(true);
      void (async () => { try { const response = await supabase.rpc('lc_feedback_identity', { p_id: row.id }); if (response.error) throw response.error; if (!response.data || typeof response.data.name !== 'string') throw new Error('Invalid identity'); if (canReadIdentity() && epoch.current === started) setIdentities(previous => ({ ...previous, [row.id]: response.data as Identity })); } catch { if (canReadIdentity() && epoch.current === started) toast.show('Sender Identity Could Not Be Loaded'); } finally { identityLock.current = false; if (alive.current) setRevealing(false); } })();
    } }]);
  }
  function changeStatus(row: Feedback, next: string) {
    if (busy || result.loading || search.searching || next === row.status) return;
    Alert.alert('Update Ticket Status?', `${row.subject}\n${statusName(row.status)} → ${statusName(next)}`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Update', onPress: () => void run(() => supabase.rpc('lc_feedback_set_status', { p_id: row.id, p_status: next }), () => { toast.show('Ticket Status Updated'); result.refresh(); }) }]);
  }
  const blocked = busy || revealing || result.loading || search.searching;
  return <><Card><Text style={styles.section}>App Feedback</Text><TextBody>Review tickets and update their status. Senders see updates in their member space.</TextBody><Select label="Status" value={status} disabled={busy || revealing} onChange={value => { setStatus(value); setPage(1); }} options={[{ label: 'All Statuses', value: 'all' }, ...ticketStatuses]} /><Select label="Category" value={category} disabled={busy || revealing} onChange={value => { setCategory(value); setPage(1); }} options={[{ label: 'All Categories', value: 'all' }, ...categories]} /><Field label="Search Feedback" value={search.search} onChangeText={value => { search.setSearch(value); setPage(1); }} maxLength={200} editable={!busy && !revealing} placeholder="Subject or message" /><Button title="Refresh Feedback" variant="secondary" disabled={busy || revealing} loading={result.loading} onPress={() => { epoch.current++; setIdentities({}); result.refresh(); }} /></Card><ReadState loading={(result.loading || search.searching) && !data} error={error || result.error} empty={data?.rows.length === 0} />
    {data?.rows.map(row => {
      const identity = row.anonymous ? identities[row.id] : row.identity;
      return <Card key={row.id}><View style={styles.between}><Chip>{statusName(row.status)}</Chip><Chip>{categories.find(option => option.value === row.category)?.label || row.category}</Chip></View><Text style={styles.heading}>{row.subject}</Text><TextBody>{dateTime(row.created_at)}</TextBody><Text style={styles.caption}>#{row.id.slice(0, 8).toUpperCase()}</Text><Fact label="Sender" value={identity ? `${identity.name}${identity.email ? ` · ${identity.email}` : ''}` : 'Identity Hidden'} />{row.anonymous ? <Button title={identity ? 'Hide Sender Identity' : 'Reveal Sender Identity'} variant="secondary" disabled={blocked} onPress={() => reveal(row)} /> : null}<Button title={expanded === row.id ? 'Hide Message' : 'Read Message'} variant="secondary" onPress={() => setExpanded(value => value === row.id ? null : row.id)} />{expanded === row.id ? <View style={styles.comparison}><Text selectable style={styles.value}>{row.message}</Text>{row.page ? <Text style={styles.caption}>Submitted From: {row.page}</Text> : null}</View> : null}<Select label="Ticket Status" value={row.status} disabled={blocked} options={ticketStatuses} onChange={next => changeStatus(row, next)} />{row.status !== 'resolved' ? <Button title="Mark Complete" disabled={blocked} onPress={() => changeStatus(row, 'resolved')} /> : null}</Card>;
    })}
    {data ? <Pager data={data} size={20} busy={blocked} onChange={setPage} /> : null}
  </>;
}

const styles = StyleSheet.create({
  hero: { backgroundColor: '#eaf7f3' }, eyebrow: { color: '#147d73', fontSize: 11, letterSpacing: 1, fontWeight: '700' },
  section: { fontSize: 21, lineHeight: 28, color: '#173f3b', fontWeight: '700' }, heading: { fontSize: 17, lineHeight: 24, color: '#173f3b', fontWeight: '700', flexShrink: 1 },
  between: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }, buttons: { gap: 8 },
  fact: { gap: 4, paddingVertical: 5 }, label: { fontSize: 12, lineHeight: 18, fontWeight: '600', color: '#648079' }, value: { fontSize: 15, lineHeight: 22, color: '#173f3b' }, caption: { fontSize: 11, lineHeight: 17, color: '#6d827c' },
  candidate: { borderColor: '#d4e5df', borderWidth: 1, borderRadius: 14, padding: 13, gap: 4, backgroundColor: '#f9fcfa', minHeight: 70 }, selected: { borderColor: '#147d73', backgroundColor: '#e4f4ed' }, dim: { opacity: .5 },
  verify: { minHeight: 58, borderColor: '#d6e7df', borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#f8fbf9' }, verified: { backgroundColor: '#e4f4ed', borderColor: '#81b5a8' }, check: { color: '#147d73', fontSize: 23, fontWeight: '700' }, verifyText: { flex: 1, color: '#315b4e', fontSize: 14, lineHeight: 21 },
  comparison: { padding: 13, borderRadius: 14, backgroundColor: '#f6f9f7', gap: 5 }, requested: { padding: 9, borderRadius: 9, color: '#69549a', backgroundColor: '#efeafa', fontSize: 15, lineHeight: 22 }, warning: { color: '#9c7027', fontSize: 12, lineHeight: 18 },
});
