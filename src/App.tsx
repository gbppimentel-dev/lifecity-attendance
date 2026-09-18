// Change ID: LC-P07B-v1
import { uiMessage } from './lib/uiText'
// Full replacement for src/App.tsx; requires the installed Phase 1 foundation and LC-P02A-v1.sql plus LC-P02B-v1.sql.
import type { Session } from '@supabase/supabase-js'
import { type ReactNode, type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  RefreshCw,
  ShieldCheck,
  Link2,
  PauseCircle,
  CalendarDays,
  Archive,
  ArchiveRestore,
  Camera,
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  Settings,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import MobileAdminNav from './components/MobileAdminNav'
import MemberPortal from './components/MemberPortal'
import MemberLinkRequests from './components/MemberLinkRequests'
import ServiceExport from './components/ServiceExport'
import SettingsWorkspace from './components/SettingsWorkspace'
import { useSharedAppearance } from './lib/appearance'
import AttendanceRecords from './components/AttendanceRecords'
import GuestPreview from './components/GuestPreview'
import AttendanceScanner from './components/AttendanceScanner'
import Dashboard from './components/Dashboard'
import MemberManager from './components/MemberManager'
import { supabase } from './lib/supabase'

type Page = 'dashboard' | 'members' | 'events' | 'scanner' | 'records' | 'settings' | 'profile'

type AttendanceEvent = {
  id: string
  name: string
  starts_at: string
  ends_at: string | null
  location: string | null
  admin_note: string | null
  is_sunday_service: boolean
  is_public: boolean
  archived_at: string | null
  created_at: string
}

const emptyEvent = {
  name: '',
  startsDate: '',
  startsTime: '',
  location: '',
  adminNote: '',
  isSundayService: false,
  isPublic: false,
}

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function eventDateTime(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function dateTimeLocal(value: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(value))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

function getServiceState(item: AttendanceEvent, now: number) {
  if (item.archived_at) return { label: 'Archived', className: 'archived' }

  const startsAt = new Date(item.starts_at).getTime()
  if (now < startsAt) return { label: 'Upcoming', className: 'upcoming' }
  if (now < startsAt + 3 * 60 * 60 * 1000) {
    return { label: 'In Progress', className: 'in-progress' }
  }

  return { label: 'Completed', className: 'completed' }
}

type LifeCityAccount = {
  user_id: string; member_id: string | null; member_name: string | null;
  role: 'owner' | 'admin' | 'user'; status: 'active' | 'suspended';
  email: string | null; display_name: string; foundation_version: string;
}

function maskedEmail(value: string | null | undefined) {
  if (!value || !value.includes('@')) return 'Signed-In Account'
  const [local, domain] = value.split('@')
  return local.slice(0, 2) + '***@' + domain
}

function AccountBrand() {
  return <div className="brand"><div className="brand-icon small"><Users size={20}/></div><span>LifeCity Attendance</span></div>
}

function AccountShell({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return <main className={'lc-auth-page' + (compact ? ' lc-auth-compact' : '')} data-change-id="LC-UI-COPY-v2">
    <header className="lc-auth-brand"><AccountBrand/><span>A place to belong.</span></header>
    <section className="lc-auth-frame">
      {!compact && <aside className="lc-auth-story">
        <p className="eyebrow">Gather. Connect. Grow.</p><h1>Every Face.<br/>Every Gathering.<br/><em>One community.</em></h1>
        <p>A little less admin.<br/>A little more time together.</p>
        <div className="lc-auth-art" aria-hidden="true"><div className="lc-auth-orbit"/><div className="lc-auth-art-card"><Users size={30}/><strong>Life Happens Together.</strong><span>LifeCity Community</span></div><span className="lc-auth-sticker"><CalendarDays size={18}/>See You at Church</span></div>
      </aside>}
      <div className="lc-auth-body">{children}</div>
    </section>
    <footer className="lc-auth-footer">LifeCity Attendance <span>•</span> Connected in Community</footer>
  </main>
}

export default function App() {
  useSharedAppearance()
  const [session, setSession] = useState<Session | null>(null)
  const [booting, setBooting] = useState(true)
  const [authError, setAuthError] = useState('')
  const [resolved, setResolved] = useState<{ uid: string; account: LifeCityAccount | null; error: string } | null>(null)
  const [retry, setRetry] = useState(0)
  const [working, setWorking] = useState(false)
  const [showGuest, setShowGuest] = useState(false)
  const [oauthError,setOauthError] = useState(()=>{
    const query=new URLSearchParams(window.location.search)
    const hash=new URLSearchParams(window.location.hash.slice(1))
    return query.has('error')||hash.has('error') ? 'Sign-in was not completed. Please try Google sign-in again.' : ''
  })
  const authWriteLock=useRef(false)
  const authRedirect=()=>window.location.origin+window.location.pathname
  async function googleSignIn(){
    if(authWriteLock.current)return
    authWriteLock.current=true;setWorking(true);setAuthError('');setOauthError('')
    try {
      const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:authRedirect(),queryParams:{prompt:'select_account'}}})
      if(error)throw error
    } catch {setAuthError('Google sign-in could not start. Please try again or contact your church administrator.')}
    finally {authWriteLock.current=false;setWorking(false)}
  }


  useEffect(() => {
    let active = true, observed = false
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      observed = true
      if (!active) return
      setSession(next); setBooting(false); setAuthError('')
    })
    void supabase.auth.getSession().then(({data,error}) => {
      if (!active || observed) return
      if (error) setAuthError('Unable to restore your session. Please sign in again.')
      setSession(data.session); setBooting(false)
    }).catch(() => { if (active && !observed) { setAuthError('Unable to restore your session.'); setBooting(false) } })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    const uid = session?.user.id
    if (!uid) { setResolved(null); return }
    let active = true, inFlight = false
    async function refresh() {
      if (inFlight || !active) return
      inFlight = true
      try {
        const {data,error} = await supabase.rpc('lc_my_account')
        if (error) throw new Error(error.code === 'PGRST202'
          ? 'Account setup is not installed. Run LC-P01-02-v1.sql in your Supabase project, then retry.'
          : 'Unable to verify your access. Please retry or sign out.')
        if (!data || data.user_id !== uid || data.foundation_version !== 'LC-P01-02-v1'
          || !['owner','admin','user'].includes(data.role) || !['active','suspended'].includes(data.status)) {
          throw new Error('Account verification returned an unexpected result. Access remains closed.')
        }
        if (active) setResolved({uid: uid!,account:data as LifeCityAccount,error:''})
      } catch(error) {
        if (active) setResolved({uid:uid!,account:null,error:error instanceof Error ? error.message : 'Unable to verify access.'})
      } finally { inFlight = false }
    }
    void refresh()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 30000)
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange',onVisible)
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange',onVisible) }
  }, [session?.user.id,session?.access_token,retry])

  async function signOut() {
    setWorking(true); setAuthError('')
    try {
      const {error} = await supabase.auth.signOut()
      if (error) throw error
      setResolved(null); setSession(null); setOauthError('')
    } catch { setAuthError('Unable to sign out. Please try again.') }
    finally { setWorking(false) }
  }
  const current = resolved?.uid === session?.user.id ? resolved : null
  const account = current?.account
  if (booting || (session && !current)) return (
    <AccountShell compact><div className="lc-auth-check" role="status" aria-live="polite"><div className="lc-auth-check-mark"><ShieldCheck size={32}/></div><p className="eyebrow">Getting Things Ready</p><h1>Making Room for You.</h1><p>Checking your account and opening your LifeCity space.</p><div className="lc-auth-progress" aria-hidden="true"><span/></div><span className="lc-auth-caption">Just a Moment…</span></div></AccountShell>
  )
  if (!session && showGuest) return <GuestPreview onBack={()=>setShowGuest(false)} onSignIn={()=>void googleSignIn()} signingIn={working} error={oauthError || authError}/>
  if (!session) return (
    <AccountShell>
      <div className="lc-google-welcome" data-change-id="LC-UI-COPY-v2">
        <p className="eyebrow">Your LifeCity Space</p>
        <h2>Good to See You.</h2>
        <p className="lc-auth-intro">Your community, your member ID, and the moments we share. All in one place.</p>
        <button type="button" className="lc-google-button lc-google-only-button" disabled={working} aria-busy={working} onClick={()=>void googleSignIn()}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48"><path fill="#4285F4" d="M43.6 24.5c0-1.5-.1-2.9-.4-4.3H24v8.1h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.7c3.9-3.6 6-8.9 6-15.2Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.2c-1.8 1.2-4.1 1.9-6.8 1.9-5.3 0-9.8-3.6-11.4-8.4H5.7v5.4A20.4 20.4 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.4a12.2 12.2 0 0 1 0-7.8v-5.4H5.7a20.3 20.3 0 0 0 0 18.6l6.9-5.4Z"/><path fill="#EA4335" d="M24 11.2c3 0 5.6 1 7.6 3l5.7-5.7A19.3 19.3 0 0 0 24 3 20.4 20.4 0 0 0 5.7 14.2l6.9 5.4c1.6-4.8 6.1-8.4 11.4-8.4Z"/></svg>
          <span>{working ? 'Connecting to Google…' : 'Continue with Google'}</span>
          {working ? <RefreshCw size={18} className="lc-auth-spin"/> : <ArrowRight size={18} className="lc-google-arrow"/>}
        </button>
        {(oauthError || authError) && <p className="lc-auth-error" role="alert">{oauthError || authError}</p>}
        <button type="button" className="lcg-welcome-link" disabled={working} onClick={()=>setShowGuest(true)}>Explore as a Guest <ArrowRight size={16}/></button>
        <div className="lc-google-welcome-note">
          <span className="lc-google-note-icon" aria-hidden="true"><ShieldCheck size={22}/></span>
          <div><strong>One Account. A Warm Welcome.</strong><p>Use Google to sign in or create your LifeCity login. No separate LifeCity password to remember.</p></div>
        </div>
        <p className="lc-auth-help">Already registered at church? After signing in, request to connect your existing member profile. Your member ID and attendance stay together.</p>
      </div>
    </AccountShell>
  )
  if (account?.status === 'active' && (account.role === 'owner' || account.role === 'admin')) {
    return <AdminWorkspace key={session.user.id} account={account} onRefreshAccess={() => setRetry(v=>v+1)}/>
  }
  if (account?.status === 'active' && account.member_id) {
    return <MemberPortal key={session.user.id} onRefreshAccess={()=>setRetry(v=>v+1)} onSignOut={()=>void signOut()} signingOut={working} authError={uiMessage(authError)}/>
  }
  const paused = account?.status === 'suspended'
  return (
    <AccountShell compact>
      <div className={'lc-auth-state-icon' + (paused ? ' is-paused' : '')}>{paused ? <PauseCircle size={28}/> : current?.error ? <ShieldCheck size={28}/> : <Link2 size={28}/>}</div>
      <p className="eyebrow">{paused ? 'Account Access' : 'Your LifeCity Account'}</p>
      <h1>{current?.error ? 'Let’s Try That Again.' : paused ? 'Your Access is on Pause.' : account?.member_id ? 'You’re Connected.' : 'Welcome to LifeCity.'}</h1>
      <p className="lc-auth-identity"><span>Signed in as</span><strong>{maskedEmail(session.user.email)}</strong></p>
      {current?.error ? <p className="lc-auth-error" role="alert">{uiMessage(current.error)}</p> : paused
        ? <div className="lc-auth-note is-paused"><strong>A Little Help from Your Administrator</strong><p>Please contact your church administrator to review your access. Once it’s restored, choose Refresh access below.</p></div>
        : <><div className="lc-auth-note"><strong>{account?.member_id ? 'Member Profile Connected' : 'Your Next Step: Connect Your Member Profile'}</strong><p>{account?.member_id ? account.member_name : 'Your account is ready. Send a request below to connect your existing member record.'}</p></div><p className="lc-auth-help">{account?.member_id ? 'Your personal member portal is coming in a future update.' : 'Already registered at church? There’s no need to register again. Your attendance and member ID stay with your existing profile.'}</p></>}
      {account?.status === 'active' && !current?.error && <MemberLinkRequests key={session.user.id} linked={!!account.member_id} onChanged={()=>setRetry(v=>v+1)}/>}
      {authError && <p className="lc-auth-error" role="alert">{uiMessage(authError)}</p>}
      <div className="lc-auth-state-actions"><button className="lc-auth-primary" onClick={()=>setRetry(v=>v+1)} disabled={working}><RefreshCw size={17}/>Refresh Access</button><button className="lc-auth-signout" onClick={()=>void signOut()} disabled={working}><LogOut size={17}/>{working ? 'Signing Out…' : 'Sign Out'}</button></div>
    </AccountShell>
  )
}

