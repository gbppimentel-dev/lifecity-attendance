import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useIsFocused } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/session'
import { isStaff } from '../lib/account'
import { Button, Card, Empty, Field, HoldButton, Notice, Row, Screen, Select, TextBody, Title, useToast } from '../ui'
import { dateTime } from '../lib/format'
import { MemberQR } from '../components/MemberQR'
import { setMemberStatusWithUndo } from '../../../../src/lib/memberStatusActions'
import { saveMemberAdminNote } from '../../../../src/lib/memberNotes'
import { deleteDirectoryEntryWithUndo } from '../../../../src/lib/directoryActions'

type Named = { id: string; name: string }
type Member = {
  id: string; member_number: string; first_name: string; last_name: string; email: string | null; mobile: string | null
  status: 'active' | 'inactive'; qr_token: string; is_starred: boolean; admin_note: string | null; created_at: string
  member_ministries: { ministry_id: string; ministries: Named | null }[]
  member_branches: { branch_id: string; branches: Named | null }[]
}
type Directory = { rows: Member[]; ministries: Named[]; branches: Named[]; total: number; registered: number; active: number; page: number; ministry_counts: Record<string, number>; branch_counts: Record<string, number> }
type Contact = { first_name: string; last_name: string; email: string; mobile: string }
type Attendance = { id: string; checked_in_at: string; report_snapshot?: { service_name?: string } | null; events: { name: string } | null }
const size = 20
const fullName = (m: Member) => `${m.first_name} ${m.last_name}`.trim()
const churches = (m: Member) => (m.member_branches || []).flatMap(g => g.branches ? [g.branches.name] : [])
const ministries = (m: Member) => (m.member_ministries || []).flatMap(g => g.ministries ? [g.ministries.name] : [])
const qrProfile = (m: Member) => ({ ...m, churches: churches(m), ministries: ministries(m) })
const failure = (e: unknown) => (e as { message?: string })?.message || 'The change could not be confirmed. Refresh and try again.'

