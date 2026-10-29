import React, { useEffect, useId, useRef, useState } from 'react'
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, Vibration, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import { Ionicons } from '@expo/vector-icons'
import { useIsFocused, useRoute } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/session'
import { Button, Card, Empty, Field, Notice, Screen, Select, TextBody, Title } from '../ui'
import { dateTime } from '../lib/format'
import { memberToken, serviceAcceptsCheckIns } from '../lib/scannerRules'

type Service = { id: string; name: string; starts_at: string; location: string | null; archived_at?: string | null; check_ins: number }
type Member = { id: string; first_name: string; last_name: string; member_number?: string; status: string }
type Result = { type: 'success' | 'duplicate' | 'error'; title: string; name?: string; time?: string }
type Recent = { id: string; name: string; time: string }
const ink = '#183f3b', teal = '#147d73', muted = '#64817c'

/** A native camera session. It unmounts on blur/background; a hidden tab never owns the camera. */
export default function ScannerScreen() {
  const { account, session } = useSession()
  const focused = useIsFocused()
  const route = useRoute<any>()
  const [permission, requestPermission, getPermission] = useCameraPermissions()
  const [permissionChecking, setPermissionChecking] = useState(true)
  const [foreground, setForeground] = useState(AppState.currentState === 'active')
  const [services, setServices] = useState<Service[]>([])
  const [serviceId, setServiceId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [cameraError, setCameraError] = useState('')
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraRevision, setCameraRevision] = useState(0)
  const [facing, setFacing] = useState<'front' | 'back'>('back')
  const [torch, setTorch] = useState(false)
  const [paused, setPaused] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [cooling, setCooling] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [recent, setRecent] = useState<Recent[]>([])
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<Member[]>([])
  const [total, setTotal] = useState(0)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [selected, setSelected] = useState<Member | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const mounted = useRef(true), generation = useRef(0), lock = useRef(false)
  const cooldown = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wakeId = useId(), wakeSequence = useRef(0)
  const consumedRouteService = useRef<string | undefined>(undefined)
  const active = useRef({ id: serviceId, uid: session?.user.id, allowed: false, focused: false })
  const allowed = account?.status === 'active' && (account.role === 'owner' || account.role === 'admin')
  active.current = { id: serviceId, uid: session?.user.id, allowed, focused: focused && foreground }
  const event = services.find(item => item.id === serviceId)

  useEffect(() => {
    mounted.current = true
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'))
    return () => { mounted.current = false; generation.current++; subscription.remove(); if (cooldown.current) clearTimeout(cooldown.current) }
  }, [])
  useEffect(() => {
    generation.current++
    setSelected(null); setQuery(''); setMatches([]); setResult(null); setRecent([])
    setCameraError(''); setTorch(false)
  }, [serviceId, session?.user.id])
  useEffect(() => {
    if (!focused || !foreground || !allowed) { generation.current++; setCameraReady(false); setTorch(false) }
  }, [focused, foreground, allowed, session?.user.id])
  useEffect(() => {
    if (!focused || !foreground || !allowed) { setPermissionChecking(true); return }
    let disposed = false
    setPermissionChecking(true)
    // The Expo permission hook reads on mount/request, not when returning from Android Settings.
    void getPermission().catch(() => { if (!disposed) setCameraError('Camera permission could not be checked. Try again or use manual check-in.') }).finally(() => { if (!disposed) setPermissionChecking(false) })
    return () => { disposed = true }
  }, [focused, foreground, allowed, getPermission])
  useEffect(() => {
    if (!focused || !foreground || !allowed || !event || paused) return
    let cancelled = false
    // Unique leases prevent a delayed old cleanup from releasing a newer camera session's lock.
    const tag = `lifecity-scanner-${wakeId}-${++wakeSequence.current}`
    const release = () => { void Promise.resolve().then(() => deactivateKeepAwake(tag)).catch(() => { /* Android Activity may already have been destroyed. */ }) }
    void activateKeepAwakeAsync(tag).then(() => { if (cancelled) release() }).catch(() => { /* The scan remains available if the power-management hint is unsupported. */ })
    return () => { cancelled = true; release() }
  }, [focused, foreground, allowed, event?.id, paused])
  useEffect(() => {
    if (!focused || !foreground || !allowed) return
    let disposed = false
    setLoading(true); setError('')
    void (async () => {
      try {
        const { data, error: failure } = await supabase.rpc('lc_scanner_services')
        if (failure) throw failure
        if (!data || !Array.isArray(data.rows)) throw Error('The service list could not be verified.')
        if (disposed) return
        setServices(data.rows)
        setServiceId(current => {
          const requested = route.params?.serviceId
          if (requested && requested !== consumedRouteService.current && data.rows.some((item: Service) => item.id === requested)) { consumedRouteService.current = requested; return requested }
          return data.rows.some((item: Service) => item.id === current) ? current : ''
        })
      } catch (failure) { if (!disposed) setError((failure as Error).message || 'Services could not be loaded.') }
      finally { if (!disposed) setLoading(false) }
    })()
    return () => { disposed = true }
  }, [focused, foreground, allowed, session?.user.id, revision, route.params?.serviceId])

  useEffect(() => {
    let disposed = false
    const term = query.trim()
    setMatches([]); setTotal(0); setSearchError('')
    if (!term || selected || !serviceId || !allowed || !focused || !foreground) { setSearching(false); return }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const { data, error: failure } = await supabase.rpc('lc_scanner_member_search', { p_search: term })
        if (failure) throw failure
        if (!data || !Array.isArray(data.rows) || typeof data.total !== 'number') throw Error('Invalid search response.')
        if (!disposed) { setMatches(data.rows); setTotal(data.total) }
      } catch { if (!disposed) setSearchError('Member search is unavailable. Try another search or scan a QR.') }
      finally { if (!disposed) setSearching(false) }
    }, 300)
    return () => { disposed = true; clearTimeout(timer) }
  }, [query, selected, serviceId, allowed, focused, foreground, session?.user.id])

  async function managePermission() {
    try {
      setCameraError('')
      if (permission?.canAskAgain === false) await Linking.openSettings()
      else await requestPermission()
    } catch { if (mounted.current) setCameraError('Camera permission could not be opened. Use Android App Settings or manual check-in.') }
  }

  async function checkIn(input: { code: string } | { member: Member }) {
    const state = active.current
    if (lock.current || !state.id || !state.uid || !state.allowed || !state.focused) return
    lock.current = true
    const attempt = ++generation.current, id = state.id, uid = state.uid
    const current = () => mounted.current && generation.current === attempt && active.current.id === id && active.current.uid === uid && active.current.allowed && active.current.focused
    setProcessing(true); setResult(null)
    try {
      // A service may have been archived or completed while the scanner stayed open.
      const service = await supabase.from('events').select('id,starts_at,archived_at').eq('id', id).maybeSingle()
      if (!current()) return
      if (service.error) throw service.error
      if (!serviceAcceptsCheckIns(service.data)) {
        setResult({ type: 'error', title: 'This service is no longer available for check-in.' }); setRevision(value => value + 1); return
      }
      let lookup = supabase.from('members').select('id,first_name,last_name,status')
      if ('code' in input) {
        const token = memberToken(input.code)
        if (!token) { setResult({ type: 'error', title: 'This QR code is not valid.' }); return }
        lookup = lookup.eq('qr_token', token)
      } else lookup = lookup.eq('id', input.member.id)
      const { data: member, error: lookupError } = await lookup.maybeSingle()
      if (!current()) return
      if (lookupError) throw lookupError
      if (!member) { setResult({ type: 'error', title: 'No member found. Search or scan again.' }); return }
      const name = `${member.first_name} ${member.last_name}`
      if (member.status !== 'active') { setResult({ type: 'error', title: 'This member is inactive.', name }); return }
      const inserted = await supabase.from('attendance').insert({ member_id: member.id, event_id: id }).select('id,checked_in_at').single()
      if (!current()) return
      if (inserted.error?.code === '23505') { setResult({ type: 'duplicate', title: 'Already Checked In', name }); return }
      if (inserted.error) throw inserted.error
      if (!inserted.data?.id || !inserted.data.checked_in_at) throw Error('The saved check-in could not be confirmed.')
      const time = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(inserted.data.checked_in_at))
      Vibration.vibrate(75)
      setResult({ type: 'success', title: 'Checked In', name, time })
      setRecent(rows => [{ id: inserted.data.id, name, time }, ...rows].slice(0, 3))
      setServices(rows => rows.map(item => item.id === id ? { ...item, check_ins: (item.check_ins || 0) + 1 } : item))
      setSelected(null); setQuery('')
    } catch {
      if (current()) setResult({ type: 'error', title: 'Check-in could not be confirmed. Try again; existing check-ins will not be duplicated.' })
    } finally {
      if (mounted.current) { setProcessing(false); setCooling(true) }
      // Retain the write lock through the result cooldown, including a service/tab change.
      cooldown.current = setTimeout(() => { lock.current = false; if (mounted.current) setCooling(false) }, 1800)
    }
  }

  if (!allowed) return <Screen><Notice message="Your account does not have scanner access." tone="error" /></Screen>
  const canUseCamera = !!event && permission?.granted && !permissionChecking && focused && foreground && !paused && !cameraError
  return <Screen>
    <View style={styles.heading}><View style={{ flex: 1 }}><Text style={styles.kicker}>ATTENDANCE</Text><Title>Scanner</Title></View>{event && <View style={styles.count}><Text style={styles.countValue}>{(event.check_ins || 0).toLocaleString()}</Text><Text style={styles.caption}>Check-Ins</Text></View>}</View>
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}><View style={{ flex: 1 }}><Select label="Service" value={serviceId} options={[{ value: '', label: loading ? 'Loading Services…' : 'Choose a Service' }, ...services.map(item => ({ value: item.id, label: item.name }))]} onChange={value => { if (!lock.current) setServiceId(value) }} disabled={processing || cooling || loading} /></View><Pressable accessibilityLabel="Refresh Services" accessibilityRole="button" disabled={loading || processing || cooling} onPress={() => setRevision(value => value + 1)} style={styles.smallButton}>{loading ? <ActivityIndicator color={teal} /> : <Ionicons name="refresh" size={21} color={teal} />}</Pressable></View>
      {event && <TextBody>{dateTime(event.starts_at)}{event.location ? ` · ${event.location}` : ''}</TextBody>}
      {error && <Notice message={error} tone="error" />}
    </Card>
    {!event ? <Card><View style={styles.emptyArt}><Ionicons name="qr-code-outline" size={64} color={teal} /></View><Title>Choose a Service</Title><TextBody>Select the service receiving these check-ins, then scan a member QR or use manual search.</TextBody>{!loading && !services.length && <Empty title="No Available Services" message="Create an upcoming service before checking in members." />}</Card> : <>
      <View style={styles.cameraCard}>
        <View style={styles.cameraHeading}><Text style={styles.sectionTitle}>Scan a Member QR</Text><View style={styles.state}><View style={[styles.dot, { backgroundColor: cameraReady && !paused ? teal : '#b18538' }]} /><Text style={styles.caption}>{paused ? 'Paused' : cameraReady ? 'Camera Ready' : 'Camera'}</Text></View></View>
        <View style={styles.camera}>
          {canUseCamera ? <CameraView key={`${facing}:${cameraRevision}`} style={StyleSheet.absoluteFill} facing={facing} enableTorch={torch && facing === 'back'} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onCameraReady={() => { if (active.current.focused) setCameraReady(true) }} onMountError={() => { if (active.current.focused) { setCameraError('The camera could not start. You can retry or use manual check-in.'); setCameraReady(false) } }} onBarcodeScanned={processing || cooling ? undefined : value => { void checkIn({ code: value.data }) }} /> : <View style={styles.cameraFallback}><Ionicons name="camera-outline" size={42} color="#cceee8" /><Text style={styles.cameraFallbackText}>{permissionChecking ? 'Checking Camera Permission…' : cameraError || (paused ? 'Camera Paused' : !permission?.granted ? 'Camera Permission Required' : 'Camera Inactive')}</Text></View>}
          {canUseCamera && <View pointerEvents="none" style={styles.overlay}><View style={styles.shade} /><View style={styles.guideRow}><View style={styles.shade} /><View style={styles.guide}><View style={[styles.corner, styles.topLeft]} /><View style={[styles.corner, styles.topRight]} /><View style={[styles.corner, styles.bottomLeft]} /><View style={[styles.corner, styles.bottomRight]} /></View><View style={styles.shade} /></View><View style={[styles.shade, { alignItems: 'center', paddingTop: 16 }]}><Text style={styles.guideLabel}>{processing ? 'Checking In…' : cooling ? 'Please Wait' : 'Place QR Here'}</Text></View></View>}
          {processing && <View pointerEvents="none" style={styles.spinner}><ActivityIndicator color="#fff" size="large" /></View>}
          {!!result && <View pointerEvents="none" style={[styles.cameraResult, result.type === 'error' ? { backgroundColor: '#8f303e' } : result.type === 'duplicate' ? { backgroundColor: '#79561e' } : null]}><Ionicons name={result.type === 'success' ? 'checkmark-circle' : result.type === 'duplicate' ? 'information-circle' : 'alert-circle'} size={22} color="#fff" /><View style={{ flex: 1 }}><Text style={styles.cameraResultTitle}>{result.name || result.title}</Text>{result.name && <Text style={styles.cameraResultSub}>{result.title}</Text>}</View></View>}
        </View>
        <View style={styles.cameraTools}>
          {!permission?.granted ? <Button title={permission?.canAskAgain === false ? 'Open App Settings' : 'Allow Camera'} onPress={() => { void managePermission() }} disabled={permissionChecking} /> : <><Button title={paused ? 'Resume Camera' : 'Pause Camera'} variant="secondary" onPress={() => { setPaused(value => !value); setCameraReady(false) }} disabled={processing} /><Button title="Switch Camera" variant="secondary" onPress={() => { setFacing(value => value === 'back' ? 'front' : 'back'); setCameraReady(false); setTorch(false) }} disabled={processing || paused} /></>}
          {permission?.granted && facing === 'back' && !paused && !cameraError && <Button title={torch ? 'Light Off' : 'Light On'} variant="secondary" onPress={() => setTorch(value => !value)} />}
          {!!cameraError && <Button title="Retry Camera" onPress={() => { setCameraError(''); setCameraRevision(value => value + 1) }} />}
        </View>
      </View>
      <View accessibilityLiveRegion="polite" style={[styles.result, result?.type === 'error' ? styles.errorResult : result?.type === 'duplicate' ? styles.duplicateResult : null]}>
        <Ionicons name={result?.type === 'success' ? 'checkmark-circle-outline' : result?.type === 'error' ? 'alert-circle-outline' : result?.type === 'duplicate' ? 'information-circle-outline' : 'scan-outline'} size={28} color={result?.type === 'error' ? '#ab4048' : teal} />
        <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>{result?.title || 'Scan a QR Code'}</Text>{result?.name && <Text style={styles.resultName}>{result.name}</Text>}{result?.time && <Text style={styles.caption}>{result.time} · Manila Time</Text>}</View>
      </View>
      <Card>
        <Pressable accessibilityRole="button" accessibilityLabel={manualOpen ? 'Close Manual Check-In' : 'Open Manual Check-In'} onPress={() => setManualOpen(value => !value)} style={styles.disclosure}><View style={styles.disclosureIcon}><Ionicons name="search" size={20} color={teal} /></View><View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Manual Check-In</Text><Text style={styles.caption}>Find a member without a QR code.</Text></View><Ionicons name={manualOpen ? 'chevron-up' : 'chevron-down'} size={18} color={muted} /></Pressable>
        {manualOpen && <View style={{ gap: 12 }}><Field label="Find a Member" placeholder="Name, Member ID or Contact" value={query} onChangeText={value => { setQuery(value); setSelected(null) }} editable={!processing && !cooling} autoCorrect={false} />{searching && <ActivityIndicator color={teal} />}{searchError && <Notice message={searchError} tone="error" />}{!searching && !selected && query.trim() && !matches.length && !searchError && <TextBody>No matching members.</TextBody>}{matches.map(member => <Pressable key={member.id} accessibilityRole="button" accessibilityLabel={`Select ${member.first_name} ${member.last_name}`} disabled={processing || cooling || member.status !== 'active'} onPress={() => { setSelected(member); setMatches([]) }} style={[styles.member, member.status !== 'active' && { opacity: 0.5 }]}><View style={{ flex: 1 }}><Text style={styles.sectionTitle}>{member.first_name} {member.last_name}</Text><Text style={styles.caption}>{member.member_number}{member.status !== 'active' ? ' · Inactive' : ''}</Text></View><Ionicons name="add-circle-outline" size={22} color={teal} /></Pressable>)}{total > matches.length && !selected && <TextBody>{total} matches. Refine your search to find a member.</TextBody>}{selected && <View style={styles.selected}><Ionicons name="person-circle-outline" size={28} color={teal} /><View style={{ flex: 1 }}><Text style={styles.sectionTitle}>{selected.first_name} {selected.last_name}</Text><Text style={styles.caption}>{selected.member_number}</Text></View><Pressable accessibilityLabel="Clear Selected Member" accessibilityRole="button" style={styles.smallButton} onPress={() => setSelected(null)}><Ionicons name="close" size={20} color={muted} /></Pressable></View>}<Button title="Check In Member" onPress={() => { if (selected) void checkIn({ member: selected }) }} disabled={!selected || processing || cooling} loading={processing} /></View>}
      </Card>
      {!!recent.length && <Card><Text style={styles.sectionTitle}>Recent Check-Ins</Text>{recent.map(item => <View key={item.id} style={styles.recent}><Ionicons name="checkmark-circle" size={17} color={teal} /><Text style={{ flex: 1, color: ink, fontSize: 14 }}>{item.name}</Text><Text style={styles.caption}>{item.time}</Text></View>)}</Card>}
    </>}
  </Screen>
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: 16 }, kicker: { color: teal, fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  caption: { color: muted, fontSize: 12, lineHeight: 18 }, count: { alignItems: 'center', backgroundColor: '#e6f5f0', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 18 }, countValue: { color: teal, fontWeight: '800', fontSize: 27 },
  emptyArt: { height: 120, justifyContent: 'center', alignItems: 'center', backgroundColor: '#edf8f4', borderRadius: 20 },
  cameraCard: { backgroundColor: '#fff', borderRadius: 24, borderWidth: 1, borderColor: '#d8e8e4', overflow: 'hidden' }, cameraHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, gap: 10 }, sectionTitle: { color: ink, fontSize: 15, fontWeight: '700', lineHeight: 21 },
  state: { flexDirection: 'row', alignItems: 'center', gap: 5 }, dot: { width: 6, height: 6, borderRadius: 3 }, camera: { aspectRatio: 1, backgroundColor: '#102d29', minHeight: 250 }, cameraFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }, cameraFallbackText: { color: '#dbf0eb', textAlign: 'center', fontSize: 15, lineHeight: 23 },
  overlay: { ...StyleSheet.absoluteFill }, shade: { flex: 1, backgroundColor: 'rgba(2,18,15,0.55)' }, guideRow: { flexDirection: 'row', height: '62%' }, guide: { width: '62%', position: 'relative' }, corner: { position: 'absolute', width: 26, height: 26, borderColor: '#c9fff0' }, topLeft: { top: 0, left: 0, borderLeftWidth: 3, borderTopWidth: 3, borderTopLeftRadius: 8 }, topRight: { top: 0, right: 0, borderRightWidth: 3, borderTopWidth: 3, borderTopRightRadius: 8 }, bottomLeft: { bottom: 0, left: 0, borderLeftWidth: 3, borderBottomWidth: 3, borderBottomLeftRadius: 8 }, bottomRight: { bottom: 0, right: 0, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 8 }, guideLabel: { color: '#fff', fontSize: 12, fontWeight: '700', backgroundColor: '#174e43', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 }, spinner: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' }, cameraTools: { padding: 14, gap: 10, flexDirection: 'row', flexWrap: 'wrap' }, cameraResult: { position: 'absolute', top: 12, left: 12, right: 12, borderRadius: 14, padding: 13, backgroundColor: '#145e4e', flexDirection: 'row', alignItems: 'center', gap: 10 }, cameraResultTitle: { color: '#fff', fontSize: 17, lineHeight: 23, fontWeight: '700' }, cameraResultSub: { color: '#e1f6ed', fontSize: 12, lineHeight: 18 },
  result: { borderWidth: 1, borderColor: '#bbdfd5', backgroundColor: '#eaf7f0', borderRadius: 20, flexDirection: 'row', padding: 18, alignItems: 'center', gap: 13, minHeight: 94 }, errorResult: { backgroundColor: '#fff0f0', borderColor: '#f0cbd0' }, duplicateResult: { backgroundColor: '#fff7e7', borderColor: '#e8d8b8' }, resultName: { color: teal, fontSize: 23, fontWeight: '800', marginVertical: 4 },
  disclosure: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, marginBottom: 8 }, disclosureIcon: { borderRadius: 13, padding: 10, backgroundColor: '#eaf6f2' }, member: { padding: 14, minHeight: 64, borderWidth: 1, borderColor: '#dbe9e5', borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }, selected: { padding: 14, backgroundColor: '#e7f5ef', borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, smallButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, recent: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
})