function AdminWorkspace({ account, onRefreshAccess }: { account: LifeCityAccount; onRefreshAccess: () => void }) {
  const [userEmail, setUserEmail] = useState<string | null>(account.email)
  const [signingOut, setSigningOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [page, setPage] = useState<Page>('dashboard')
  const [isPageTransitioning, setIsPageTransitioning] = useState(false)
  const [events, setEvents] = useState<AttendanceEvent[]>([])
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const [attendanceCounts, setAttendanceCounts] = useState<Record<string, number>>({})
  const [activeMemberCount, setActiveMemberCount] = useState(0)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const [eventForm, setEventForm] = useState(emptyEvent)
  const [showEventForm, setShowEventForm] = useState(false)
  const [editingService, setEditingService] = useState<AttendanceEvent | null>(null)
  const [scannerEventId, setScannerEventId] = useState('')
  const [serviceMonth, setServiceMonth] = useState('')
  const [serviceYear, setServiceYear] = useState('')
  const [serviceSort, setServiceSort] = useState<'recent' | 'oldest'>('recent')
  const [archiveFilter, setArchiveFilter] = useState<'all' | 'active' | 'archived'>('active')
  const [serviceActionTarget, setServiceActionTarget] = useState<
    { kind: 'delete' | 'archive' | 'restore'; item: AttendanceEvent } | null
  >(null)
  const serviceFormRef = useRef<HTMLElement | null>(null)
  const scannerServicePickerRef = useRef<HTMLElement | null>(null)
  const pageTransitionTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user.email ?? null)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null)
    })

    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => () => {
    if (pageTransitionTimeoutRef.current !== null) {
      window.clearTimeout(pageTransitionTimeoutRef.current)
    }
  }, [])

  function changePage(nextPage: Page) {
    if (nextPage === page) return

    if (pageTransitionTimeoutRef.current !== null) {
      window.clearTimeout(pageTransitionTimeoutRef.current)
    }

    setPage(nextPage)
    if (window.matchMedia('(max-width: 900px)').matches) {
      window.scrollTo({top:0,behavior:'auto'})
    }
    setIsPageTransitioning(true)

    const duration = 1000 + Math.floor(Math.random() * 1001)
    pageTransitionTimeoutRef.current = window.setTimeout(() => {
      setIsPageTransitioning(false)
      pageTransitionTimeoutRef.current = null
    }, duration)
  }

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (userEmail) {
      void loadEvents()
    }
  }, [userEmail])

  useEffect(() => {
    if (!userEmail) return

    const channel = supabase
      .channel('service-checkin-count-refresh')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        () => void loadEvents(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userEmail])

  async function loadEvents() {
    const [eventsResult, attendanceResult, membersResult] = await Promise.all([
      supabase.from('events').select('*').order('starts_at', { ascending: false }),
      supabase.from('attendance').select('event_id'),
      supabase.from('members').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    ])

    const error = eventsResult.error ?? attendanceResult.error ?? membersResult.error
    if (error) {
      setMessage(error.message)
      return
    }

    const loadedEvents = eventsResult.data as AttendanceEvent[]
    setEvents(loadedEvents)
    setActiveMemberCount(membersResult.count ?? 0)
    setAttendanceCounts(
      (attendanceResult.data ?? []).reduce<Record<string, number>>((counts, record) => {
        counts[record.event_id] = (counts[record.event_id] ?? 0) + 1
        return counts
      }, {}),
    )

  }

  async function handleAddEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setLoading(true)

    const values = {
      name: eventForm.name.trim(),
      starts_at: new Date(`${eventForm.startsDate}T${eventForm.startsTime}`).toISOString(),
      location: eventForm.location.trim() || null,
      admin_note: eventForm.adminNote.trim() || null,
      is_sunday_service: eventForm.isSundayService,
      is_public: eventForm.isPublic,
    }

    const { error } = editingService
      ? await supabase.from('events').update(values).eq('id', editingService.id)
      : await supabase.from('events').insert(values)

    if (error) {
      setMessage(error.message)
    } else {
      setEventForm(emptyEvent)
      setShowEventForm(false)
      setEditingService(null)
      await loadEvents()
    }

    setLoading(false)
  }

  async function toggleSundayService(item: AttendanceEvent) {
    setMessage('')
    setLoading(true)

    const { error } = await supabase
      .from('events')
      .update({ is_sunday_service: !item.is_sunday_service })
      .eq('id', item.id)

    if (error) {
      setMessage(error.message)
    } else {
      await loadEvents()
    }

    setLoading(false)
  }

  async function requestDeleteService(item: AttendanceEvent) {
    setMessage('')
    setServiceActionTarget({ kind: 'delete', item })
  }

  async function confirmServiceAction() {
    if (!serviceActionTarget || loading) return
    const { kind, item } = serviceActionTarget
    setLoading(true)
    setMessage('')
    try {
      if (kind === 'delete') {
        const { count, error: checkError } = await supabase.from('attendance')
          .select('id', { count: 'exact', head: true }).eq('event_id', item.id)
        if (checkError) throw checkError
        if ((count ?? 0) > 0) {
          setServiceActionTarget({ kind: 'archive', item })
          setMessage('This service now has attendance records. Archive it instead to preserve its history.')
          return
        }
        const { error } = await supabase.from('events').delete().eq('id', item.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('events')
          .update({ archived_at: kind === 'archive' ? new Date().toISOString() : null })
          .eq('id', item.id)
        if (error) throw error
      }
      setServiceActionTarget(null)
      await loadEvents()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (error as { message?: string }).message ?? 'Unable to update the service. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function openCreateService() {
    setMessage('')
    setEditingService(null)
    setEventForm(emptyEvent)
    setShowEventForm(true)

    window.requestAnimationFrame(() => {
      serviceFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function openEditService(item: AttendanceEvent) {
    setMessage('')
    setEditingService(item)
    setEventForm({
      name: item.name,
      startsDate: dateTimeLocal(item.starts_at).slice(0, 10),
      startsTime: dateTimeLocal(item.starts_at).slice(11),
      location: item.location ?? '',
      adminNote: item.admin_note ?? '',
      isSundayService: item.is_sunday_service,
      isPublic: item.is_public ?? false,
    })
    setShowEventForm(true)

    window.requestAnimationFrame(() => {
      serviceFormRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  function openScannerForService(item: AttendanceEvent) {
    setScannerEventId(item.id)
    changePage('scanner')
  }

  async function handleLogout() {
    if (signingOut) return
    setSigningOut(true); setLogoutError('')
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setEvents([])
    } catch { setLogoutError('Unable to sign out. Please try again.') }
    finally { setSigningOut(false) }
  }

  const selectedScannerEvent =
    events.find((event) => event.id === scannerEventId) ?? null

  const serviceYears = useMemo(
    () =>
      [...new Set(
        events.map((item) =>
          new Intl.DateTimeFormat('en-PH', {
            timeZone: 'Asia/Manila',
            year: 'numeric',
          }).format(new Date(item.starts_at)),
        ),
      )].sort((a, b) => Number(b) - Number(a)),
    [events],
  )

  const filteredServices = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      month: 'numeric',
      year: 'numeric',
    })

    return events
      .filter((item) => {
        const parts = Object.fromEntries(
          formatter
            .formatToParts(new Date(item.starts_at))
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, part.value]),
        )

        return (
          (archiveFilter === 'all' ||
            (archiveFilter === 'active' && !item.archived_at) ||
            (archiveFilter === 'archived' && item.archived_at)) &&
          (!serviceMonth || parts.month === serviceMonth) &&
          (!serviceYear || parts.year === serviceYear)
        )
      })
      .sort((a, b) => {
        const difference =
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
        return serviceSort === 'recent' ? -difference : difference
      })
  }, [archiveFilter, events, serviceMonth, serviceSort, serviceYear])

  return (
    <main className="app-page lc-mobile-workspace">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon small">
            <Users size={20} />
          </div>
          <span>LifeCity Attendance</span>
        </div>

        <nav className="main-nav" aria-label="Desktop Workspace Navigation">
          <button
            className={page === 'dashboard' ? 'nav-active' : ''}
            onClick={() => changePage('dashboard')}
          >
            <LayoutDashboard size={17} />
            Dashboard
          </button>

          <button
            className={page === 'members' ? 'nav-active' : ''}
            onClick={() => changePage('members')}
          >
            <Users size={17} />
            Members
          </button>

          <button
            className={page === 'events' ? 'nav-active' : ''}
            onClick={() => changePage('events')}
          >
            <CalendarDays size={17} />
            Services
          </button>

          <button
            className={page === 'scanner' ? 'nav-active' : ''}
            onClick={() => changePage('scanner')}
          >
            <Camera size={17} />
            Scanner
          </button>

          <button
            className={page === 'records' ? 'nav-active' : ''}
            onClick={() => changePage('records')}
          >
            <ClipboardList size={17} />
            Records
          </button>
          {account.role === 'owner' && <button className={page === 'settings' ? 'nav-active' : ''} onClick={() => changePage('settings')}><Settings size={17}/>Settings</button>}
        </nav>

        <details className="lc-account-menu lc-account-menu-v2" onKeyDown={e=>{if(e.key==='Escape'){e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus()}}}>
          <summary><span className="lc-account-avatar" aria-hidden="true">{(account.display_name || userEmail || 'L').slice(0,1).toUpperCase()}</span><span><small>Logged in as</small><strong>{account.role === 'owner' ? 'Owner' : 'Administrator'}</strong></span><ChevronDown size={15}/></summary>
          <div className="lc-account-popover">
            <div className="lc-menu-identity"><span className="lc-menu-kicker">Your Account</span><strong>{account.display_name && !account.display_name.includes('@') ? account.display_name : 'LifeCity Account'}</strong><span className="lc-menu-email">{maskedEmail(userEmail)}</span></div>
            <dl className="lc-menu-facts"><div><dt>Access Role</dt><dd>{account.role === 'owner' ? 'Owner' : 'Administrator'}</dd></div><div><dt>Member Profile</dt><dd>{account.member_id ? (account.member_name || 'Connected') : 'Not Linked Yet'}</dd></div></dl>
            <div className="lc-menu-actions"><button className="lc-menu-action" onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');changePage('profile')}}><Link2 size={16}/>My Member Space</button>
            <button type="button" onClick={onRefreshAccess} disabled={signingOut}><RefreshCw size={16}/><span>Refresh Access</span></button><button type="button" className="lc-menu-signout" onClick={()=>void handleLogout()} disabled={signingOut}><LogOut size={16}/><span>{signingOut ? 'Signing Out…' : 'Sign Out'}</span><ArrowRight size={15}/></button></div>
            {logoutError && <p role="alert" className="lc-auth-error">{uiMessage(logoutError)}</p>}
          </div>
        </details>
      </header>

      <MobileAdminNav page={page} isOwner={account.role === 'owner'} onNavigate={changePage}/>

      <section className="content">
        {isPageTransitioning && (
          <div className="page-transition-loader" role="status" aria-live="polite">
            <div className="page-transition-loader-card">
              <span className="page-transition-loader-orbit" aria-hidden="true" />
              <span className="page-transition-loader-dot page-transition-loader-dot-one" aria-hidden="true" />
              <span className="page-transition-loader-dot page-transition-loader-dot-two" aria-hidden="true" />
              <div className="page-transition-loader-mark" aria-hidden="true">✦</div>
              <p>Getting Things Ready</p>
              <strong>Opening {page === 'events' ? 'services' : page}</strong>
            </div>
          </div>
        )}

        {page === 'dashboard' && (
          <Dashboard
            activeScannerEventId={scannerEventId}
            onOpenScanner={() => changePage('scanner')}
            onViewRecords={() => changePage('records')}
          />
        )}

        {page === 'profile' && (account.member_id ? <MemberPortal key={account.user_id} embedded onRefreshAccess={onRefreshAccess}/> : <MemberLinkRequests key={account.user_id} linked={false} onChanged={onRefreshAccess}/>)}
        {page === 'settings' && account.role === 'owner' && <SettingsWorkspace currentUserId={account.user_id} onLinkChanged={onRefreshAccess}/>}
        {page === 'members' && <MemberManager />}

        {page === 'events' && (
          <>
            <section className="services-editorial-hero">
              <div className="services-hero-copy">
                <p className="eyebrow">Attendance Setup</p>
                <h1>Services</h1>
                <p>
                  Create and manage services before checking in members.
                </p>
                <span className="services-hero-caption">Plan it. Check in. Keep the story.</span>
              </div>

              <button
                type="button"
                className={`services-create-action${showEventForm ? ' is-open' : ''}`}
                onClick={() => (showEventForm ? setShowEventForm(false) : openCreateService())}
                aria-expanded={showEventForm}
              >
                <span className="services-create-action-kicker">
                  {showEventForm ? 'Form is Open' : 'Start Here'}
                </span>
                <strong>{showEventForm ? 'Close Form' : 'New Service'}</strong>
                <span className="services-create-action-note">
                  {showEventForm ? 'Return to Your List' : 'Set the Date & Time'}
                </span>
                <span className="services-create-action-icon" aria-hidden="true">
                  {showEventForm ? <X size={21} /> : <Plus size={22} />}
                </span>
              </button>

              <span className="services-hero-orbit" aria-hidden="true" />
              <span className="services-hero-spark services-hero-spark-one" aria-hidden="true">✦</span>
              <span className="services-hero-spark services-hero-spark-two" aria-hidden="true">✦</span>
            </section>

            {showEventForm && (
              <section className="form-card service-form-card" ref={serviceFormRef}>
                <div className="service-form-heading">
                  <div>
                    <p className="eyebrow">
                      {editingService ? 'Edit Event' : 'New Event'}
                    </p>
                    <h2>{editingService ? 'Update This Event' : 'Create an Event'}</h2>
                  </div>
                  <button
                    className="close-button"
                    type="button"
                    onClick={() => {
                      setShowEventForm(false)
                      setEditingService(null)
                      setEventForm(emptyEvent)
                    }}
                    aria-label="Close Service Form"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form className="event-form" onSubmit={handleAddEvent}>
                  <label className="wide-field">
                    Event Name
                    <input
                      value={eventForm.name}
                      onChange={(event) =>
                        setEventForm({
                          ...eventForm,
                          name: event.target.value,
                        })
                      }
                      placeholder="Sunday Worship"
                      required
                    />
                  </label>

                  <label>
                    Date
                    <input
                      type="date"
                      value={eventForm.startsDate}
                      onChange={(event) =>
                        setEventForm({
                          ...eventForm,
                          startsDate: event.target.value,
                        })
                      }
                      required
                    />
                  </label>

                  <label>
                    Time
                    <input
                      type="time"
                      value={eventForm.startsTime}
                      onChange={(event) =>
                        setEventForm({
                          ...eventForm,
                          startsTime: event.target.value,
                        })
                      }
                      required
                    />
                  </label>

                  <label className="wide-field">
                    Location <span>Optional</span>
                    <input
                      value={eventForm.location}
                      onChange={(event) =>
                        setEventForm({
                          ...eventForm,
                          location: event.target.value,
                        })
                      }
                      placeholder="Main Sanctuary"
                    />
                  </label>

                  <label className="wide-field service-note-field">
                    <span>Service Note <em>Optional</em></span>
                    <small>
                      Private to admins. Use this to explain unusual attendance later—for example, a combined service, rainy Sunday, or youth outreach.
                    </small>
                    <textarea
                      value={eventForm.adminNote}
                      onChange={(event) =>
                        setEventForm({
                          ...eventForm,
                          adminNote: event.target.value,
                        })
                      }
                      placeholder="Example: Combined service because of the holiday."
                      rows={3}
                    />
                  </label>

                  <label className="event-type-toggle service-sunday-field wide-field">
                    <input
                      type="checkbox"
                      checked={eventForm.isSundayService}
                      onChange={(event) =>
                        setEventForm({
                          ...eventForm,
                          isSundayService: event.target.checked,
                        })
                      }
                    />
                    <span>
                      <strong>Sunday Service</strong>
                      <small>
                        Show attendance as a total and percentage of all active members.
                      </small>
                    </span>
                  </label>

                  <label className="event-type-toggle wide-field lcg-publish-option">
                    <input type="checkbox" checked={eventForm.isPublic} disabled={loading} onChange={event=>setEventForm({...eventForm,isPublic:event.target.checked})}/>
                    <span><strong>Show in Guest Preview</strong><small>Make this service’s name, date, venue, and Sunday Service label visible to visitors. Only current and upcoming services appear; admin notes and attendance stay private.</small></span>
                  </label>

                  {message && (
                    <p className="error-message wide-field">{uiMessage(message)}</p>
                  )}

                  <div className="form-actions wide-field">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setShowEventForm(false)}
                    >
                      Cancel
                    </button>

                    <button className="primary-button" disabled={loading}>
                      <Plus size={18} />
                      {loading ? 'Saving…' : editingService ? 'Save Changes' : 'Save Event'}
                    </button>
                  </div>
                </form>
              </section>
            )}

            <section className="directory-card lc-services-directory">
              <div className="directory-toolbar">
                <div>
                  <h2>All Services</h2>
                  <p>{filteredServices.length} of {events.length} Shown</p>
                </div>
                <div className="service-directory-controls">
                  <label className="filter-select">
                    Status
                    <select value={archiveFilter} onChange={(event) => setArchiveFilter(event.target.value as 'all' | 'active' | 'archived')}>
                      <option value="all">All</option>
                      <option value="active">Active</option>
                      <option value="archived">Archived</option>
                    </select>
                  </label>
                  <label className="filter-select">
                    Month
                    <select value={serviceMonth} onChange={(event) => setServiceMonth(event.target.value)}>
                      <option value="">All</option>
                      {months.map((month, index) => <option key={month} value={String(index + 1)}>{month}</option>)}
                    </select>
                  </label>

                  <label className="filter-select">
                    Year
                    <select value={serviceYear} onChange={(event) => setServiceYear(event.target.value)}>
                      <option value="">All</option>
                      {serviceYears.map((year) => <option key={year} value={year}>{year}</option>)}
                    </select>
                  </label>
                </div>
              </div>

              <ServiceExport archive={archiveFilter} month={serviceMonth} year={serviceYear} sort={serviceSort} disabled={loading}/>

              {events.length === 0 ? (
                <div className="empty-state">
                  <CalendarDays size={30} />
                  <h3>No Services Yet</h3>
                  <p>Create your next service to prepare for scanning.</p>
                </div>
              ) : filteredServices.length === 0 ? (
                <div className="empty-state">
                  <CalendarDays size={30} />
                  <h3>No Services Found</h3>
                  <p>Try another month or year.</p>
                </div>
              ) : (
                <div className="event-list services-recovered-list">
                  <div className="service-list-heading">
                    <span>Date</span>
                    <button
                      className={`service-sort-button${serviceSort === 'oldest' ? ' sort-oldest' : ''}`}
                      onClick={() =>
                        setServiceSort((current) =>
                          current === 'recent' ? 'oldest' : 'recent',
                        )
                      }
                      title="Change Service Sorting"
                    >
                      <strong>Service</strong>
                      <span>{serviceSort === 'recent' ? 'Recent First' : 'Oldest First'}</span>
                      <ChevronDown size={16} />
                    </button>
                    <span className="sunday-service-heading">Sunday</span>
                    <span>Actions</span>
                    <span className="service-check-in-heading">Scanner</span>
                  </div>

                  {filteredServices.map((item) => {
                    const serviceState = getServiceState(item, currentTime)
                    const canScan =
                      serviceState.className === 'upcoming' ||
                      serviceState.className === 'in-progress'

                    const isActionTarget = serviceActionTarget?.item.id === item.id

                    return (
                    <div className="service-list-item" key={item.id}>
                    <article className="event-row">
                      <div className="event-date">
                        <strong>
                          {new Intl.DateTimeFormat('en', {
                            month: 'short',
                            day: 'numeric',
                          }).format(new Date(item.starts_at))}
                        </strong>

                        <span>
                          {new Intl.DateTimeFormat('en', {
                            weekday: 'short',
                          }).format(new Date(item.starts_at))}
                        </span>
                      </div>

                      <div className="member-name">
                        {!item.archived_at && (
                          <span className={`service-state service-state-${serviceState.className}`}>
                            {serviceState.label}
                          </span>
                        )}
                        <strong className="service-title">
                          {item.archived_at && <span className="archived-pill">Archived</span>}
                          {item.name}
                        </strong>
                        {canScan && scannerEventId === item.id && (
                          <span className="current-scanner-indicator">Selected for Scanner</span>
                        )}
                        <span>
                          {eventDateTime(item.starts_at)}
                          {item.location ? ` · ${item.location}` : ''}
                        </span>
                        <small className="service-attendance-summary">
                          {item.is_sunday_service
                            ? `${attendanceCounts[item.id] ?? 0} / ${activeMemberCount} · ${activeMemberCount ? Math.round(((attendanceCounts[item.id] ?? 0) / activeMemberCount) * 100) : 0}%`
                            : `${attendanceCounts[item.id] ?? 0} Check-In${(attendanceCounts[item.id] ?? 0) === 1 ? '' : 's'}`}
                        </small>
                        {item.admin_note && (
                          <small className="service-note-preview">
                            <span>Note</span>
                            {item.admin_note}
                          </small>
                        )}
                      </div>

                      <label className="service-sunday-checkbox">
                        <input
                          type="checkbox"
                          checked={item.is_sunday_service}
                          onChange={() => void toggleSundayService(item)}
                          disabled={loading}
                          aria-label={`Mark ${item.name} as a Sunday Service`}
                        />
                        <span className="service-sunday-checkbox-track" aria-hidden="true">
                          <span />
                        </span>
                      </label>

                      <div className="service-row-actions">
                        <button
                          className="service-action-button"
                          onClick={() => openEditService(item)}
                          title="Edit Service"
                          aria-label={`Edit ${item.name}`}
                        >
                          <Pencil size={20} />
                        </button>
                        {item.archived_at ? (
                          <button className="service-action-button" onClick={() => setServiceActionTarget({ kind: 'restore', item })} title="Restore Service" aria-label={`Restore ${item.name}`}>
                            <ArchiveRestore size={19} />
                          </button>
                        ) : (
                          <>
                            {(attendanceCounts[item.id] ?? 0) === 0 && (
                              <button
                                className="service-action-button danger"
                                onClick={() => void requestDeleteService(item)}
                                title="Delete Event"
                                aria-label={`Delete ${item.name}`}
                              >
                                <Trash2 size={19} />
                              </button>
                            )}
                            {(attendanceCounts[item.id] ?? 0) > 0 && (
                              <button className="service-action-button" onClick={() => setServiceActionTarget({ kind: 'archive', item })} title="Archive Event" aria-label={`Archive ${item.name}`}>
                                <Archive size={19} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      <div className="service-checkin-cell">
                        {canScan ? (
                          <button
                            className="service-checkin-button"
                            onClick={() => openScannerForService(item)}
                            title="Open Scanner for This Service"
                            aria-label={`Open Scanner for ${item.name}`}
                          >
                            <Camera size={16} />
                            <span>Open Scanner</span>
                          </button>
                        ) : (
                          <span className="service-checkin-unavailable">
                            {item.archived_at ? 'Archived' : 'Closed'}
                          </span>
                        )}
                      </div>

                    </article>
                    {isActionTarget && (
                      <div className={`service-inline-confirmation ${serviceActionTarget.kind}`}>
                        <div>
                          <strong>
                            {serviceActionTarget.kind === 'delete'
                              ? `Delete ${item.name}?`
                              : serviceActionTarget.kind === 'archive'
                                ? `Archive ${item.name}?`
                                : `Restore ${item.name}?`}
                          </strong>
                          <span>
                            {serviceActionTarget.kind === 'delete'
                              ? 'This event has no check-ins and will be permanently removed.'
                              : serviceActionTarget.kind === 'archive'
                                ? 'Attendance history will be kept. You can restore the service later.'
                                : 'This service will return to the active list and can be used again.'}
                          </span>
                        </div>
                        <div className="service-inline-confirmation-actions">
                          <button type="button" className="secondary-button" disabled={loading} onClick={() => setServiceActionTarget(null)}>Cancel</button>
                          <button type="button" className={serviceActionTarget.kind === 'delete' ? 'danger-button' : 'primary-button'} onClick={() => void confirmServiceAction()} disabled={loading}>
                            {serviceActionTarget.kind === 'delete'
                              ? 'Delete Service'
                              : serviceActionTarget.kind === 'archive'
                                ? 'Archive Service'
                                : 'Restore Service'}
                          </button>
                        </div>
                      </div>
                    )}
                    </div>
                    )
                  })}
                </div>
              )}
            </section>

          </>
        )}

        {page === 'records' && (
          <>
            <div className="page-heading records-page-heading">
              <div>
                <p className="eyebrow">Reports</p>
                <h1>Attendance Records</h1>
                <p className="muted">
                  Review check-ins and export an Excel-friendly CSV report.
                </p>
              </div>

              <button
                type="button"
                className="records-hero-action"
                onClick={() =>
                  document.querySelector('.records-card')?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  })
                }
              >
                <span className="records-hero-action-kicker">Reporting Center</span>
                <strong>View Records</strong>
                <span className="records-hero-action-note">Filter, Review &amp; Export</span>
                <span className="records-hero-action-icon" aria-hidden="true">
                  <ClipboardList size={22} />
                </span>
              </button>
            </div>

            <AttendanceRecords events={events} />
          </>
        )}

        {page === 'scanner' && (
          <>
            <section className="scanner-editorial-hero">
              <div className="scanner-hero-copy">
                <p className="eyebrow">Attendance Station</p>
                <h1>Check in Members</h1>
                <p>
                  Scan a member QR code, or use manual search when needed.
                </p>
                <span className="scanner-hero-caption">Camera First · Manual Search When Needed</span>
              </div>

              <button
                type="button"
                className="scanner-status-card"
                onClick={() => scannerServicePickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                aria-label="Choose the Service for Check-In"
              >
                <span className="scanner-status-kicker">
                  {selectedScannerEvent ? 'Scanner Ready' : 'Choose a Service'}
                </span>
                <strong>
                  {selectedScannerEvent
                    ? `${attendanceCounts[selectedScannerEvent.id] ?? 0} Check-In${(attendanceCounts[selectedScannerEvent.id] ?? 0) === 1 ? '' : 's'} So Far`
                    : <span className="lc-v3-waiting-title">Waiting to Start</span>}
                </strong>
                <span className="scanner-status-note">
                  {selectedScannerEvent ? selectedScannerEvent.name : 'Select a service below to begin.'}
                </span>
                <span className="scanner-status-icon" aria-hidden="true"><Camera size={22} /></span>
              </button>

              <span className="scanner-hero-orbit" aria-hidden="true" />
              <span className="scanner-hero-spark scanner-hero-spark-one" aria-hidden="true">✦</span>
              <span className="scanner-hero-spark scanner-hero-spark-two" aria-hidden="true">✦</span>
            </section>

            <section className="scanner-event-picker" ref={scannerServicePickerRef}>
              <div className="scanner-picker-copy">
                <p className="card-kicker">Check-In Service</p>
                <h2 title={selectedScannerEvent?.name}>
                  {selectedScannerEvent?.name ?? 'Choose a Service'}
                </h2>
                <p>
                  {selectedScannerEvent
                    ? `${eventDateTime(selectedScannerEvent.starts_at)}${selectedScannerEvent.location ? ` · ${selectedScannerEvent.location}` : ''}`
                    : 'Select the service that should receive these check-ins.'}
                </p>
              </div>
              <div className="scanner-picker-control">
                <label>
                  <select
                    value={scannerEventId}
                    onChange={(event) => setScannerEventId(event.target.value)}
                    aria-label="Choose Check-In Service"
                    title={selectedScannerEvent ? `${selectedScannerEvent.name} — ${eventDateTime(selectedScannerEvent.starts_at)}` : 'Choose a Service'}
                  >
                    <option value="">Choose an Event</option>

                    {events.filter((event) => {
                      const serviceState = getServiceState(event, currentTime)
                      return serviceState.className === 'upcoming' || serviceState.className === 'in-progress'
                    }).map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name} — {eventDateTime(event.starts_at)}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedScannerEvent && (
                  <p className="scanner-checkin-count">
                    <i />
                    {attendanceCounts[selectedScannerEvent.id] ?? 0} Check-In{(attendanceCounts[selectedScannerEvent.id] ?? 0) === 1 ? '' : 's'} So Far
                  </p>
                )}
              </div>
            </section>

            <AttendanceScanner event={selectedScannerEvent} />
          </>
        )}
      </section>
    </main>
  )
}