export default function MembersScreen() {
  const toast = useToast(), [data, setData] = useState<Directory | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const { account, session } = useSession(), focused = useIsFocused()
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [status, setStatus] = useState('all'), [ministry, setMinistry] = useState('all'), [church, setChurch] = useState('all'), [sort, setSort] = useState('name-asc'), [page, setPage] = useState(1), [filters, setFilters] = useState(false)
  const [panel, setPanel] = useState<{ kind: 'profile' | 'note' | 'qr' | 'contact'; member: Member } | null>(null)
  const [note, setNote] = useState(''), [contact, setContact] = useState<Contact>({ first_name: '', last_name: '', email: '', mobile: '' }), [panelError, setPanelError] = useState('')
  const [busy, setBusy] = useState(false), [busyRow, setBusyRow] = useState(''), [manage, setManage] = useState<'ministries' | 'branches' | null>(null)
  const [qrVerified, setQrVerified] = useState(false), [qrReading, setQrReading] = useState(false)
  const qrGeneration = useRef(0), desiredQr = useRef<Member | null>(null)
  const alive = useRef(true), seq = useRef(0), lock = useRef(false), versions = useRef(new Map<string, number>())
  const actor = useRef({ uid: session?.user.id, allowed: isStaff(account), focused }); actor.current = { uid: session?.user.id, allowed: isStaff(account) && account?.user_id === session?.user.id, focused }
  function permitted(requireFocus = true) { return alive.current && actor.current.allowed && !!actor.current.uid && (!requireFocus || actor.current.focused) && AppState.currentState === 'active' }
  const current = useRef({ query, status, ministry, church, sort, page }); current.current = { query, status, ministry, church, sort, page }
  useEffect(() => { alive.current = true; return () => { alive.current = false; seq.current++ } }, [])
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { qrGeneration.current++; setQrVerified(false); setQrReading(false) }
      else if (desiredQr.current && actor.current.focused) void verifyQr(desiredQr.current)
    })
    return () => { subscription.remove(); qrGeneration.current++; desiredQr.current = null }
  }, [])
  useEffect(() => { if (!focused) { qrGeneration.current++; desiredQr.current = null; setQrVerified(false); setQrReading(false); setPanel(null) } }, [focused])
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(1) }, 300); return () => clearTimeout(timer) }, [search])
  const load = useCallback(async () => {
    if (!alive.current) return
    const request = ++seq.current, f = current.current
    setLoading(true); setError('')
    try {
      const result = await supabase.rpc('lc_members_page', { p_search: f.query, p_status: f.status, p_ministry: f.ministry, p_church: f.church, p_sort: f.sort, p_page: f.page, p_size: size })
      if (result.error) throw result.error
      if (!result.data || !Array.isArray(result.data.rows) || !Array.isArray(result.data.ministries) || !Array.isArray(result.data.branches) || typeof result.data.total !== 'number') throw Error('Invalid directory response.')
      if (alive.current && request === seq.current) setData(result.data as Directory)
    } catch (e) { if (alive.current && request === seq.current) setError(failure(e)) }
    finally { if (alive.current && request === seq.current) setLoading(false) }
  }, [])
  useEffect(() => {
    const activity = AppState.addEventListener('change', state => { if (state === 'active' && actor.current.focused && actor.current.allowed && !lock.current) void load() })
    return () => activity.remove()
  }, [load])
  useFocusEffect(useCallback(() => { void load(); return () => { seq.current++ } }, [load, query, status, ministry, church, sort, page]))
  function filter(change: () => void) { setPage(1); change() }
  function open(kind: 'profile' | 'note' | 'qr' | 'contact', member: Member) {
    if (kind === 'qr') { desiredQr.current = member; setPanel({ kind, member }); void verifyQr(member); return }
    qrGeneration.current++; desiredQr.current = null; setQrVerified(false)
    setPanelError(''); setNote(member.admin_note || '')
    setContact({ first_name: member.first_name, last_name: member.last_name, email: member.email || '', mobile: member.mobile || '' })
    setPanel({ kind, member })
  }
  function closePanel() { if (!busy) { qrGeneration.current++; desiredQr.current = null; setQrVerified(false); setQrReading(false); setPanel(null) } }
  async function verifyQr(member: Member) {
    const request = ++qrGeneration.current, uid = actor.current.uid
    setQrVerified(false); setQrReading(true); setPanelError('')
    try {
      if (!permitted()) throw Error('Active staff access is required to view this QR.')
      const result = await supabase.from('members').select('id,qr_token,status,member_number,first_name,last_name').eq('id', member.id).maybeSingle()
      if (result.error) throw result.error
      const latest = result.data
      if (!latest || latest.id !== member.id || typeof latest.qr_token !== 'string' || !latest.qr_token.trim() || !['active', 'inactive'].includes(latest.status) || typeof latest.member_number !== 'string' || typeof latest.first_name !== 'string' || typeof latest.last_name !== 'string') throw Error('The current member QR could not be verified. Refresh Members and try again.')
      if (!permitted() || request !== qrGeneration.current || actor.current.uid !== uid || desiredQr.current?.id !== member.id) return
      const fresh = { ...member, ...latest } as Member
      desiredQr.current = fresh; setPanel({ kind: 'qr', member: fresh }); setQrVerified(true)
    } catch (e) {
      if (alive.current && request === qrGeneration.current) { desiredQr.current = null; setPanel(null); setError(failure(e)) }
    } finally { if (alive.current && request === qrGeneration.current) setQrReading(false) }
  }
  function sync(id: string, patch: Partial<Member>) {
    seq.current++
    if (!alive.current) return
    setData(d => d ? { ...d, rows: d.rows.map(m => m.id === id ? { ...m, ...patch } : m) } : null)
    setPanel(p => p?.member.id === id ? { ...p, member: { ...p.member, ...patch } } : p)
  }
  async function toggleStar(member: Member) {
    if (lock.current) return
    if (!permitted()) { setError('Active staff access is required to change a member.'); return }
    lock.current = true; setBusyRow(member.id); setError('')
    try {
      const result = await supabase.from('members').update({ is_starred: !member.is_starred }).eq('id', member.id).eq('is_starred', member.is_starred).select('id,is_starred').maybeSingle()
      if (result.error) throw result.error
      if (!result.data || result.data.id !== member.id || result.data.is_starred !== !member.is_starred) throw Error('This member changed elsewhere. Refresh before updating the star.')
      sync(member.id, { is_starred: result.data.is_starred })
      if (alive.current) toast.show(result.data.is_starred ? 'Member Starred' : 'Star Removed')
      await load()
    } catch (e) { if (alive.current) setError(failure(e)) }
    finally { lock.current = false; if (alive.current) setBusyRow('') }
  }
  async function toggleStatus(member: Member) {
    if (lock.current) return
    if (!permitted()) { setError('Active staff access is required to change a member.'); return }
    const actorId = actor.current.uid
    lock.current = true; setBusyRow(member.id); setError('')
    try {
      const next = member.status === 'active' ? 'inactive' : 'active', result = await setMemberStatusWithUndo(supabase, member.id, member.status, next)
      const version = (versions.current.get(member.id) || 0) + 1; versions.current.set(member.id, version)
      sync(member.id, { status: result.status })
      if (alive.current) toast.show(`${fullName(member)} Marked ${next === 'active' ? 'Active' : 'Inactive'}`, { undo: async () => {
        if (!permitted(false) || actor.current.uid !== actorId) throw Error('Return with the same staff account before undoing this change.')
        if (versions.current.get(member.id) !== version) throw Error('A newer status update replaced this action. Refresh Members.')
        if (lock.current) throw Error('Another member update is in progress. Try again in a moment.')
        lock.current = true
        try { const restored = await result.undo(); versions.current.set(member.id, version + 1); sync(member.id, { status: restored.status }); if (alive.current) await load() }
        finally { lock.current = false }
      } })
      await load()
    } catch (e) { if (alive.current) setError(failure(e)) }
    finally { lock.current = false; if (alive.current) setBusyRow('') }
  }
  async function saveNote() {
    if (!panel || lock.current) return
    if (!permitted()) { setPanelError('Active staff access is required to save this note.'); return }
    lock.current = true; setBusy(true); setPanelError('')
    try {
      const result = await saveMemberAdminNote(supabase, panel.member.id, panel.member.admin_note, note)
      sync(result.id, { admin_note: result.admin_note })
      if (alive.current) { toast.show('Private Note Saved'); setPanel(null); await load() }
    } catch (e) { if (alive.current) setPanelError(failure(e)) }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  async function saveContact() {
    if (!panel || lock.current) return
    if (!permitted()) { setPanelError('Active staff access is required to save these details.'); return }
    const member = panel.member, values = { first_name: contact.first_name.trim(), last_name: contact.last_name.trim(), email: contact.email.trim().toLowerCase() || null, mobile: contact.mobile.trim() || null }
    if (!values.first_name || !values.last_name) { setPanelError('Enter both names.'); return }
    if (values.email && !/^[^\s@]+@[^\s@]+\.com$/i.test(values.email)) { setPanelError('Use a valid email address ending in .com.'); return }
    if (values.mobile && !/^09\d{9}$/.test(values.mobile)) { setPanelError('Use an 11-digit mobile number starting with 09.'); return }
    lock.current = true; setBusy(true); setPanelError('')
    try {
      let q = supabase.from('members').update(values).eq('id', member.id).eq('first_name', member.first_name).eq('last_name', member.last_name)
      q = member.email === null ? q.is('email', null) : q.eq('email', member.email)
      q = member.mobile === null ? q.is('mobile', null) : q.eq('mobile', member.mobile)
      const result = await q.select('id,first_name,last_name,email,mobile').maybeSingle()
      if (result.error) throw result.error
      if (!result.data || result.data.id !== member.id) throw Error('This profile changed elsewhere. Close and refresh before editing again.')
      sync(member.id, result.data)
      if (alive.current) { toast.show('Contact Details Saved'); setPanel(null); await load() }
    } catch (e) { if (alive.current) setPanelError(failure(e)) }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  const disabled = busy || !!busyRow || qrReading, pages = Math.max(1, Math.ceil((data?.total || 0) / size))
  return <>
    <Screen>
      <Text style={styles.eyebrow}>PEOPLE & COMMUNITY</Text><Title>Member Directory</Title>
      <TextBody>{data ? `${data.total.toLocaleString()} of ${data.registered.toLocaleString()} Registered Members` : 'Find a member or manage their details.'}</TextBody>
      <Row><View style={styles.flex}><Button title="Ministries" variant="secondary" disabled={disabled || !data} onPress={() => setManage('ministries')} /></View><View style={styles.flex}><Button title="Churches" variant="secondary" disabled={disabled || !data} onPress={() => setManage('branches')} /></View></Row>
      <Card>
        <Field label="Search Members" value={search} onChangeText={setSearch} placeholder="Name, member number or contact" autoCapitalize="none" returnKeyType="search" />
        <Row><View style={styles.flex}><Select label="Members" value={status} onChange={v => filter(() => setStatus(v))} options={[{ label: 'All Members', value: 'all' }, { label: 'Active Members', value: 'active' }, { label: 'Inactive Members', value: 'inactive' }, { label: 'Starred Members', value: 'vip' }]} /></View><Button title={filters ? 'Fewer Filters' : 'More Filters'} variant="secondary" onPress={() => setFilters(v => !v)} /></Row>
        {filters && <>
          <Select label="Ministry" value={ministry} options={[{ label: 'All Ministries', value: 'all' }, ...(data?.ministries || []).map(m => ({ label: m.name, value: m.id }))]} onChange={v => filter(() => setMinistry(v))} />
          <Select label="Church" value={church} options={[{ label: 'All Churches', value: 'all' }, ...(data?.branches || []).map(m => ({ label: m.name, value: m.id }))]} onChange={v => filter(() => setChurch(v))} />
          <Select label="Sort" value={sort} options={[{ label: 'Name · A–Z', value: 'name-asc' }, { label: 'Name · Z–A', value: 'name-desc' }, { label: 'Added · Newest First', value: 'added-newest' }, { label: 'Added · Oldest First', value: 'added-oldest' }]} onChange={v => filter(() => setSort(v))} />
        </>}
      </Card>
      {error ? <Notice tone="error" message={error} /> : null}
      <Row><Text style={styles.count}>{data ? `${data.total.toLocaleString()} Matching Members` : 'Members'}</Text>{loading ? <ActivityIndicator color="#147d73" /> : <Button title="Refresh" variant="secondary" disabled={disabled} onPress={() => void load()} />}</Row>
      {data?.rows.map(member => <Card key={member.id}>
        <Row>
          <Pressable accessibilityRole="button" accessibilityLabel={member.is_starred ? `Unstar ${fullName(member)}` : `Star ${fullName(member)}`} disabled={disabled} onPress={() => void toggleStar(member)} style={[styles.star, member.is_starred && styles.starSelected]}><Text style={[styles.starText, member.is_starred && styles.starTextSelected]}>{member.is_starred ? '★' : '☆'}</Text></Pressable>
          <View style={styles.flex}><Text style={styles.name}>{fullName(member)}</Text><Text style={styles.secondary}>{member.member_number}</Text></View>
          <Pressable accessibilityRole="checkbox" accessibilityLabel={`${fullName(member)}: ${member.status}. Tap to change status`} accessibilityState={{ checked: member.status === 'active', disabled }} disabled={disabled} onPress={() => void toggleStatus(member)} style={styles.touch}><View style={[styles.status, member.status === 'inactive' && styles.inactive]}><Text style={[styles.statusMark, member.status === 'inactive' && styles.inactiveMark]}>{member.status === 'active' ? '✓' : '×'}</Text></View></Pressable>
        </Row>
        <Text style={styles.community}>{churches(member).join(' · ') || 'No Church Assigned'}</Text>
        <Text style={styles.secondary}>{ministries(member).join(' · ') || 'No Ministry Assigned'}</Text>
        {member.email || member.mobile ? <Text style={styles.contact} numberOfLines={1}>{member.email || member.mobile}</Text> : null}
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Private note for ${fullName(member)}`} onPress={() => open('note', member)} disabled={disabled} style={[styles.inline, member.admin_note && styles.noteFilled]}><Ionicons name="document-text-outline" size={17} color="#356a60" /><Text style={styles.inlineLabel}>Note{member.admin_note ? ' •' : ''}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`QR code for ${fullName(member)}`} disabled={disabled || !member.qr_token} onPress={() => open('qr', member)} style={styles.inline}><Ionicons name="qr-code-outline" size={17} color="#356a60" /><Text style={styles.inlineLabel}>QR</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`View ${fullName(member)} profile`} onPress={() => open('profile', member)} disabled={disabled} style={styles.inline}><Text style={styles.inlineLabel}>Profile  →</Text></Pressable>
        </View>
        {busyRow === member.id && <ActivityIndicator color="#147d73" />}
      </Card>)}
      {!loading && data && !data.rows.length && <Empty title="No Matching Members" message="Try another search or filter." />}
      <Row><Button title="Previous" variant="secondary" disabled={page <= 1 || loading || disabled} onPress={() => setPage(p => p - 1)} /><Text style={styles.count}>{page} / {pages}</Text><Button title="Next" variant="secondary" disabled={page >= pages || loading || disabled} onPress={() => setPage(p => p + 1)} /></Row>
    </Screen>
    <Modal visible={!!panel} animationType="slide" presentationStyle="fullScreen" onRequestClose={closePanel}>
      <SafeAreaView style={styles.modal}><Screen>
        <Row><View style={styles.flex}><Text style={styles.eyebrow}>{panel?.kind === 'note' ? 'PRIVATE ADMIN NOTE' : panel?.kind === 'qr' ? 'MEMBER QR' : panel?.kind === 'contact' ? 'CONTACT DETAILS' : 'MEMBER PROFILE'}</Text><Title>{panel ? fullName(panel.member) : ''}</Title></View><Button title="Close" variant="secondary" disabled={busy} onPress={closePanel} /></Row>
        {panelError ? <Notice tone="error" message={panelError} /> : null}
        {panel?.kind === 'note' && <><Card><TextBody>Only administrators can see this note.</TextBody><Field label="Note" multiline numberOfLines={7} maxLength={1000} value={note} onChangeText={setNote} editable={!busy} placeholder="Add a private reminder..." /><Text style={styles.secondary}>{note.length} / 1,000</Text></Card><Button title="Save Note" loading={busy} disabled={busy || note.trim() === (panel.member.admin_note || '')} onPress={() => void saveNote()} /></>}
        {panel?.kind === 'qr' && (qrVerified ? <MemberQR profile={qrProfile(panel.member)} /> : <Card><ActivityIndicator color="#147d73" /><TextBody>Checking Member QR…</TextBody></Card>)}
        {panel?.kind === 'contact' && <>
          <Card><Field label="First Name *" value={contact.first_name} onChangeText={first_name => setContact(v => ({ ...v, first_name }))} editable={!busy} maxLength={100} autoCapitalize="words" /><Field label="Last Name *" value={contact.last_name} onChangeText={last_name => setContact(v => ({ ...v, last_name }))} editable={!busy} maxLength={100} autoCapitalize="words" /><Field label="Email" value={contact.email} onChangeText={email => setContact(v => ({ ...v, email }))} keyboardType="email-address" autoCapitalize="none" editable={!busy} maxLength={254} /><Field label="Mobile Number" value={contact.mobile} onChangeText={mobile => setContact(v => ({ ...v, mobile }))} keyboardType="phone-pad" editable={!busy} maxLength={11} placeholder="09171234567" /></Card>
          <Button title="Save Contact Details" loading={busy} disabled={busy} onPress={() => void saveContact()} />
        </>}
        {panel?.kind === 'profile' && <>
          <Card><Text style={styles.memberNumber}>{panel.member.member_number}</Text><TextBody>{panel.member.status === 'active' ? 'Active Member' : 'Inactive Member'}</TextBody><Detail label="Email" value={panel.member.email || 'Not Provided'} /><Detail label="Mobile" value={panel.member.mobile || 'Not Provided'} /><Detail label="Churches" value={churches(panel.member).join(' · ') || 'None'} /><Detail label="Ministries" value={ministries(panel.member).join(' · ') || 'None'} /><Detail label="Registered" value={dateTime(panel.member.created_at)} /></Card>
          <Row><View style={styles.flex}><Button title="Edit Contact" variant="secondary" onPress={() => open('contact', panel.member)} /></View><View style={styles.flex}><Button title="Private Note" variant="secondary" onPress={() => open('note', panel.member)} /></View></Row>
          <Button title="Member QR" disabled={!panel.member.qr_token} onPress={() => open('qr', panel.member)} />
          <MemberAttendance key={panel.member.id} memberId={panel.member.id} />
        </>}
      </Screen></SafeAreaView>
    </Modal>
    {manage && data && <DirectoryManager kind={manage} items={manage === 'ministries' ? data.ministries : data.branches} counts={manage === 'ministries' ? data.ministry_counts : data.branch_counts} onClose={() => setManage(null)} onChanged={load} />}
  </>
}

function Detail({ label, value }: { label: string; value: string }) { return <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue} selectable>{value}</Text></View> }

function MemberAttendance({ memberId }: { memberId: string }) {
  const [rows, setRows] = useState<Attendance[]>([]), [total, setTotal] = useState(0), [page, setPage] = useState(1), [loading, setLoading] = useState(true), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true; setLoading(true); setError('')
    void (async () => { try {
      const result = await supabase.from('attendance').select('id,checked_in_at,report_snapshot,events(name)', { count: 'exact' }).eq('member_id', memberId).order('checked_in_at', { ascending: false }).order('id', { ascending: false }).range((page - 1) * 10, page * 10 - 1)
      if (result.error) throw result.error
      if (active) { setRows((result.data || []) as unknown as Attendance[]); setTotal(result.count || 0) }
    } catch (e) { if (active) setError(failure(e)) } finally { if (active) setLoading(false) } })()
    return () => { active = false }
  }, [memberId, page, revision])
  return <Card><Row><Text style={styles.name}>Attendance History</Text>{loading && <ActivityIndicator color="#147d73" />}</Row>{error ? <><Notice tone="error" message={error} /><Button title="Retry History" variant="secondary" onPress={() => setRevision(r => r + 1)} /></> : <>
    {rows.map(r => <View key={r.id} style={styles.detail}><Text style={styles.detailValue}>{r.report_snapshot?.service_name || r.events?.name || 'Removed Service'}</Text><Text style={styles.secondary}>{dateTime(r.checked_in_at)}</Text></View>)}
    {!loading && !rows.length && <TextBody>No attendance records.</TextBody>}
    {total > 10 && <Row><Button title="Previous" variant="secondary" disabled={page === 1 || loading} onPress={() => setPage(p => p - 1)} /><Text style={styles.count}>{page} / {Math.ceil(total / 10)}</Text><Button title="Next" variant="secondary" disabled={page * 10 >= total || loading} onPress={() => setPage(p => p + 1)} /></Row>}
  </>}</Card>
}

function DirectoryManager({ kind, items, counts, onClose, onChanged }: { kind: 'ministries' | 'branches'; items: Named[]; counts: Record<string, number>; onClose: () => void; onChanged: () => Promise<void> }) {
  const { account, session } = useSession(), focused = useIsFocused()
  const label = kind === 'ministries' ? 'Ministry' : 'Church', title = kind === 'ministries' ? 'Ministries' : 'Churches'
  const [name, setName] = useState(''), [editing, setEditing] = useState<Named | null>(null), [deleting, setDeleting] = useState<Named | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [undoChange, setUndoChange] = useState<{ name: string; restore: () => Promise<void> } | null>(null)
  const alive = useRef(true), lock = useRef(false)
  const access = useRef({ uid: session?.user.id, allowed: isStaff(account), focused }); access.current = { uid: session?.user.id, allowed: isStaff(account) && account?.user_id === session?.user.id, focused }
  function permitted() { return alive.current && access.current.allowed && !!access.current.uid && access.current.focused && AppState.currentState === 'active' }
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  async function save() {
    if (lock.current || !name.trim()) return
    if (!permitted()) { setError('Active staff access is required to change this entry.'); return }
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const result = editing ? await supabase.from(kind).update({ name: name.trim() }).eq('id', editing.id).eq('name', editing.name).select('id,name').maybeSingle() : await supabase.from(kind).insert({ name: name.trim() }).select('id,name').maybeSingle()
      if (result.error) throw result.error
      if (!result.data?.id) throw Error('This entry changed elsewhere or could not be saved. Refresh Members.')
      if (alive.current) { setName(''); setEditing(null); setNotice(`${label} ${editing ? 'Renamed' : 'Added'}`); await onChanged() }
    } catch (e) { if (alive.current) setError((e as { code?: string })?.code === '23505' ? `A ${label.toLowerCase()} with that name already exists.` : failure(e)) }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  async function remove() {
    if (!deleting || lock.current) return
    if (!permitted()) { setError('Active staff access is required to delete this entry.'); return }
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const result = await deleteDirectoryEntryWithUndo(supabase, kind, deleting.id)
      if (alive.current) {
        setDeleting(null); setUndoChange({ name: result.entry.name, restore: result.undo }); setNotice(`${result.entry.name} Deleted`); await onChanged()
      }
    } catch (e) { if (alive.current) { setError(failure(e)); setDeleting(null) } }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  async function undo() {
    if (!undoChange || lock.current) return
    if (!permitted()) { setError('Active staff access is required to restore this entry.'); return }
    lock.current = true; setBusy(true); setError('')
    try { await undoChange.restore(); if (alive.current) { setNotice(`${undoChange.name} Restored`); setUndoChange(null); await onChanged() } }
    catch (e) { if (alive.current) setError(failure(e)) }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { if (!busy) onClose() }}><SafeAreaView style={styles.modal}><Screen>
    <Row><Title>{title}</Title><Button title="Close" variant="secondary" disabled={busy} onPress={onClose} /></Row>
    <TextBody>Only entries with no assigned members can be deleted.</TextBody>
    <Card><Field label={editing ? `Rename ${label}` : `Add ${label}`} value={name} onChangeText={setName} editable={!busy} maxLength={100} /><Button title={editing ? 'Save Name' : `Add ${label}`} loading={busy} disabled={busy || !name.trim()} onPress={() => void save()} />{editing && <Button title="Cancel Rename" variant="secondary" disabled={busy} onPress={() => { setEditing(null); setName('') }} />}</Card>
    {error ? <Notice tone="error" message={error} /> : null}{notice ? <Notice tone="success" message={notice} /> : null}
    {undoChange && <Button title={`Undo Deletion of ${undoChange.name}`} variant="secondary" loading={busy} disabled={busy} onPress={() => void undo()} />}
    {items.map(item => <Card key={item.id}>
      <Text style={styles.name}>{item.name}</Text><TextBody>{(counts?.[item.id] || 0).toLocaleString()} Assigned Members</TextBody>
      {deleting?.id === item.id ? <><TextBody>Delete this {label.toLowerCase()}?</TextBody><HoldButton title="Hold to Delete" disabled={busy} onConfirm={() => remove()} /><Button title="Keep Entry" variant="secondary" disabled={busy} onPress={() => setDeleting(null)} /></> : <Row><View style={styles.flex}><Button title="Rename" variant="secondary" disabled={busy} onPress={() => { setEditing(item); setName(item.name); setDeleting(null) }} /></View><View style={styles.flex}><Button title="Delete" variant="danger" disabled={busy} onPress={() => { setError(''); setNotice(''); if ((counts?.[item.id] || 0) > 0) setError(`${item.name} has assigned members, including inactive members. Remove the assignments before deleting it.`); else setDeleting(item) }} /></View></Row>}
    </Card>)}
    {!items.length && <Empty title={`No ${title}`} message={`Add a ${label.toLowerCase()} above.`} />}
  </Screen></SafeAreaView></Modal>
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 }, eyebrow: { fontSize: 11, letterSpacing: 1.2, color: '#147d73', fontWeight: '700', marginBottom: 4 }, count: { fontSize: 13, color: '#5f7a75', fontWeight: '600' },
  name: { fontSize: 17, fontWeight: '700', color: '#173f3b', lineHeight: 23 }, secondary: { fontSize: 12, color: '#6e8580', lineHeight: 19 }, community: { color: '#3f6960', fontSize: 14, fontWeight: '600', lineHeight: 21 }, contact: { color: '#69857d', fontSize: 12 },
  star: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#f2f7f4' }, starSelected: { backgroundColor: '#fff3d6' }, starText: { fontSize: 26, color: '#8fa9a0' }, starTextSelected: { color: '#a8802e' },
  touch: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }, status: { width: 30, height: 30, borderRadius: 15, borderWidth: 3, borderColor: '#147d73', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }, inactive: { borderColor: '#dc8b9b', backgroundColor: '#fff7f8' }, statusMark: { color: '#147d73', fontSize: 16, fontWeight: '800', lineHeight: 20 }, inactiveMark: { color: '#ba667a', fontSize: 19 },
  actions: { flexDirection: 'row', gap: 8, paddingTop: 7, borderTopWidth: 1, borderTopColor: '#eef3f0' }, inline: { minHeight: 44, flex: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 8, borderRadius: 12, backgroundColor: '#f2f8f5', alignItems: 'center', justifyContent: 'center' }, noteFilled: { backgroundColor: '#fbf3df' }, inlineLabel: { color: '#356a60', fontSize: 12, fontWeight: '600' },
  modal: { flex: 1, backgroundColor: '#f4f9f7' }, detail: { paddingVertical: 9, gap: 5, borderBottomWidth: 1, borderBottomColor: '#edf2ef' }, detailLabel: { fontSize: 11, color: '#769087', fontWeight: '600' }, detailValue: { fontSize: 14, color: '#325d53', lineHeight: 22 }, memberNumber: { color: '#147d73', fontSize: 19, fontWeight: '700' },
})
