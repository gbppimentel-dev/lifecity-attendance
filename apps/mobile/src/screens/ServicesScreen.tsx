import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, AppState, Modal, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/session'
import { isStaff } from '../lib/account'
import { Button, Card, Empty, Field, HoldButton, Notice, Row, Screen, Select, TextBody, Title, useToast } from '../ui'
import { dateTime } from '../lib/format'
import { manilaScheduleParts as manilaParts, serviceStartsAt } from '../lib/nativeServiceForm'
import { changeServiceField, deleteServiceWithUndo } from '../../../../src/lib/serviceActions'

type Service = {
  id: string; name: string; starts_at: string; ends_at: string | null; location: string | null
  admin_note: string | null; is_sunday_service: boolean; is_public: boolean
  archived_at: string | null; created_at: string; check_ins: number
}
type ServicePage = { rows: Service[]; total: number; registered: number; page: number; years: number[] }
type Draft = { name: string; date: string; hour: string; minute: string; period: string; location: string; note: string; sunday: boolean; public: boolean }
const blank = (): Draft => ({ name: '', date: manilaParts(new Date().toISOString()).date, hour: '9', minute: '00', period: 'AM', location: '', note: '', sunday: false, public: false })
const size = 20
function message(e: unknown) { return (e as { message?: string })?.message || 'The change could not be confirmed. Refresh and try again.' }
function serviceState(s: Service) {
  if (s.archived_at) return 'Archived'
  const now = Date.now(), start = Date.parse(s.starts_at), end = s.ends_at ? Date.parse(s.ends_at) : start + 3 * 60 * 60 * 1000
  return now < start ? 'Upcoming' : now <= end ? 'In Progress' : 'Completed'
}
function CalendarTile({ value }: { value: string }) {
  const date = new Date(value), fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', ...options }).format(date)
  return <View style={styles.calendar} accessibilityLabel={fmt({ month: 'long', day: 'numeric', year: 'numeric' })}>
    <Text style={styles.month}>{fmt({ month: 'short' }).toUpperCase()}</Text><Text style={styles.day}>{fmt({ day: 'numeric' })}</Text><Text style={styles.weekday}>{fmt({ weekday: 'short' })}</Text>
  </View>
}

