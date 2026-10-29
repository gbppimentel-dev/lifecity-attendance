import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { useIsFocused } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/session'
import { shareTextFile } from '../lib/files'
import { Button, Card, Empty, Field, HoldButton, Notice, Screen, Select, TextBody, Title, useToast } from '../ui'
import { dateTime } from '../lib/format'
import { removeAttendanceWithUndo } from '../../../../src/lib/attendanceActions'

type Named = { id: string; name: string }
type Row = {
  id: string; member_id: string; event_id: string; checked_in_at: string; attendance_status: string
  first_name: string; last_name: string; member_number: string; email: string | null; mobile: string | null; member_status: string
  service_name: string; service_date: string; service_state: string; service_end: string | null; service_location: string | null; sunday_service: boolean
  churches: Named[]; ministries: Named[]; member_group: string | null; created_at: string; scanned_by: string | null; notes: string | null
  archived_at: string | null; snapshot_source: string; snapshot_captured_at: string; snapshot_version: number
}
type Report = { top_group: { name: string; kind: string; check_ins: number; ties: number } | null; revision: string; total: number; members: number; services: number; rows: Row[] }
type Scope = 'completed' | 'in-progress' | 'archived' | 'history' | 'all'
type Catalog = { churches: Named[]; ministries: Named[]; events: Named[] }
const initialReport: Report = { top_group: null, revision: '', total: 0, members: 0, services: 0, rows: [] }
const teal = '#147d73', ink = '#183f3b', muted = '#69847e'
const scopeOptions = [{ value: 'completed', label: 'Completed Services' }, { value: 'in-progress', label: 'In-Progress Services' }, { value: 'archived', label: 'Archived Services' }, { value: 'history', label: 'Completed + Archived' }, { value: 'all', label: 'All Reportable Services' }]
const sortOptions = [{ value: 'check_in:desc', label: 'Check-In · Newest First' }, { value: 'check_in:asc', label: 'Check-In · Oldest First' }, ...['member', 'church', 'ministry', 'service'].flatMap(value => [{ value: `${value}:asc`, label: `${value[0].toUpperCase()}${value.slice(1)} · A–Z` }, { value: `${value}:desc`, label: `${value[0].toUpperCase()}${value.slice(1)} · Z–A` }])]
function manilaDate(value: string | Date) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) }
function shift(value: string, days: number) { const date = new Date(`${value}T12:00:00+08:00`); date.setUTCDate(date.getUTCDate() + days); return manilaDate(date) }
function csv(value: unknown) { let content = value == null ? '' : String(value); if (/^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(content)) content = "'" + content; return '"' + content.replace(/"/g, '""') + '"' }
function names(items: Named[]) { return items.map(item => item.name).join('; ') }
function validDate(value: string) { const stamp = Date.parse(value + 'T12:00:00Z'); return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value }
async function getReport(args: Record<string, unknown>): Promise<Report> {
  const { data, error } = await supabase.rpc('attendance_report_v4', args)
  if (error) throw Error(error.code === 'PGRST202' ? 'The attendance report update is not installed on this backend.' : error.message)
  if (!data || !Array.isArray(data.rows) || typeof data.total !== 'number' || typeof data.revision !== 'string') throw Error('The attendance response could not be verified.')
  return data
}

/** Reports use saved snapshots and the same receipt-based remove/restore contract as the web app. */
export default function RecordsScreen() {
  const { account, session } = useSession(), focused = useIsFocused(), toast = useToast()
  const allowed = account?.status === 'active' && (account.role === 'owner' || account.role === 'admin')
  const [scope, setScope] = useState<Scope>('completed'), [serviceId, setServiceId] = useState('')
  const [churchId, setChurchId] = useState(''), [ministryId, setMinistryId] = useState('')
  const [memberInput, setMemberInput] = useState(''), [query, setQuery] = useState('')
  const [dateRange, setDateRange] = useState('all'), [sundayOnly, setSundayOnly] = useState(false), [sort, setSort] = useState('check_in:desc')
  const [customStart, setCustomStart] = useState(manilaDate(new Date())), [customEnd, setCustomEnd] = useState(manilaDate(new Date()))
  const [page, setPage] = useState(0), [size, setSize] = useState('25'), [asOf, setAsOf] = useState(new Date().toISOString())
  const [report, setReport] = useState<Report>(initialReport), [catalog, setCatalog] = useState<Catalog>({ churches: [], ministries: [], events: [] })
  const [loading, setLoading] = useState(true), [catalogLoading, setCatalogLoading] = useState(true), [error, setError] = useState(''), [catalogError, setCatalogError] = useState('')
  const [loadedKey, setLoadedKey] = useState(''), [moreFilters, setMoreFilters] = useState(false)
  const [detail, setDetail] = useState<Row | null>(null), [removeTarget, setRemoveTarget] = useState<Row | null>(null)
  const [removing, setRemoving] = useState(false), [removeError, setRemoveError] = useState('')
  const [exporting, setExporting] = useState(false), [exportProgress, setExportProgress] = useState(0)
  const alive = useRef(true), mutationLock = useRef(false), exportLock = useRef(false), exportCancelled = useRef(false)
  const access = useRef({ allowed, focused, uid: session?.user.id })
  access.current = { allowed, focused, uid: session?.user.id }
  const today = manilaDate(asOf)
  const range = dateRange === 'today' ? [today, today] : dateRange === 'week' ? [shift(today, -6), today] : dateRange === 'month' ? [shift(today, -29), today] : dateRange === 'custom' ? [customStart, customEnd] : ['', '']
  const invalidRange = dateRange === 'custom' && (!validDate(customStart) || !validDate(customEnd) || customStart > customEnd)
  const [sortField, sortDirection] = sort.split(':')
  const request = { p_filters: { event_id: serviceId, church_id: churchId, ministry_id: ministryId, query, scope, sunday_only: sundayOnly, start: range[0], end: range[1] }, p_sort: sortField, p_desc: sortDirection === 'desc', p_as_of: asOf }
  const requestKey = JSON.stringify({ ...request, p_limit: Number(size), p_offset: page * Number(size) })
  const busy = loading || catalogLoading || requestKey !== loadedKey || query !== memberInput.trim() || invalidRange
  useEffect(() => { alive.current = true; return () => { alive.current = false; exportCancelled.current = true } }, [])
  useEffect(() => { setReport(initialReport); setLoadedKey(''); setDetail(null); setRemoveTarget(null); exportCancelled.current = true }, [session?.user.id])
  useEffect(() => { if (focused && allowed) refresh() }, [focused, allowed])
  useEffect(() => { const subscription = AppState.addEventListener('change', state => { if (state !== 'active') exportCancelled.current = true; else if (access.current.focused && access.current.allowed) refresh() }); return () => subscription.remove() }, [])
  useEffect(() => { const timer = setTimeout(() => setQuery(memberInput.trim()), 300); return () => clearTimeout(timer) }, [memberInput])
  useEffect(() => { setPage(0); setDetail(null); setRemoveTarget(null) }, [scope, serviceId, churchId, ministryId, query, dateRange, customStart, customEnd, sundayOnly, sort, size])
  useEffect(() => { if (!focused || !allowed) { setDetail(null); setRemoveTarget(null); exportCancelled.current = true } }, [focused, allowed, session?.user.id])
  useEffect(() => {
    if (!focused || !allowed) return
    return () => { if (Platform.OS === 'android') void Promise.resolve(DateTimePickerAndroid.dismiss('date')).catch(() => { /* The Activity may already have closed its date dialog. */ }) }
  }, [focused, allowed, session?.user.id])
  useEffect(() => {
    if (!focused || !allowed) return
    let disposed = false
    setCatalogLoading(true); setCatalogError('')
    async function read(kind: string): Promise<Named[]> {
      const rows: Named[] = []
      for (let offset = 0; ; offset += 500) {
        if (disposed) return []
        const { data, error: failure } = await supabase.rpc('attendance_catalog_v4', { p_kind: kind, p_scope: scope, p_as_of: asOf, p_offset: offset, p_limit: 500 })
        if (failure) throw failure
        if (!Array.isArray(data)) throw Error('Filter choices could not be verified.')
        rows.push(...data)
        if (data.length < 500) return rows
      }
    }
    void Promise.all([read('churches'), read('ministries'), read('events')]).then(([churches, ministries, events]) => {
      if (disposed) return
      setCatalog({ churches, ministries, events })
      setServiceId(current => current && !events.some(item => item.id === current) ? '' : current)
      setChurchId(current => current && !churches.some(item => item.id === current) ? '' : current)
      setMinistryId(current => current && !ministries.some(item => item.id === current) ? '' : current)
    }).catch(failure => { if (!disposed) setCatalogError((failure as Error).message || 'Filters could not be loaded.') }).finally(() => { if (!disposed) setCatalogLoading(false) })
    return () => { disposed = true }
  }, [scope, asOf, focused, allowed, session?.user.id])
  useEffect(() => {
    if (!focused || !allowed) return
    let disposed = false
    if (invalidRange) { setLoading(false); setLoadedKey(requestKey); setError('Choose a valid date range. From must be on or before To.'); return }
    setLoading(true); setError('')
    void getReport(JSON.parse(requestKey)).then(data => {
      if (disposed) return
      const last = Math.max(0, Math.ceil(data.total / Number(size)) - 1)
      if (page > last) { setPage(last); return }
      setReport(data); setLoadedKey(requestKey)
    }).catch(failure => { if (!disposed) { setLoadedKey(requestKey); setError((failure as Error).message || 'Records could not be loaded.') } }).finally(() => { if (!disposed) setLoading(false) })
    return () => { disposed = true }
  }, [requestKey, focused, allowed, invalidRange, session?.user.id])
  function refresh() { setAsOf(previous => new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString()) }
  function clearFilters() { setScope('completed'); setServiceId(''); setChurchId(''); setMinistryId(''); setMemberInput(''); setQuery(''); setDateRange('all'); setSundayOnly(false); setSort('check_in:desc'); setPage(0) }
  function chooseDate(which: 'start' | 'end') {
    if (!access.current.allowed || !access.current.focused || AppState.currentState !== 'active' || mutationLock.current || exportLock.current) return
    const actor = access.current.uid
    const value = which === 'start' ? customStart : customEnd
    const [year, month, day] = value.split('-').map(Number)
    DateTimePickerAndroid.open({ value: new Date(year, month - 1, day, 12), mode: 'date', onChange: (event, selectedDate) => {
      if (event.type !== 'set' || !selectedDate || !alive.current || !access.current.allowed || !access.current.focused || access.current.uid !== actor || mutationLock.current || exportLock.current) return
      const next = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
      if (which === 'start') setCustomStart(next); else setCustomEnd(next)
    } })
  }
  async function remove() {
    const target = removeTarget, actor = access.current.uid
    if (!target || mutationLock.current || exportLock.current || !access.current.allowed || !access.current.focused || AppState.currentState !== 'active' || !actor || busy || error) return
    mutationLock.current = true; setRemoving(true); setRemoveError('')
    try {
      const change = await removeAttendanceWithUndo(supabase, target.id)
      if (!alive.current || access.current.uid !== actor || !access.current.allowed) return
      setRemoveTarget(null); setDetail(null)
      // Keep existing rows visible during the refreshed snapshot.
      setReport(previous => ({ ...previous, total: Math.max(0, previous.total - 1), rows: previous.rows.filter(item => item.id !== target.id) }))
      refresh()
      toast.show(`${target.first_name} ${target.last_name}: Check-In Removed`, { undo: async () => {
        if (!access.current.allowed || access.current.uid !== actor) throw Error('Refresh your account access before using Undo.')
        await change.undo()
        if (alive.current) refresh()
      } })
    } catch (failure) { if (alive.current) setRemoveError((failure as Error).message || 'The check-in could not be removed.') }
    finally { mutationLock.current = false; if (alive.current) setRemoving(false) }
  }
  async function exportCsv() {
    if (exportLock.current || mutationLock.current || busy || error || !report.total || !allowed || !focused || AppState.currentState !== 'active') return
    exportLock.current = true; exportCancelled.current = false; setExporting(true); setExportProgress(0); setError('')
    const actor = access.current.uid, expected = report.total, revision = report.revision, exportRequest = request
    const cancelled = () => exportCancelled.current || !alive.current || !access.current.allowed || !access.current.focused || AppState.currentState !== 'active' || access.current.uid !== actor
    const verify = (response: Report) => { if (response.total !== expected || response.revision !== revision) throw Error('Matching records changed. Refresh and export again. No partial file was shared.') }
    const chunks = ['\uFEFF' + ['Member Number', 'Member Name', 'Churches (Saved)', 'Ministries (Saved)', 'Service (Saved)', 'Service Date (Manila)', 'Check-In (Manila)', 'Attendance Status'].map(csv).join(',') + '\r\n']
    try {
      for (let offset = 0; offset < expected; offset += 500) {
        if (cancelled()) throw Error('Export cancelled.')
        const response = await getReport({ ...exportRequest, p_offset: offset, p_limit: 500 })
        if (cancelled()) throw Error('Export cancelled.')
        verify(response)
        if (response.rows.length !== Math.min(500, expected - offset)) throw Error('The export response was incomplete. Please retry.')
        chunks.push(response.rows.map(item => [item.member_number, `${item.first_name} ${item.last_name}`, names(item.churches), names(item.ministries), item.service_name, manilaDate(item.service_date), dateTime(item.checked_in_at), item.attendance_status].map(csv).join(',')).join('\r\n') + '\r\n')
        if (alive.current) setExportProgress(offset + response.rows.length)
      }
      verify(await getReport({ ...exportRequest, p_offset: 0, p_limit: 1 }))
      if (cancelled()) throw Error('Export cancelled.')
      await shareTextFile(`lifecity-attendance-${scope}-${today}.csv`, chunks.join(''), 'text/csv')
    } catch (failure) { if (alive.current && access.current.focused) setError((failure as Error).message || 'The CSV could not be prepared.') }
    finally { exportLock.current = false; if (alive.current) setExporting(false) }
  }
  if (!allowed) return <Screen><Notice message="Your account does not have attendance report access." tone="error" /></Screen>
  const interactionBlocked = removing || exporting
  return <Screen>
    <View style={styles.heading}><View style={{ flex: 1 }}><Text style={styles.kicker}>REPORTS</Text><Title>Attendance Records</Title><TextBody>Review check-ins and share a CSV.</TextBody></View><Pressable accessibilityLabel="Refresh Records" accessibilityRole="button" disabled={busy || interactionBlocked} onPress={refresh} style={styles.refresh}><Ionicons name="refresh" size={22} color={teal} /></Pressable></View>
    <View style={styles.stats}>
      {[{ label: 'Check-Ins', value: report.total, color: teal, bg: '#e3f4ec', icon: 'scan-outline' }, { label: 'Members', value: report.members, color: '#7964ad', bg: '#eee8fc', icon: 'people-outline' }, { label: 'Services', value: report.services, color: '#a57526', bg: '#fff2d9', icon: 'calendar-outline' }].map(item => <View key={item.label} style={[styles.stat, { backgroundColor: item.bg }]}><Ionicons name={item.icon as any} size={23} color={item.color} /><Text style={[styles.statValue, { color: item.color }]}>{loadedKey ? item.value.toLocaleString() : '—'}</Text><Text style={styles.caption}>{item.label}</Text></View>)}
    </View>
    {report.top_group && <View style={styles.topGroup}><Ionicons name="business-outline" size={24} color="#7964ad" /><View style={{ flex: 1 }}><Text style={styles.caption}>Top {report.top_group.kind}</Text><Text style={styles.sectionTitle}>{report.top_group.name}</Text><Text style={styles.caption}>{report.top_group.check_ins.toLocaleString()} Check-Ins{report.top_group.ties > 1 ? ` · ${report.top_group.ties} Tied` : ''}</Text></View></View>}
    <Card>
      <View style={styles.line}><Text style={styles.sectionTitle}>Filters</Text><Pressable accessibilityRole="button" disabled={interactionBlocked} onPress={clearFilters} style={styles.textButton}><Text style={styles.link}>Reset</Text></Pressable></View>
      <Select label="Service Status" value={scope} options={scopeOptions} onChange={value => { if (!interactionBlocked) setScope(value as Scope) }} />
      <Select label="Service" value={serviceId} options={[{ value: '', label: 'All Matching Services' }, ...catalog.events.map(item => ({ value: item.id, label: item.name }))]} onChange={value => { if (!interactionBlocked) setServiceId(value) }} />
      <Field label="Member" placeholder="Name, Member ID or Contact" value={memberInput} onChangeText={setMemberInput} autoCorrect={false} editable={!interactionBlocked} />
      <Button title={moreFilters ? 'Fewer Filters' : 'More Filters'} variant="secondary" onPress={() => setMoreFilters(value => !value)} />
      {moreFilters && <>
        <Select label="Church" value={churchId} options={[{ value: '', label: 'All Churches' }, ...catalog.churches.map(item => ({ value: item.id, label: item.name }))]} onChange={value => { if (!interactionBlocked) setChurchId(value) }} />
        <Select label="Ministry" value={ministryId} options={[{ value: '', label: 'All Ministries' }, ...catalog.ministries.map(item => ({ value: item.id, label: item.name }))]} onChange={value => { if (!interactionBlocked) setMinistryId(value) }} />
        <Select label="Date Range" value={dateRange} options={[{ value: 'all', label: 'All Time' }, { value: 'today', label: 'Today' }, { value: 'week', label: 'Last 7 Days' }, { value: 'month', label: 'Last 30 Days' }, { value: 'custom', label: 'Custom Dates' }]} onChange={value => { if (!interactionBlocked) setDateRange(value) }} />
        {dateRange === 'custom' && (Platform.OS === 'android' ? <View style={{ gap: 10 }}><Button title={`From · ${customStart}`} variant="secondary" disabled={interactionBlocked} onPress={() => chooseDate('start')} /><Button title={`To · ${customEnd}`} variant="secondary" disabled={interactionBlocked} onPress={() => chooseDate('end')} /></View> : <><Field label="From (YYYY-MM-DD)" value={customStart} onChangeText={setCustomStart} editable={!interactionBlocked} /><Field label="To (YYYY-MM-DD)" value={customEnd} onChangeText={setCustomEnd} editable={!interactionBlocked} /></>)}
        <View style={styles.line}><Text style={styles.sectionTitle}>Sunday Services Only</Text><Switch accessibilityLabel="Sunday Services Only" value={sundayOnly} onValueChange={setSundayOnly} disabled={interactionBlocked} trackColor={{ false: '#dce9e5', true: '#91cfc0' }} thumbColor={sundayOnly ? teal : '#fff'} /></View>
      </>}
      {catalogError && <Notice message={catalogError} tone="error" />}
    </Card>
    <Card>
      <Text style={styles.sectionTitle}>Check-In History</Text><TextBody>Saved member and service details. Times in Manila.</TextBody>
      <Select label="Sort" value={sort} options={sortOptions} onChange={value => { if (!interactionBlocked) setSort(value) }} />
      <Button title={exporting ? `Preparing CSV · ${exportProgress.toLocaleString()}/${report.total.toLocaleString()}` : 'Share CSV · All Matching Records'} variant="secondary" onPress={() => { void exportCsv() }} disabled={busy || removing || !report.total || !!error || exporting} loading={exporting} />
      {exporting && <Button title="Cancel Export" variant="secondary" onPress={() => { exportCancelled.current = true }} />}
      {error && <Notice message={error} tone="error" />}
      {(loading || catalogLoading) && <View style={styles.loading}><ActivityIndicator color={teal} /><Text style={styles.caption}>Updating Records…</Text></View>}
      {!busy && !report.rows.length && !error && <Empty title="No Matching Check-Ins" message="Try changing your filters." />}
      <View style={{ opacity: busy ? 0.55 : 1, gap: 10 }}>
        {report.rows.map(item => <View key={item.id} style={styles.record}>
          <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.first_name} ${item.last_name} Check-In`} disabled={busy || interactionBlocked || !!error} onPress={() => setDetail(item)} style={{ flex: 1, gap: 7 }}>
            <View style={styles.line}><View style={{ flex: 1 }}><Text style={styles.name}>{item.first_name} {item.last_name}</Text><Text style={styles.caption}>{item.member_number}</Text></View><View style={styles.present}><Ionicons name="checkmark" size={13} color={teal} /><Text style={{ fontSize: 11, color: teal }}>Present</Text></View></View>
            <Text style={styles.serviceName}>{item.service_name}</Text>
            <View style={styles.meta}><Ionicons name="time-outline" size={14} color={muted} /><Text style={styles.caption}>{dateTime(item.checked_in_at)}</Text></View>
            {!!item.churches.length && <Text style={styles.caption} numberOfLines={2}>{names(item.churches)}</Text>}
          </Pressable>
          <View style={styles.recordTools}><Button title="Details" variant="secondary" onPress={() => setDetail(item)} disabled={busy || interactionBlocked || !!error} /><Pressable accessibilityLabel={`Remove ${item.first_name} ${item.last_name} Check-In`} accessibilityRole="button" disabled={busy || interactionBlocked || !!error} onPress={() => { setRemoveError(''); setRemoveTarget(item) }} style={styles.delete}><Ionicons name="trash-outline" size={19} color="#ad4a51" /></Pressable></View>
        </View>)}
      </View>
      <View style={styles.pagination}><Select label="Rows per Page" value={size} options={['25', '50', '100'].map(value => ({ value, label: value }))} onChange={value => { if (!interactionBlocked) setSize(value) }} /><Text style={styles.caption}>{report.total ? `${page * Number(size) + 1}–${Math.min((page + 1) * Number(size), report.total)} of ${report.total.toLocaleString()}` : '0 Records'}</Text><View style={styles.line}><Button title="Previous" variant="secondary" disabled={busy || interactionBlocked || page === 0} onPress={() => setPage(value => value - 1)} /><Button title="Next" variant="secondary" disabled={busy || interactionBlocked || (page + 1) * Number(size) >= report.total} onPress={() => setPage(value => value + 1)} /></View></View>
    </Card>
    <Modal visible={!!detail || !!removeTarget} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!removing) { setDetail(null); setRemoveTarget(null) } }}>
      <SafeAreaView style={styles.modal}>
        <View style={styles.modalHead}><View style={{ flex: 1 }}><Text style={styles.kicker}>{removeTarget ? 'REMOVE CHECK-IN' : 'ATTENDANCE DETAILS'}</Text><Text style={styles.modalTitle}>{(removeTarget || detail)?.first_name} {(removeTarget || detail)?.last_name}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close Attendance Details" disabled={removing} onPress={() => { setDetail(null); setRemoveTarget(null) }} style={styles.refresh}><Ionicons name="close" size={23} color={ink} /></Pressable></View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          {removeTarget ? <><Card><Text style={styles.sectionTitle}>{removeTarget.service_name}</Text><TextBody>{dateTime(removeTarget.checked_in_at)}</TextBody><Notice message="Hold to remove this check-in. You can use Undo immediately afterward." tone="info" /></Card>{removeError && <Notice message={removeError} tone="error" />}<HoldButton title={removing ? 'Removing…' : 'Hold to Remove Check-In'} onConfirm={remove} disabled={removing || busy} /><Button title="Cancel" variant="secondary" onPress={() => setRemoveTarget(null)} disabled={removing} /></> : detail && <>
            <View style={styles.detailBanner}><Ionicons name="checkmark-circle-outline" size={30} color={teal} /><View style={{ flex: 1 }}><Text style={styles.sectionTitle}>{detail.attendance_status || 'Present'}</Text><Text style={styles.caption}>{detail.member_number} · {detail.member_status}</Text></View></View>
            <Card><Text style={styles.kicker}>SERVICE</Text><Text style={styles.name}>{detail.service_name}</Text><Detail label="Service Start" value={dateTime(detail.service_date)} /><Detail label="Service State" value={detail.service_state} /><Detail label="Check-In" value={dateTime(detail.checked_in_at)} />{detail.service_location && <Detail label="Venue" value={detail.service_location} />}</Card>
            <Card><Text style={styles.kicker}>SAVED MEMBER DETAILS</Text><Detail label="Churches" value={names(detail.churches) || 'None'} /><Detail label="Ministries" value={names(detail.ministries) || 'None'} /><Detail label="Email" value={detail.email || 'Not Provided'} /><Detail label="Mobile" value={detail.mobile || 'Not Provided'} /><TextBody>These details were saved at check-in.</TextBody></Card>
            <Card><Text style={styles.kicker}>RECORD</Text><Detail label="Snapshot Source" value={detail.snapshot_source} /><Detail label="Snapshot Saved" value={dateTime(detail.snapshot_captured_at)} /><Detail label="Attendance ID" value={detail.id} />{detail.notes && <Detail label="Notes" value={detail.notes} />}</Card>
            <Button title="Remove Check-In" variant="danger" onPress={() => { setRemoveError(''); setRemoveTarget(detail) }} disabled={busy || interactionBlocked} />
          </>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </Screen>
}

function Detail({ label, value }: { label: string; value: string }) { return <View style={styles.detail}><Text style={styles.caption}>{label}</Text><Text selectable style={styles.detailValue}>{value}</Text></View> }
const styles = StyleSheet.create({
  heading: { flexDirection: 'row', gap: 12, alignItems: 'center' }, kicker: { color: teal, fontSize: 11, letterSpacing: 1.3, fontWeight: '700' }, sectionTitle: { color: ink, fontSize: 15, fontWeight: '700', lineHeight: 22 }, caption: { color: muted, fontSize: 12, lineHeight: 18 }, refresh: { width: 46, height: 46, justifyContent: 'center', alignItems: 'center', borderRadius: 15, borderWidth: 1, borderColor: '#cfe4dc', backgroundColor: '#f5fbf8' }, stats: { flexDirection: 'row', gap: 9 }, stat: { flex: 1, padding: 15, borderRadius: 18, gap: 6 }, statValue: { fontSize: 25, fontWeight: '800' }, topGroup: { flexDirection: 'row', alignItems: 'center', padding: 18, gap: 13, borderRadius: 18, backgroundColor: '#f0ecfa' }, line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, textButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }, link: { color: teal, fontSize: 14, fontWeight: '600' }, loading: { flexDirection: 'row', gap: 8, paddingVertical: 10, alignItems: 'center' }, record: { borderWidth: 1, borderColor: '#d7e8e1', borderRadius: 18, padding: 16, backgroundColor: '#fbfefd', gap: 12 }, name: { fontSize: 17, fontWeight: '700', color: ink, lineHeight: 24 }, serviceName: { color: teal, fontSize: 14, fontWeight: '600', lineHeight: 21 }, meta: { flexDirection: 'row', alignItems: 'center', gap: 6 }, present: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#e1f3eb', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12 }, recordTools: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e4eee8' }, delete: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#f0d4d8' }, pagination: { gap: 14, marginTop: 10, paddingTop: 18, borderTopWidth: 1, borderTopColor: '#dceae4' }, modal: { flex: 1, backgroundColor: '#f6fbf9' }, modalHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, borderBottomWidth: 1, borderBottomColor: '#dce9e2', backgroundColor: '#fff' }, modalTitle: { fontSize: 22, fontWeight: '700', color: ink, lineHeight: 29, marginTop: 5 }, detailBanner: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 18, backgroundColor: '#e4f4ed' }, detail: { gap: 5, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#e5eee9' }, detailValue: { color: ink, fontSize: 15, lineHeight: 23 },
})