export default function ServicesScreen() {
  const navigation = useNavigation<any>(), toast = useToast()
  const { account, session } = useSession(), focused = useIsFocused()
  const [data, setData] = useState<ServicePage | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [archive, setArchive] = useState('active'), [sort, setSort] = useState('recent')
  const [month, setMonth] = useState('all'), [year, setYear] = useState('all'), [page, setPage] = useState(1), [filters, setFilters] = useState(false)
  const [editor, setEditor] = useState<{ item: Service | null; draft: Draft } | null>(null), [editorError, setEditorError] = useState('')
  const [dateOpen, setDateOpen] = useState(false), [busy, setBusy] = useState(false), [busyRow, setBusyRow] = useState('')
  const [action, setAction] = useState<Service | null>(null), [confirmDelete, setConfirmDelete] = useState(false)
  const alive = useRef(true), sequence = useRef(0), lock = useRef(false), versions = useRef(new Map<string, number>())
  const actor = useRef({ uid: session?.user.id, allowed: isStaff(account), focused }); actor.current = { uid: session?.user.id, allowed: isStaff(account) && account?.user_id === session?.user.id, focused }
  function permitted(requireFocus = true) { return alive.current && actor.current.allowed && !!actor.current.uid && (!requireFocus || actor.current.focused) && AppState.currentState === 'active' }
  const current = useRef({ query, archive, sort, month, year, page }); current.current = { query, archive, sort, month, year, page }
  useEffect(() => { alive.current = true; return () => { alive.current = false; sequence.current++ } }, [])
  useEffect(() => { const t = setTimeout(() => { setQuery(search.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [search])
  const load = useCallback(async () => {
    if (!alive.current) return
    const request = ++sequence.current, f = current.current
    if (alive.current) { setLoading(true); setError('') }
    try {
      const { data: result, error: failure } = await supabase.rpc('lc_services_page', { p_archive: f.archive, p_month: f.month === 'all' ? null : Number(f.month), p_year: f.year === 'all' ? null : Number(f.year), p_sort: f.sort, p_search: f.query, p_page: f.page, p_size: size })
      if (failure) throw failure
      if (!result || !Array.isArray(result.rows) || !Array.isArray(result.years) || typeof result.total !== 'number') throw Error('Invalid services response.')
      if (alive.current && request === sequence.current) setData(result as ServicePage)
    } catch (e) { if (alive.current && request === sequence.current) setError(message(e)) }
    finally { if (alive.current && request === sequence.current) setLoading(false) }
  }, [])
  useEffect(() => {
    const activity = AppState.addEventListener('change', state => { if (state === 'active' && actor.current.focused && actor.current.allowed && !lock.current) void load() })
    return () => activity.remove()
  }, [load])
  useFocusEffect(useCallback(() => { void load(); return () => { sequence.current++ } }, [load, query, archive, sort, month, year, page]))
  function filter(change: () => void) { setPage(1); change() }
  function openEditor(item: Service | null) {
    setAction(null); setConfirmDelete(false); setEditorError('')
    setEditor({ item, draft: item ? { ...manilaParts(item.starts_at), name: item.name, location: item.location || '', note: item.admin_note || '', sunday: item.is_sunday_service, public: item.is_public } : blank() })
  }
  function patch(value: Partial<Draft>) { setEditor(s => s ? { ...s, draft: { ...s.draft, ...value } } : null) }
  async function save() {
    if (!editor || lock.current) return
    if (!permitted()) { setEditorError('Active staff access is required to save this service.'); return }
    const { draft, item } = editor
    if (!draft.name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) { setEditorError('Enter a service name and date.'); return }
    let starts: string
    try { starts = serviceStartsAt(draft.date, draft.hour, draft.minute, draft.period) }
    catch (e) { setEditorError(message(e)); return }
    if (!['00', '15', '30', '45'].includes(draft.minute) && (!item || draft.minute !== manilaParts(item.starts_at).minute)) { setEditorError('Choose minutes in 15-minute increments.'); return }
    lock.current = true; setBusy(true); setEditorError('')
    try {
      const values = { name: draft.name.trim(), starts_at: starts, location: draft.location.trim() || null, admin_note: draft.note.trim() || null, is_sunday_service: draft.sunday, is_public: draft.public }
      let q = item ? supabase.from('events').update(values).eq('id', item.id).eq('starts_at', item.starts_at).eq('name', item.name).eq('is_sunday_service', item.is_sunday_service).eq('is_public', item.is_public) : supabase.from('events').insert(values)
      if (item) {
        q = item.location === null ? q.is('location', null) : q.eq('location', item.location)
        q = item.admin_note === null ? q.is('admin_note', null) : q.eq('admin_note', item.admin_note)
      }
      const result = await q.select('id').maybeSingle()
      if (result.error) throw result.error
      if (!result.data?.id) throw Error('This service changed elsewhere or could not be saved. Refresh before editing again.')
      if (item) versions.current.set(item.id, (versions.current.get(item.id) || 0) + 1)
      if (alive.current) { setEditor(null); toast.show(item ? 'Service Updated' : 'Service Created'); await load() }
    } catch (e) { if (alive.current) setEditorError(message(e)) }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  async function mutate(item: Service, kind: 'sunday' | 'archive' | 'restore' | 'delete') {
    if (lock.current) return
    if (!permitted()) { setError('Active staff access is required to change a service.'); return }
    const actorId = actor.current.uid
    lock.current = true; setBusyRow(item.id); setError('')
    try {
      const result = kind === 'delete' ? await deleteServiceWithUndo(supabase, item.id) : await changeServiceField(supabase, item.id, kind === 'sunday' ? 'is_sunday_service' : 'archived_at', kind === 'sunday' ? item.is_sunday_service : item.archived_at, kind === 'sunday' ? !item.is_sunday_service : kind === 'archive' ? new Date().toISOString() : null)
      const version = (versions.current.get(item.id) || 0) + 1; versions.current.set(item.id, version)
      sequence.current++
      if (!alive.current) return
      setAction(null); setConfirmDelete(false)
      setData(d => d ? { ...d, rows: kind === 'delete' ? d.rows.filter(s => s.id !== item.id) : d.rows.map(s => s.id === item.id ? { ...s, ...result.service } as Service : s) } : null)
      const label = kind === 'sunday' ? item.is_sunday_service ? 'Sunday Label Removed' : 'Marked as Sunday Service' : kind === 'delete' ? 'Service Deleted' : kind === 'archive' ? 'Service Archived' : 'Service Restored'
      toast.show(label, { undo: async () => {
        if (!permitted(false) || actor.current.uid !== actorId) throw Error('Return with the same staff account before undoing this change.')
        if (versions.current.get(item.id) !== version) throw Error('A newer change replaced this action. Refresh Services.')
        if (lock.current) throw Error('Another service update is in progress. Try again in a moment.')
        lock.current = true
        try { await result.undo(); versions.current.set(item.id, version + 1); if (alive.current) await load() }
        finally { lock.current = false }
      } })
      await load()
    } catch (e) { if (alive.current) { setError(message(e)); setAction(null); setConfirmDelete(false) } }
    finally { lock.current = false; if (alive.current) setBusyRow('') }
  }
  const blocked = !!busyRow || busy
  const pageCount = Math.max(1, Math.ceil((data?.total || 0) / size))
  const minutes = editor && !['00', '15', '30', '45'].includes(editor.draft.minute) ? [editor.draft.minute, '00', '15', '30', '45'] : ['00', '15', '30', '45']
  return <>
    <Screen>
      <Row><View style={styles.flex}><Text style={styles.eyebrow}>ATTENDANCE SETUP</Text><Title>Services</Title></View><Button title="New Service" onPress={() => openEditor(null)} disabled={blocked} /></Row>
      <TextBody>Create services and manage their schedules.</TextBody>
      <Card>
        <Field label="Search Services" placeholder="Service or location" value={search} onChangeText={setSearch} autoCapitalize="none" returnKeyType="search" />
        <Row><View style={styles.flex}><Select label="Show" value={archive} onChange={v => filter(() => setArchive(v))} options={[{ label: 'Active Services', value: 'active' }, { label: 'Archived Services', value: 'archived' }, { label: 'All Services', value: 'all' }]} /></View><View style={styles.flex}><Select label="Sort" value={sort} onChange={v => filter(() => setSort(v))} options={[{ label: 'Recent First', value: 'recent' }, { label: 'Oldest First', value: 'oldest' }]} /></View></Row>
        <Button title={filters ? 'Fewer Filters' : 'Filter by Month & Year'} variant="secondary" onPress={() => setFilters(v => !v)} />
        {filters && <Row><View style={styles.flex}><Select label="Month" value={month} onChange={v => filter(() => setMonth(v))} options={[{ label: 'All Months', value: 'all' }, ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, i, 1))) }))]} /></View><View style={styles.flex}><Select label="Year" value={year} onChange={v => filter(() => setYear(v))} options={[{ label: 'All Years', value: 'all' }, ...(data?.years || []).map(y => ({ label: String(y), value: String(y) }))]} /></View></Row>}
      </Card>
      {error ? <Notice message={error} tone="error" /> : null}
      <Row><Text style={styles.count}>{data ? `${data.total.toLocaleString()} Services` : 'Services'}</Text>{loading ? <ActivityIndicator color="#147d73" /> : <Button title="Refresh" variant="secondary" onPress={() => void load()} disabled={blocked} />}</Row>
      {data?.rows.map(item => <Card key={item.id}>
        <Row><CalendarTile value={item.starts_at} /><View style={styles.flex}><Text style={styles.state}>{serviceState(item)}</Text><Text style={styles.serviceName}>{item.name}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Tools for ${item.name}`} disabled={blocked} onPress={() => { setAction(item); setConfirmDelete(false) }} style={styles.more}><Ionicons name="ellipsis-horizontal" size={21} color="#466c63" /></Pressable></Row>
        <TextBody>{dateTime(item.starts_at)}</TextBody>
        {item.location ? <TextBody>{item.location}</TextBody> : null}
        <Row><Text style={styles.count}>{(item.check_ins || 0).toLocaleString()} Check-Ins</Text><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: item.is_sunday_service, disabled: blocked }} accessibilityLabel={`Sunday Service: ${item.name}`} disabled={blocked} onPress={() => void mutate(item, 'sunday')} style={[styles.sunday, item.is_sunday_service && styles.sundaySelected]}><Text style={[styles.sundayText, item.is_sunday_service && styles.sundayTextSelected]}>{item.is_sunday_service ? '✓  Sunday Service' : '○  Sunday Service'}</Text></Pressable></Row>
        {item.admin_note ? <View style={styles.note}><Text style={styles.noteLabel}>Private Note</Text><Text style={styles.noteText} numberOfLines={3}>{item.admin_note}</Text></View> : null}
        {serviceState(item) === 'In Progress' && <Button title="Open Scanner" onPress={() => navigation.navigate('Scanner', { serviceId: item.id })} disabled={blocked} />}
        {busyRow === item.id && <ActivityIndicator color="#147d73" />}
      </Card>)}
      {!loading && data && !data.rows.length && <Empty title="No Matching Services" message="Try another search or filter." />}
      <Row><Button title="Previous" variant="secondary" disabled={page <= 1 || loading || blocked} onPress={() => setPage(p => p - 1)} /><Text style={styles.count}>{page} / {pageCount}</Text><Button title="Next" variant="secondary" disabled={page >= pageCount || loading || blocked} onPress={() => setPage(p => p + 1)} /></Row>
    </Screen>
    <Modal visible={!!editor} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { if (!busy) setEditor(null) }}>
      <SafeAreaView style={styles.modal}><Screen>
        <Row><Title>{editor?.item ? 'Edit Service' : 'New Service'}</Title><Button title="Close" variant="secondary" disabled={busy} onPress={() => setEditor(null)} /></Row>
        <TextBody>Schedules use Manila time.</TextBody>
        {editorError ? <Notice tone="error" message={editorError} /> : null}
        {editor && <>
          <Card>
            <Field label="Service Name *" value={editor.draft.name} onChangeText={name => patch({ name })} maxLength={180} editable={!busy} autoCapitalize="words" />
            <Text style={styles.fieldLabel}>Date *</Text><Button title={editor.draft.date} variant="secondary" disabled={busy} onPress={() => setDateOpen(true)} />
            {dateOpen && <DateTimePicker value={new Date(`${editor.draft.date}T12:00:00`)} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(event, date) => { setDateOpen(false); if (event.type !== 'dismissed' && date) patch({ date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }) }} />}
            <Row><View style={styles.flex}><Select label="Hour" value={editor.draft.hour} options={Array.from({ length: 12 }, (_, i) => ({ label: String(i + 1), value: String(i + 1) }))} onChange={hour => patch({ hour })} /></View><View style={styles.flex}><Select label="Minute" value={editor.draft.minute} options={minutes.map(m => ({ label: m, value: m }))} onChange={minute => patch({ minute })} /></View><View style={styles.flex}><Select label="AM / PM" value={editor.draft.period} options={[{ label: 'AM', value: 'AM' }, { label: 'PM', value: 'PM' }]} onChange={period => patch({ period })} /></View></Row>
            <Field label="Location" value={editor.draft.location} onChangeText={location => patch({ location })} maxLength={250} editable={!busy} />
          </Card>
          <Card><Field label="Private Service Note" value={editor.draft.note} onChangeText={note => patch({ note })} multiline numberOfLines={4} maxLength={2000} editable={!busy} /><TextBody>Only administrators can see this note.</TextBody></Card>
          <Card><Row><View style={styles.flex}><Text style={styles.optionTitle}>Sunday Service</Text><TextBody>Include attendance in Sunday reporting.</TextBody></View><Switch accessibilityLabel="Sunday Service" value={editor.draft.sunday} onValueChange={sunday => patch({ sunday })} disabled={busy} trackColor={{ true: '#147d73', false: '#c8dcd7' }} /></Row></Card>
          <Card><Row><View style={styles.flex}><Text style={styles.optionTitle}>Show in Guest Preview</Text><TextBody>Share the name, schedule, and venue for current and upcoming services. Notes and attendance stay private.</TextBody></View><Switch accessibilityLabel="Show in Guest Preview" value={editor.draft.public} onValueChange={value => patch({ public: value })} disabled={busy} trackColor={{ true: '#147d73', false: '#c8dcd7' }} /></Row></Card>
          <Button title="Save Service" onPress={() => void save()} loading={busy} disabled={busy || !editor.draft.name.trim()} />
        </>}
      </Screen></SafeAreaView>
    </Modal>
    <Modal visible={!!action} animationType="slide" transparent onRequestClose={() => { if (!blocked) { setAction(null); setConfirmDelete(false) } }}>
      <View style={styles.sheetBackdrop}><SafeAreaView style={styles.sheet}>
        <Title>{action?.name}</Title>
        {action && !confirmDelete && <>
          <Button title="Edit Service" variant="secondary" disabled={blocked} onPress={() => openEditor(action)} />
          {serviceState(action) !== 'Archived' && serviceState(action) !== 'Completed' && <Button title="Open Scanner" disabled={blocked} onPress={() => { const id = action.id; setAction(null); navigation.navigate('Scanner', { serviceId: id }) }} />}
          <Button title={action.archived_at ? 'Restore Service' : 'Archive Service'} variant="secondary" disabled={blocked} onPress={() => void mutate(action, action.archived_at ? 'restore' : 'archive')} />
          <Button title="Delete Service" variant="danger" disabled={blocked} onPress={() => { if (action.check_ins > 0) Alert.alert('Attendance Exists', 'Archive this service to preserve its attendance records.'); else setConfirmDelete(true) }} />
        </>}
        {action && confirmDelete && <><TextBody>Delete this service? Hold the button to confirm. Services with attendance cannot be deleted.</TextBody><HoldButton title="Hold to Delete" disabled={blocked} onConfirm={() => mutate(action, 'delete')} /><Button title="Keep Service" variant="secondary" disabled={blocked} onPress={() => setConfirmDelete(false)} /></>}
        <Button title="Close" variant="secondary" disabled={blocked} onPress={() => { setAction(null); setConfirmDelete(false) }} />
      </SafeAreaView></View>
    </Modal>
  </>
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 }, eyebrow: { fontSize: 11, letterSpacing: 1.2, color: '#147d73', fontWeight: '700', marginBottom: 5 }, count: { color: '#5f7a75', fontSize: 13, fontWeight: '600' },
  calendar: { width: 58, backgroundColor: '#f1faf7', borderWidth: 1, borderColor: '#c3e4dc', borderRadius: 13, alignItems: 'center', overflow: 'hidden', paddingBottom: 7 }, month: { backgroundColor: '#def1eb', width: '100%', textAlign: 'center', paddingVertical: 4, fontSize: 10, fontWeight: '800', color: '#147d73' }, day: { fontSize: 23, lineHeight: 28, fontWeight: '800', color: '#147d73' }, weekday: { fontSize: 10, fontWeight: '600', color: '#5a7770' },
  state: { color: '#7964ad', fontSize: 11, fontWeight: '700', marginBottom: 4 }, serviceName: { color: '#173f3b', fontSize: 17, fontWeight: '700', lineHeight: 23 }, more: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f7f4' }, moreText: { color: '#466c63', fontSize: 16 },
  sunday: { minHeight: 44, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#f3f7f5', borderWidth: 1, borderColor: '#dce8e3' }, sundaySelected: { backgroundColor: '#fff4d9', borderColor: '#e4cf97' }, sundayText: { color: '#628078', fontSize: 12, fontWeight: '600' }, sundayTextSelected: { color: '#8d6316' },
  note: { padding: 12, backgroundColor: '#faf8f0', borderRadius: 12, gap: 5 }, noteLabel: { color: '#8c713e', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }, noteText: { color: '#76684d', fontSize: 13, lineHeight: 19 }, modal: { flex: 1, backgroundColor: '#f4f9f7' }, fieldLabel: { color: '#3f655b', fontSize: 13, fontWeight: '600' }, optionTitle: { color: '#173f3b', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#102e284d' }, sheet: { backgroundColor: '#f9fcfb', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, gap: 12 },
})
