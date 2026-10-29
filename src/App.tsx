import RubberSegment from './components/RubberSegment'
import { ResponsiveSelect } from './components/CompactMobile'
import BorderGlow from './components/BorderGlow'
import FoldText from './components/FoldText'
import MobileServiceSelect from './components/MobileServiceSelect'
import './mobile-services.css'
import ServiceSwipeItem from './components/ServiceSwipeItem'
import ServiceEditor from './components/ServiceEditor'
import ServiceScannerHub from './components/ServiceScannerHub'
import ScannerOverview from './components/ScannerOverview'
import ScannerStart from './components/ScannerStart'
import HoldButton from './components/HoldButton'
import { useToast } from './lib/toasts'
import { AttendedServiceError, changeServiceField, deleteServiceWithUndo, type ServiceChange } from './lib/serviceActions'
import './services-swipe.css'
import AppFooter from './components/AppFooter'
import FeedbackWidget from './components/FeedbackWidget'
// Change ID: LC-P08F-v1
// Change ID: LC-P08B-v1
// Change ID: LC-P07B-v1
import { changeWithMotion, MotionPresence, motionEnabled } from './lib/motion'
import { uiMessage } from './lib/uiText'
import { revealWorkspaceRegion } from './lib/workspaceViewport'
// Full replacement for src/App.tsx; requires the installed Phase 1 foundation and LC-P02A-v1.sql plus LC-P02B-v1.sql.
import type { Session } from '@supabase/supabase-js'
import { type ReactNode, type FormEvent, lazy, useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { preloadable } from './lib/preloadable'
import { WorkspaceCacheProvider } from './lib/workspaceCache'
import {
  Heart,
  QrCode,
  Sparkles,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
  Link2,
  PauseCircle,
  CalendarDays,
  Clock3,
  MapPin,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  ClipboardList,
  LayoutDashboard,
  Settings,
  LogOut,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import ScannerServicePicker from './components/ScannerServicePicker'
import MobileAdminNav from './components/MobileAdminNav'
import { useSharedAppearance } from './lib/appearance'
import { supabase } from './lib/supabase'
import ScreenBoundary from './components/ScreenBoundary'
import WorkspacePanel from './components/WorkspacePanel'

const MemberPortal = preloadable(() => import('./components/MemberPortal'))
const MemberLinkRequests = preloadable(() => import('./components/MemberLinkRequests'))
const ServiceExport = lazy(() => import('./components/ServiceExport'))
const SettingsWorkspace = preloadable(() => import('./components/SettingsWorkspace'))
const AttendanceRecords = preloadable(() => import('./components/AttendanceRecords'))
const GuestPreview = lazy(() => import('./components/GuestPreview'))
const AttendanceScanner = preloadable(() => import('./components/AttendanceScanner'))
const Dashboard = preloadable(() => import('./components/Dashboard'))
const MemberManager = preloadable(() => import('./components/MemberManager'))

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
  return <main className={'lc-auth-page lc-auth-layout-v2' + (compact ? ' lc-auth-compact' : '')} data-change-id="LC-UI-COPY-v2">
    <header className="lc-auth-brand"><AccountBrand/></header>
    <BorderGlow as="section" className="lc-auth-frame" borderRadius={22} animated>
      {!compact && <aside className="lc-auth-story">
        <p className="eyebrow">Gather. Connect. Grow.</p><h1>Grow in Faith.<br/><em>Find Community.</em></h1>
        <p>Your church community, connected.<br/>Check-in and stay involved.</p>
        <div className="lc-playful-art" aria-hidden="true">
          <span className="lc-playful-orbit" />
          <div className="lc-float-card lc-float-community"><div className="lc-playful-card">
            <span className="lc-playful-icon"><Users size={27}/></span>
            <strong>Life Happens Together.</strong><small>LifeCity Community</small>
            <span className="lc-playful-dots"><i/><i/><i/></span>
          </div></div>
          <div className="lc-float-card lc-float-faith"><div className="lc-playful-card">
            <Heart size={19}/><strong>Rooted in Faith</strong><small>Growing together.</small>
          </div></div>
          <div className="lc-float-card lc-float-checkin"><div className="lc-playful-card">
            <QrCode size={23}/><span><strong>Check In. Connect.</strong><small>Every gathering matters.</small></span>
          </div></div>
          <div className="lc-float-card lc-float-sunday"><div className="lc-playful-card">
            <CalendarDays size={19}/><strong>See You at Church</strong>
          </div></div>
          <Sparkles className="lc-playful-spark" size={21}/>
          <span className="lc-playful-dot"/>
        </div>
      </aside>}
      <div className="lc-auth-body">{children}</div>
    </BorderGlow>
    <AppFooter landing/>
  </main>
}

export default function App(){return <><AppContent/><FeedbackWidget/></>}

function AppContent() {
  useSharedAppearance()
  const { clear: clearToasts } = useToast()
  const [session, setSession] = useState<Session | null>(null)
  const [booting, setBooting] = useState(true)
  const toastAccount = useRef<string | null>(null)
  useEffect(() => {
    const next = session?.user.id ?? null
    if (next !== toastAccount.current) { clearToasts(); toastAccount.current = next }
  }, [session?.user.id, clearToasts])
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
  if (!session && showGuest) return <><ScreenBoundary label="Guest Preview"><GuestPreview onBack={()=>setShowGuest(false)} onSignIn={()=>void googleSignIn()} signingIn={working} error={oauthError || authError}/></ScreenBoundary><AppFooter/></>
  if (!session) return (
    <AccountShell>
      <div className="lc-google-welcome" data-change-id="LC-UI-COPY-v2">
        <p className="eyebrow">Your LifeCity Space</p>
        <h2>Welcome to LifeCity!</h2>
        <p className="lc-auth-intro">Connect with your LifeCity family. Sign in to view your member QR code and get ready for our next gathering.</p><p className="lc-mobile-welcome-intro">Your member ID, attendance, and gatherings in one place.</p>
        <button type="button" className="lc-google-button lc-google-only-button" disabled={working} aria-busy={working} onClick={()=>void googleSignIn()}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48"><path fill="#4285F4" d="M43.6 24.5c0-1.5-.1-2.9-.4-4.3H24v8.1h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.7c3.9-3.6 6-8.9 6-15.2Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.2c-1.8 1.2-4.1 1.9-6.8 1.9-5.3 0-9.8-3.6-11.4-8.4H5.7v5.4A20.4 20.4 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.4a12.2 12.2 0 0 1 0-7.8v-5.4H5.7a20.3 20.3 0 0 0 0 18.6l6.9-5.4Z"/><path fill="#EA4335" d="M24 11.2c3 0 5.6 1 7.6 3l5.7-5.7A19.3 19.3 0 0 0 24 3 20.4 20.4 0 0 0 5.7 14.2l6.9 5.4c1.6-4.8 6.1-8.4 11.4-8.4Z"/></svg>
          <span>{working ? 'Connecting to Google…' : 'Continue with Google'}</span>
          {working ? <RefreshCw size={18} className="lc-auth-spin"/> : <ArrowRight size={18} className="lc-google-arrow"/>}
        </button>
        {(oauthError || authError) && <p className="lc-auth-error" role="alert">{oauthError || authError}</p>}
        <button type="button" className="lcg-welcome-link" disabled={working} onClick={()=>setShowGuest(true)}>Explore as a Guest <ArrowRight size={16}/></button>
        <details className="lc-mobile-signin-help"><summary>New here?</summary><p>Google creates your account on first sign-in. Then request to connect your existing member profile.</p></details><div className="lc-google-welcome-note">
          <span className="lc-google-note-icon" aria-hidden="true"><ShieldCheck size={22}/></span>
          <div><strong>Secure sign-in with Google.</strong><p>Use your Google account to get started. New to LifeCity Attendance? Your account is created when you first sign in—no extra password needed.</p></div>
        </div>
        <p className="lc-auth-help">Already registered at church? After signing in, request to connect your existing member profile. Your member ID and attendance stay together.</p>
      </div>
    </AccountShell>
  )
  if (account?.status === 'active' && (account.role === 'owner' || account.role === 'admin')) {
    return <AdminWorkspace key={session.user.id} account={account} onRefreshAccess={() => setRetry(v=>v+1)}/>
  }
  if (account?.status === 'active' && account.member_id) {
    return <><ScreenBoundary key={session.user.id} label="My Member Space"><MemberPortal onRefreshAccess={()=>setRetry(v=>v+1)} onSignOut={()=>void signOut()} signingOut={working} authError={uiMessage(authError)}/></ScreenBoundary><AppFooter/></>
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
      {account?.status === 'active' && !current?.error && <ScreenBoundary key={session.user.id} label="Member Requests"><MemberLinkRequests linked={!!account.member_id} onChanged={()=>setRetry(v=>v+1)}/></ScreenBoundary>}
      {authError && <p className="lc-auth-error" role="alert">{uiMessage(authError)}</p>}
      <div className="lc-auth-state-actions"><button className="lc-auth-primary" onClick={()=>setRetry(v=>v+1)} disabled={working}><RefreshCw size={17}/>Refresh Access</button><button className="lc-auth-signout" onClick={()=>void signOut()} disabled={working}><LogOut size={17}/>{working ? 'Signing Out…' : 'Sign Out'}</button></div>
    </AccountShell>
  )
}

function AdminWorkspace({ account, onRefreshAccess }: { account: LifeCityAccount; onRefreshAccess: () => void }) {
  const { notify, dismiss } = useToast()
  const serviceWriteLock = useRef(false)
  const serviceUndoToasts = useRef(new Map<string, string>())
  const [userEmail, setUserEmail] = useState<string | null>(account.email)
  const [signingOut, setSigningOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [page, setPage] = useState<Page>('dashboard')
  const [requestedPage, setRequestedPage] = useState<Page>('dashboard')
  const [pagePending, startPageTransition] = useTransition()
  const [routeLoading, setRouteLoading] = useState(false)
  const navigationSequence = useRef(0)
  const navigationRole = useRef(account.role)
  navigationRole.current = account.role
  const requestedPageRef = useRef<Page>('dashboard')
  const committedPage = useRef<Page>('dashboard')
  const [events, setEvents] = useState<AttendanceEvent[]>([])
  const [scannerEvents, setScannerEvents] = useState<AttendanceEvent[]>([])
  const [scannerCounts, setScannerCounts] = useState<Record<string,number>>({})
  const [scannerError, setScannerError] = useState('')
  const [scannerLoading, setScannerLoading] = useState(true)
  const scannerRequest = useRef(0)
  const workspaceAlive = useRef(true)
  useEffect(() => {workspaceAlive.current=true;return () => {workspaceAlive.current=false}},[])
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
  const [openServiceActions, setOpenServiceActions] = useState<string | null>(null)
  const [serviceFiltersOpen, setServiceFiltersOpen] = useState(false)
  const [serviceSearch, setServiceSearch] = useState('')
  const [serviceQuery, setServiceQuery] = useState('')
  const [servicePage, setServicePage] = useState(1)
  const [servicePageSize, setServicePageSize] = useState(25)
  const [serviceStats, setServiceStats] = useState({total:0,registered:0,page:1,years:[] as number[]})
  const [servicesLoading, setServicesLoading] = useState(true)
  const [servicesError, setServicesError] = useState('')
  const [loadedServicesKey, setLoadedServicesKey] = useState('')
  const servicesSequence = useRef(0)
  const servicesListRef = useRef<HTMLElement | null>(null)
  const serviceSearchRef = useRef<HTMLInputElement>(null)
  const serviceRows = useRef(new Map<string, HTMLDivElement>())
  const serviceConfirmationRef = useRef<HTMLDivElement>(null)
  const serviceParams = {p_archive:archiveFilter,p_month:serviceMonth?Number(serviceMonth):null,p_year:serviceYear?Number(serviceYear):null,p_sort:serviceSort,p_search:serviceQuery,p_page:servicePage,p_size:servicePageSize}
  const servicesKey = JSON.stringify([serviceParams,serviceSearch.trim()])
  const servicesRequest = useRef({key:servicesKey,params:serviceParams,pending:false,page})
  servicesRequest.current = {key:servicesKey,params:serviceParams,pending:serviceSearch.trim()!==serviceQuery,page}
  const servicesHaveSnapshot = loadedServicesKey === servicesKey && loadedServicesKey !== ''
  const servicesBusy = servicesLoading || (!servicesError && !servicesHaveSnapshot) || serviceSearch.trim() !== serviceQuery
  const servicesReadBlocking = servicesBusy && !servicesHaveSnapshot
  const servicesReadFailed = !!servicesError && !servicesHaveSnapshot
  const servicePageCount = Math.max(1,Math.ceil(serviceStats.total/servicePageSize))

  useEffect(() => { setOpenServiceActions(null) }, [page, servicesKey])

  useEffect(() => {
    const timer = window.setTimeout(() => setServiceQuery(serviceSearch.trim()),300)
    return () => window.clearTimeout(timer)
  },[serviceSearch])
  useEffect(() => {setServicePage(1);setServiceActionTarget(null)},[serviceSearch,archiveFilter,serviceMonth,serviceYear,serviceSort,servicePageSize])
  useEffect(() => {if(page==='events' && serviceSearch.trim()===serviceQuery) void loadServicePage()},[page,servicesKey])

  const [serviceActionTarget, setServiceActionTarget] = useState<
    { kind: 'delete' | 'archive' | 'restore'; item: AttendanceEvent } | null
  >(null)
  const serviceFormRef = useRef<HTMLElement | null>(null)
  const [serviceFormScrollRequest, setServiceFormScrollRequest] = useState(0)

  useLayoutEffect(() => {
    window.dispatchEvent(new CustomEvent('lifecity-workspace-activate', { detail: { page } }))
    if (committedPage.current === page) return
    committedPage.current = page
    // Scroll only after the destination commits, including a lazily loaded page.
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [page])

  useEffect(() => {
    if (page !== 'events' || !showEventForm || !serviceFormScrollRequest) return
    const frame = requestAnimationFrame(() => {
      revealWorkspaceRegion(serviceFormRef.current, 'start')
      serviceFormRef.current?.querySelector<HTMLElement>('h2')?.focus({preventScroll:true})
    })
    return () => cancelAnimationFrame(frame)
  }, [page, showEventForm, serviceFormScrollRequest])

  useEffect(() => {
    if (page !== 'events' || !serviceActionTarget) return
    const frame = requestAnimationFrame(() => revealWorkspaceRegion(serviceConfirmationRef.current))
    return () => cancelAnimationFrame(frame)
  }, [page, serviceActionTarget?.item.id, serviceActionTarget?.kind])

  const scannerServicePickerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user.email ?? null)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null)
    })

    return () => data.subscription.unsubscribe()
  }, [])

  function warmPage(nextPage: string) {
    const target = nextPage === 'dashboard' ? Dashboard : nextPage === 'members' ? MemberManager :
      nextPage === 'records' ? AttendanceRecords : nextPage === 'scanner' ? AttendanceScanner :
      nextPage === 'settings' && account.role === 'owner' ? SettingsWorkspace :
      nextPage === 'profile' ? (account.member_id ? MemberPortal : MemberLinkRequests) : null
    return target ? target.preload().then(() => {}, () => {}) : Promise.resolve()
  }

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? '')) return
    // Warm common workspaces one at a time after the first screen can paint.
    // The camera bundle is loaded only when someone intends to open Scanner.
    const queue = ['members', 'records', ...(account.role === 'owner' ? ['settings'] : [])]
    let stopped = false, idle = 0, timer = 0
    const next = () => {
      if (stopped) return
      const destination = queue.shift()
      if (!destination) return
      void warmPage(destination).finally(() => {
        if (stopped) return
        if (window.requestIdleCallback) idle = window.requestIdleCallback(next, { timeout: 2000 })
        else timer = window.setTimeout(next, 500)
      })
    }
    timer = window.setTimeout(() => {
      if (window.requestIdleCallback) idle = window.requestIdleCallback(next, { timeout: 2000 })
      else next()
    }, 800)
    return () => { stopped = true; window.clearTimeout(timer); if (idle) window.cancelIdleCallback(idle) }
  }, [account.role])

  function changePage(nextPage: Page) {
    if (nextPage === 'settings' && navigationRole.current !== 'owner') return
    if (nextPage === requestedPageRef.current) { window.scrollTo({ top: 0, behavior: motionEnabled() ? 'smooth' : 'instant' }); return }
    if (nextPage === page) window.scrollTo({ top: 0, behavior: motionEnabled() ? 'smooth' : 'instant' })
    requestedPageRef.current = nextPage
    const request = ++navigationSequence.current
    // Update navigation immediately, while keeping the current workspace intact
    // until the destination's module is ready. Only the latest intent commits.
    changeWithMotion(() => { setRequestedPage(nextPage); setRouteLoading(nextPage !== page) })
    const commit = () => {
      if (!workspaceAlive.current || navigationSequence.current !== request ||
        (nextPage === 'settings' && navigationRole.current !== 'owner')) return
      startPageTransition(() => { setPage(nextPage); setRouteLoading(false) })
    }
    if (nextPage === page) commit()
    else void warmPage(nextPage).then(commit)
  }

  useEffect(() => {
    if (account.role === 'owner' || (page !== 'settings' && requestedPageRef.current !== 'settings')) return
    navigationSequence.current++
    requestedPageRef.current = 'dashboard'
    setRequestedPage('dashboard'); setRouteLoading(false)
    startPageTransition(() => setPage('dashboard'))
  }, [account.role, page])

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {void loadScannerServices()},[])
  useEffect(() => {
    if(page==='scanner') void loadScannerServices()
  },[page,currentTime])

  useEffect(() => {
    let timer: number | undefined
    const refresh = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void loadEvents()
        window.dispatchEvent(new Event('lifecity-attendance-changed'))
      },250)
    }
    const channel = supabase.channel('service-checkin-count-refresh')
      .on('postgres_changes',{event:'*',schema:'public',table:'attendance'},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'events'},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'members'},refresh)
      .subscribe()
    return () => {window.clearTimeout(timer);void supabase.removeChannel(channel)}
  },[])

  async function loadServicePage() {
    if(!workspaceAlive.current || servicesRequest.current.pending) return
    const {key,params} = servicesRequest.current
    const sequence = ++servicesSequence.current
    const isCurrent = () => workspaceAlive.current && sequence===servicesSequence.current && key===servicesRequest.current.key
    setServicesLoading(true);setServicesError('')
    try {
      const {data,error} = await supabase.rpc('lc_services_page',params)
      if(!isCurrent())return
      if(error)throw error
      if(!data || !Array.isArray(data.rows) || !Array.isArray(data.years))throw new Error('Invalid service response')
      setEvents(data.rows as AttendanceEvent[])
      setLoadedServicesKey(key)
      setServiceStats({total:data.total,registered:data.registered,page:data.page,years:data.years})
      setActiveMemberCount(data.active_members)
      setAttendanceCounts(Object.fromEntries(data.rows.map((row:AttendanceEvent & {check_ins:number}) => [row.id,row.check_ins])))
    } catch {
      if(isCurrent())setServicesError('Could not load services. Please try again.')
    } finally {
      if(isCurrent())setServicesLoading(false)
    }
  }

  async function loadScannerServices() {
    if(!workspaceAlive.current)return
    const sequence = ++scannerRequest.current
    const isCurrent = () => workspaceAlive.current && sequence===scannerRequest.current
    try {
      const {data,error} = await supabase.rpc('lc_scanner_services')
      if(!isCurrent())return
      if(error)throw error
      if(!data || !Array.isArray(data.rows))throw new Error('Invalid scanner response')
      setScannerEvents(data.rows as AttendanceEvent[])
      setScannerCounts(Object.fromEntries(data.rows.map((row:AttendanceEvent & {check_ins:number}) => [row.id,row.check_ins])))
      setScannerEventId(current => data.rows.some((row:AttendanceEvent) => row.id===current) ? current : '')
      setScannerError('')
    } catch {
      if(isCurrent())setScannerError('Could not load check-in services. Please try again.')
    } finally {if(isCurrent())setScannerLoading(false)}
  }

  async function loadEvents() {
    await Promise.all([
      servicesRequest.current.page==='events' ? loadServicePage() : Promise.resolve(),
      loadScannerServices(),
    ])
  }

  function changeServicePage(next: number) {
    setServiceActionTarget(null)
    setServicePage(Math.max(1,Math.min(next,servicePageCount)))
    window.requestAnimationFrame(() => revealWorkspaceRegion(servicesListRef.current, 'start'))
  }

  async function handleAddEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (serviceWriteLock.current) return
    serviceWriteLock.current = true
    setMessage('')
    setLoading(true)
    try {
      const values = {
        name: eventForm.name.trim(),
        starts_at: new Date(`${eventForm.startsDate}T${eventForm.startsTime}`).toISOString(),
        location: eventForm.location.trim() || null,
        admin_note: eventForm.adminNote.trim() || null,
        is_sunday_service: eventForm.isSundayService,
        is_public: eventForm.isPublic,
      }
      const { data, error } = editingService
        ? await supabase.from('events').update(values).eq('id', editingService.id).select('id').single()
        : await supabase.from('events').insert(values).select('id').single()
      if (error) throw error
      if (!data) throw new Error('The save could not be confirmed. Refresh Services before trying again.')
      if (!workspaceAlive.current) return
      if (editingService) invalidateServiceUndo(editingService.id)
      notify({ title: editingService ? 'Service updated' : 'Service created', description: values.name, tone: 'success' })
      setEventForm(emptyEvent)
      setShowEventForm(false)
      setEditingService(null)
      await loadEvents()
      if (workspaceAlive.current && requestedPageRef.current === 'events') requestAnimationFrame(() => {
        if (!workspaceAlive.current || requestedPageRef.current !== 'events') return
        revealWorkspaceRegion(servicesListRef.current, 'start')
        document.getElementById('service-directory-title')?.focus({preventScroll:true})
      })
    } catch (error) {
      showServiceError(error)
    } finally {
      serviceWriteLock.current = false
      setLoading(false)
    }
  }

  function showServiceError(error: unknown) {
    if (!workspaceAlive.current) return
    const text = (error as { message?: string })?.message || 'Unable to update the service. Please try again.'
    setMessage(text)
    notify({ title: 'Service change failed', description: text, tone: 'error' })
  }

  function invalidateServiceUndo(id: string, field?: string) {
    for (const [key, toastId] of serviceUndoToasts.current) {
      if (key.startsWith(`${id}:`) && (!field || key === `${id}:${field}`)) {
        serviceUndoToasts.current.delete(key)
        dismiss(toastId)
      }
    }
  }

  function notifyServiceChange(change: ServiceChange, title: string, field: 'sunday' | 'archive' | 'delete') {
    if (!workspaceAlive.current) return
    const key = `${change.service.id}:${field}`
    invalidateServiceUndo(change.service.id, field === 'delete' ? undefined : field)
    const toastId = notify({ title, description: change.service.name, tone: 'success', duration: 10_000,
      actionLabel: 'Undo', onAction: async () => {
        if (serviceWriteLock.current) throw new Error('Another service change is in progress. Try Undo again when it finishes.')
        serviceWriteLock.current = true
        setLoading(true)
        try {
          const { data } = await supabase.auth.getSession()
          if (!workspaceAlive.current || data.session?.user.id !== account.user_id) throw new Error('Sign in with the same account to undo this change.')
          if (serviceUndoToasts.current.get(key) !== toastId) throw new Error('A newer change replaced this action. Use its notification to undo.')
          await change.undo()
          if (!workspaceAlive.current) return
          serviceUndoToasts.current.delete(key)
          notify({ title: 'Change undone', description: change.service.name, tone: 'success' })
          await loadEvents()
        } finally {
          serviceWriteLock.current = false
          setLoading(false)
        }
      },
      onDismiss: () => { if (serviceUndoToasts.current.get(key) === toastId) serviceUndoToasts.current.delete(key) },
    })
    serviceUndoToasts.current.set(key, toastId)
  }

  async function toggleSundayService(item: AttendanceEvent) {
    if (serviceWriteLock.current) return
    serviceWriteLock.current = true
    setMessage('')
    setLoading(true)
    try {
      const change = await changeServiceField(supabase, item.id, 'is_sunday_service', item.is_sunday_service, !item.is_sunday_service)
      notifyServiceChange(change, item.is_sunday_service ? 'Sunday marking removed' : 'Marked as a Sunday service', 'sunday')
      await loadEvents()
    } catch (error) {
      showServiceError(error)
    } finally {
      serviceWriteLock.current = false
      setLoading(false)
    }
  }

  async function requestDeleteService(item: AttendanceEvent) {
    setMessage('')
    setServiceActionTarget({ kind: 'delete', item })
  }

  async function confirmServiceAction(rethrow = false) {
    if (!serviceActionTarget || serviceWriteLock.current) return
    const { kind, item } = serviceActionTarget
    serviceWriteLock.current = true
    setLoading(true)
    setMessage('')
    try {
      const change = kind === 'delete'
        ? await deleteServiceWithUndo(supabase, item.id)
        : await changeServiceField(supabase, item.id, 'archived_at', item.archived_at, kind === 'archive' ? new Date().toISOString() : null)
      if (!workspaceAlive.current) return
      notifyServiceChange(change, kind === 'delete' ? 'Service deleted' : kind === 'archive' ? 'Service archived' : 'Service restored', kind === 'delete' ? 'delete' : 'archive')
      setServiceActionTarget(null)
      await loadEvents()
    } catch (error) {
      if (!workspaceAlive.current) return
      if (error instanceof AttendedServiceError) {
        setServiceActionTarget({ kind: 'archive', item })
        setMessage(error.message)
        notify({ title: 'Attendance history protected', description: error.message, tone: 'info' })
      } else showServiceError(error)
      if (rethrow) throw error
    } finally {
      serviceWriteLock.current = false
      setLoading(false)
    }
  }

  function closeServiceForm() {
    setShowEventForm(false)
    setEditingService(null)
    setEventForm(emptyEvent)
    requestAnimationFrame(() => {
      revealWorkspaceRegion(servicesListRef.current, 'start')
      document.getElementById('service-directory-title')?.focus({preventScroll:true})
    })
  }

  function openCreateService() {
    setMessage('')
    setEditingService(null)
    setEventForm(emptyEvent)
    setShowEventForm(true)

    setServiceFormScrollRequest(value => value + 1)
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

    setServiceFormScrollRequest(value => value + 1)
  }

  function openScannerForService(item: AttendanceEvent) {
    setScannerEvents(current => current.some(event => event.id===item.id) ? current : [...current,item])
    setScannerCounts(current => ({...current,[item.id]:attendanceCounts[item.id] ?? current[item.id] ?? 0}))
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

  const selectedScannerEvent = scannerError ? null : scannerEvents.find((event) => {
    const state=getServiceState(event,currentTime).className
    return event.id===scannerEventId && (state==='upcoming'||state==='in-progress')
  }) ?? null
  const serviceYears = serviceStats.years.map(String)
  const scannerHubOptions = scannerError ? [] : scannerEvents.flatMap(item => {
    const state = getServiceState(item, currentTime).className
    return state === 'upcoming' || state === 'in-progress' ? [{...item, state: state as 'upcoming' | 'in-progress'}] : []
  }).sort((a,b) => a.starts_at.localeCompare(b.starts_at))
  const scannerHubSelection = scannerHubOptions.find(item => item.id === scannerEventId)
    ?? scannerHubOptions.find(item => item.state === 'in-progress') ?? scannerHubOptions[0] ?? null
  const filteredServices = events
  function resetServiceFilters() { setArchiveFilter('active'); setServiceMonth(''); setServiceYear(''); setServiceSort('recent'); setServiceSearch('') }
  const activeServiceFilters = [
    ...(serviceSearch.trim() ? [{key:'search',label:`Search: ${serviceSearch.trim()}`,clear:() => setServiceSearch('')}] : []),
    ...(archiveFilter !== 'active' ? [{key:'status',label:archiveFilter === 'archived' ? 'Archived Services' : 'All Services',clear:() => setArchiveFilter('active')}] : []),
    ...(serviceMonth ? [{key:'month',label:months[Number(serviceMonth)-1],clear:() => setServiceMonth('')}] : []),
    ...(serviceYear ? [{key:'year',label:serviceYear,clear:() => setServiceYear('')}] : []),
    ...(serviceSort !== 'recent' ? [{key:'sort',label:'Oldest First',clear:() => setServiceSort('recent')}] : []),
  ]

  return (
    <WorkspaceCacheProvider><main className="app-page lc-mobile-workspace">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon small">
            <Users size={20} />
          </div>
          <span>LifeCity Attendance</span>
        </div>

        <RubberSegment as="nav" variant="navigation" className="main-nav" ariaLabel="Desktop Workspace Navigation"
          value={requestedPage} onIntent={warmPage} onChange={value => changePage(value as Page)} size="lg" equalSlots={false} radius={18} inset={4} draggable
          items={[
            { value: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} /> },
            { value: 'members', label: 'Members', icon: <Users size={17} /> },
            { value: 'events', label: 'Services', icon: <CalendarDays size={17} /> },
            { value: 'scanner', label: 'Scanner', icon: <Camera size={17} /> },
            { value: 'records', label: 'Records', icon: <ClipboardList size={17} /> },
            ...(account.role === 'owner' ? [{ value: 'settings', label: 'Settings', icon: <Settings size={17} /> }] : []),
          ]} />

        <details className="lc-account-menu lc-account-menu-v2" onKeyDown={e=>{if(e.key==='Escape'){e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus()}}}>
          <summary><span className="lc-account-avatar" aria-hidden="true">{(account.display_name || userEmail || 'L').slice(0,1).toUpperCase()}</span><span><small>Logged In as</small><strong>{account.role === 'owner' ? 'Owner' : 'Administrator'}</strong></span><ChevronDown size={15}/></summary>
          <div className="lc-account-popover">
            <div className="lc-menu-identity"><span className="lc-menu-kicker">Your Account</span><strong>{account.display_name && !account.display_name.includes('@') ? account.display_name : 'LifeCity Account'}</strong><span className="lc-menu-email">{maskedEmail(userEmail)}</span></div>
            <dl className="lc-menu-facts"><div><dt>Access Role</dt><dd>{account.role === 'owner' ? 'Owner' : 'Administrator'}</dd></div><div><dt>Member Profile</dt><dd>{account.member_id ? (account.member_name || 'Connected') : 'Not Linked Yet'}</dd></div></dl>
            <div className="lc-menu-actions"><button className="lc-menu-action" onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');changePage('profile')}}><Link2 size={16}/>My Member Space</button>
            <button type="button" onClick={onRefreshAccess} disabled={signingOut}><RefreshCw size={16}/><span>Refresh Access</span></button><button type="button" className="lc-menu-signout" onClick={()=>void handleLogout()} disabled={signingOut}><LogOut size={16}/><span>{signingOut ? 'Signing Out…' : 'Sign Out'}</span><ArrowRight size={15}/></button></div>
            {logoutError && <p role="alert" className="lc-auth-error">{uiMessage(logoutError)}</p>}
          </div>
        </details>
      </header>

      <MobileAdminNav page={requestedPage} isOwner={account.role === 'owner'} onNavigate={changePage}/>
      {(pagePending || routeLoading) && <span className="lc-route-progress" role="status"><span className="lc-route-progress-label">Opening {requestedPage === 'events' ? 'Services' : requestedPage}…</span></span>}

      <section className="content" aria-busy={pagePending || routeLoading}>
        <ScreenBoundary resetKey={page} label={page === 'events' ? 'Services' : page === 'profile' ? 'My Member Space' : page === 'records' ? 'Attendance Records' : page === 'scanner' ? 'Scanner' : page.charAt(0).toUpperCase()+page.slice(1)}>
        <WorkspacePanel active={page === 'dashboard'} label="Dashboard">
          <Dashboard
            audience={account.role === 'owner' ? 'owner' : 'admin'}
            activeScannerEventId={scannerEventId}
            onOpenScanner={() => changePage('scanner')}
            onViewRecords={() => changePage('records')}
          />
        </WorkspacePanel>

        <WorkspacePanel active={page === 'profile'} retain={false} label="My Member Space">{page === 'profile' && (account.member_id ? <MemberPortal audience={account.role === 'owner' ? 'owner' : 'admin'} key={account.user_id} embedded onRefreshAccess={onRefreshAccess}/> : <MemberLinkRequests key={account.user_id} linked={false} onChanged={onRefreshAccess}/>)}</WorkspacePanel>
        {account.role === 'owner' && <WorkspacePanel active={page === 'settings'} label="Settings"><SettingsWorkspace currentUserId={account.user_id} onLinkChanged={onRefreshAccess}/></WorkspacePanel>}
        <WorkspacePanel active={page === 'members'} retain={false} label="Members">{page === 'members' && <MemberManager />}</WorkspacePanel>

        <WorkspacePanel active={page === 'events'} retain={false} label="Services">{page === 'events' && (
          <>
            <BorderGlow as="section" className="services-editorial-hero" borderRadius={18} animated>
              <div className="services-hero-copy">
                <p className="eyebrow">Attendance Setup</p>
                <h1><FoldText text="Services"/></h1>
                <p>
                  Create and manage services before checking in members.
                </p>
              </div>

              <button
                type="button"
                className={`services-create-action${showEventForm ? ' is-open' : ''}`}
                onClick={() => (showEventForm ? closeServiceForm() : openCreateService())}
                aria-expanded={showEventForm}
                aria-controls="service-editor"
                disabled={loading}
              >
                <span className="services-create-action-kicker">
                  {showEventForm ? 'Service Details' : 'Bring People Together'}
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
            </BorderGlow>

            <MotionPresence show={Boolean(showEventForm)}>{showEventForm && (
              <ServiceEditor sectionRef={serviceFormRef} editingName={editingService?.name}
                value={eventForm} onChange={patch => setEventForm(current => ({...current,...patch}))}
                saving={loading} message={message} onSubmit={handleAddEvent} onClose={closeServiceForm}/>

            )}</MotionPresence>

            <section className="directory-card lc-services-directory lcsp-directory" ref={servicesListRef} aria-labelledby="service-directory-title" aria-busy={servicesBusy}>
              <div className="directory-toolbar services-directory-toolbar">
                <div className="services-directory-heading">
                  <div><p className="services-directory-kicker">Gatherings & Attendance</p><h2 id="service-directory-title" tabIndex={-1}>Service Directory</h2>
                    <p className="services-directory-count">{servicesReadFailed ? 'Services Unavailable' : servicesReadBlocking ? 'Loading Services…' : <><strong>{serviceStats.total.toLocaleString()}</strong> Matching<span>·</span>{serviceStats.registered.toLocaleString()} Registered</>}</p>
                  </div>
                  <span className="services-directory-timezone">Scheduled in Manila Time</span>
                </div>
                <div className="lcsp-search-tools">
                  <div className="lcsp-search-field"><label htmlFor="service-directory-search">Search</label><div className="lcsp-search"><Search size={17} aria-hidden="true"/><input ref={serviceSearchRef} id="service-directory-search" type="search" enterKeyHint="search" value={serviceSearch} onFocus={() => { if (matchMedia('(max-width: 900px)').matches) setServiceFiltersOpen(false) }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }} onChange={event => setServiceSearch(event.target.value)} placeholder="Service Name or Location" aria-label="Search Services or Locations"/>{serviceSearch && <button type="button" aria-label="Clear Service Search" onClick={() => { setServiceSearch(''); serviceSearchRef.current?.focus({preventScroll:true}) }}><X size={14} aria-hidden="true"/></button>}</div></div>
                  <button type="button" className="lcsp-filter-toggle" aria-expanded={serviceFiltersOpen} aria-controls="service-directory-filters" onClick={() => setServiceFiltersOpen(value => !value)}>Filters<span>{activeServiceFilters.length ? `${activeServiceFilters.length} Applied` : 'Active Services'}</span><ChevronDown size={16} aria-hidden="true"/></button>
                  <div id="service-directory-filters" className={"service-directory-controls" + (serviceFiltersOpen ? " is-open" : "")}>
                    <div className="lcsm-filters">
                      <MobileServiceSelect label="Status" value={archiveFilter} options={[{value:'all',label:'All Services'},{value:'active',label:'Active Services'},{value:'archived',label:'Archived Services'}]} onChange={value=>setArchiveFilter(value as 'all'|'active'|'archived')}/>
                      <MobileServiceSelect label="Month" value={serviceMonth} options={[{value:'',label:'All Months'},...months.map((label,index)=>({value:String(index+1),label}))]} onChange={setServiceMonth}/>
                      <MobileServiceSelect label="Year" value={serviceYear} options={[{value:'',label:'All Years'},...serviceYears.map(value=>({value,label:value}))]} onChange={setServiceYear}/>
                      <MobileServiceSelect label="Sort" value={serviceSort} options={[{value:'recent',label:'Recent First'},{value:'oldest',label:'Oldest First'}]} onChange={value=>setServiceSort(value as 'recent'|'oldest')}/>
                      {activeServiceFilters.length > 0 && <button type="button" className="lcsm-reset" onClick={resetServiceFilters}>Clear Filters</button>}
                    </div>
                    <label className="filter-select"><span>Status</span><ResponsiveSelect aria-label="Service Status" value={archiveFilter} onChange={event => setArchiveFilter(event.target.value as 'all' | 'active' | 'archived')}><option value="all">All Services</option><option value="active">Active Services</option><option value="archived">Archived Services</option></ResponsiveSelect></label>
                    <label className="filter-select"><span>Month</span><ResponsiveSelect aria-label="Service Month" value={serviceMonth} onChange={event => setServiceMonth(event.target.value)}><option value="">All Months</option>{months.map((month,index) => <option key={month} value={String(index+1)}>{month}</option>)}</ResponsiveSelect></label>
                    <label className="filter-select"><span>Year</span><ResponsiveSelect aria-label="Service Year" value={serviceYear} onChange={event => setServiceYear(event.target.value)}><option value="">All Years</option>{serviceYears.map(year => <option key={year} value={year}>{year}</option>)}</ResponsiveSelect></label>
                    <label className="filter-select"><span>Sort By</span><ResponsiveSelect aria-label="Sort Services" value={serviceSort} onChange={event => setServiceSort(event.target.value as 'recent'|'oldest')}><option value="recent">Recent First</option><option value="oldest">Oldest First</option></ResponsiveSelect></label>
                  </div>
                </div>
              </div>
              <div className="services-directory-scope">{activeServiceFilters.length ? <><div className="services-filter-chips">{activeServiceFilters.map(filter => <button type="button" key={filter.key} aria-label={`Remove Service ${filter.key} Filter`} onClick={filter.clear}><span>{filter.label}</span><X size={12} aria-hidden="true"/></button>)}</div><button type="button" className="services-clear-filters" onClick={resetServiceFilters}>Clear Filters</button></> : <p>Dates, attendance and service details, together.</p>}</div>

              <ServiceScannerHub services={scannerHubOptions} value={scannerHubSelection?.id ?? ''}
                loading={scannerLoading} busy={loading} error={scannerError}
                onChange={setScannerEventId} onOpen={() => { if (scannerHubSelection) openScannerForService(scannerHubSelection) }}
                onRetry={() => { setScannerLoading(true); void loadScannerServices() }}/>

              <ServiceExport archive={archiveFilter} month={serviceMonth} year={serviceYear} sort={serviceSort} search={serviceSearch.trim()} disabled={loading||servicesBusy||!!servicesError}/>

              {servicesError && servicesHaveSnapshot && <div className="services-directory-refresh-error" role="alert"><div><strong>The List Could Not Be Updated</strong><p>Your last loaded view is still here. Try the update again.</p></div><button type="button" onClick={() => void loadServicePage()}>Retry Update</button></div>}
              {servicesReadFailed ? (
                <div className="empty-state" role="alert"><p>{servicesError}</p><button type="button" className="secondary-button" onClick={()=>void loadServicePage()}>Try Again</button></div>
              ) : servicesReadBlocking ? (
                <div className="empty-state" role="status"><p>Loading services…</p></div>
              ) : serviceStats.registered === 0 ? (
                <div className="empty-state">
                  <CalendarDays size={30} />
                  <h3>No Services Yet</h3>
                  <p>Create your next service to prepare for scanning.</p>
                </div>
              ) : filteredServices.length === 0 ? (
                <div className="empty-state">
                  <CalendarDays size={30} />
                  <h3>No Services Found</h3>
                  <p>Try another search, status, month, or year.</p>
                </div>
              ) : (
                <div className="event-list services-recovered-list lcsv-list">
                  <div className="lcsv-heading">
                    <span>Date</span>
                    <span>Service</span>
                    <span className="lcsv-hint"><span aria-hidden="true">↔</span>Swipe or drag left for actions, or use ⋯.</span>
                  </div>

                  {filteredServices.map((item) => {
                    const serviceState = getServiceState(item, currentTime)
                    const isActionTarget = serviceActionTarget?.item.id === item.id

                    return (
                    <div className="service-list-item lcsv-item" key={item.id} ref={node => { if (node) serviceRows.current.set(item.id, node); else serviceRows.current.delete(item.id) }}>
                    <ServiceSwipeItem
                      service={item} state={serviceState} checkIns={attendanceCounts[item.id] ?? 0}
                      activeMembers={activeMemberCount} selectedForScanner={scannerHubSelection?.id === item.id}
                      busy={loading} open={openServiceActions === item.id}
                      onOpenChange={open => {
                        setOpenServiceActions(current => open ? item.id : current === item.id ? null : current)
                        if (open) requestAnimationFrame(() => revealWorkspaceRegion(serviceRows.current.get(item.id) ?? null))
                      }}
                      onSunday={() => void toggleSundayService(item)}
                      onEdit={() => openEditService(item)}
                      onRequestAction={kind => { if (kind === 'delete') void requestDeleteService(item); else setServiceActionTarget({ kind, item }) }}
                    />
                    {isActionTarget && (
                      <div ref={serviceConfirmationRef} className={`service-inline-confirmation ${serviceActionTarget.kind}`} role="region" aria-label={`${serviceActionTarget.kind === 'delete' ? 'Delete' : serviceActionTarget.kind === 'archive' ? 'Archive' : 'Restore'} ${item.name}`}>
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
                              ? 'No check-ins are linked. Hold to delete; the notification offers Undo for 10 seconds.'
                              : serviceActionTarget.kind === 'archive'
                                ? 'Attendance history will be kept. You can restore the service later.'
                                : 'This service will return to the active list and can be used again.'}
                          </span>
                        </div>
                        <div className="service-inline-confirmation-actions">
                          <button type="button" className="secondary-button" disabled={loading} onClick={() => {
                            setServiceActionTarget(null)
                            requestAnimationFrame(() => serviceRows.current.get(item.id)?.querySelector<HTMLButtonElement>('.lc-swipe-row__toggle')?.focus({preventScroll:true}))
                          }}>Cancel</button>
                          {serviceActionTarget.kind === 'delete'
                            ? <HoldButton key={item.id} disabled={loading} holdMs={1300} label="Hold to Delete" holdingLabel="Keep Holding…" doneLabel="Confirmed" icon={<Trash2 size={16} />} onConfirm={() => confirmServiceAction(true)} />
                            : <button type="button" className="primary-button" onClick={() => void confirmServiceAction()} disabled={loading}>
                            {serviceActionTarget.kind === 'archive'
                                ? 'Archive Service'
                                : 'Restore Service'}
                          </button>}
                        </div>
                      </div>
                    )}
                    </div>
                    )
                  })}
                </div>
              )}
              <div className="lcsp-footer" aria-label="Service List Pagination">
                <div className="lcsp-footer-summary">
                  <p aria-live="polite">{servicesReadFailed ? 'Services unavailable' : servicesReadBlocking ? 'Loading services…' : `Showing ${serviceStats.total===0?0:(serviceStats.page-1)*servicePageSize+1}–${Math.min(serviceStats.page*servicePageSize,serviceStats.total)} of ${serviceStats.total} Services`}</p>
                  <div className="lcsm-page-size"><MobileServiceSelect label="Per Page" value={String(servicePageSize)} options={[25,50,100].map(value=>({value:String(value),label:String(value)}))} onChange={value=>setServicePageSize(Number(value))}/></div><div className="lcsp-page-size"><label htmlFor="services-page-size">Per Page</label><span><ResponsiveSelect id="services-page-size" aria-label="Services per Page" value={servicePageSize} onChange={event=>setServicePageSize(Number(event.target.value))}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></ResponsiveSelect><ChevronDown size={14} aria-hidden="true"/></span></div>
                </div>
                {!servicesBusy && !servicesError && servicePageCount>1 && <div className="lcsp-page-buttons">
                  <button type="button" aria-label="First Page" disabled={serviceStats.page===1} onClick={()=>changeServicePage(1)}><ChevronsLeft size={17}/></button>
                  <button type="button" aria-label="Previous Page" disabled={serviceStats.page===1} onClick={()=>changeServicePage(serviceStats.page-1)}><ChevronLeft size={17}/></button>
                  <span>Page {serviceStats.page} of {servicePageCount}</span>
                  <button type="button" aria-label="Next Page" disabled={serviceStats.page===servicePageCount} onClick={()=>changeServicePage(serviceStats.page+1)}><ChevronRight size={17}/></button>
                  <button type="button" aria-label="Last Page" disabled={serviceStats.page===servicePageCount} onClick={()=>changeServicePage(servicePageCount)}><ChevronsRight size={17}/></button>
                </div>}
              </div>
            </section>

          </>
        )}</WorkspacePanel>

        <WorkspacePanel active={page === 'records'} label="Attendance Records">
          <>
            <BorderGlow as="div" className="page-heading records-page-heading" borderRadius={18} animated>
              <div>
                <p className="eyebrow">Reports</p>
                <h1><FoldText text="Attendance Records"/></h1>
                <p className="muted">
                  Review attendance and export CSV reports.
                </p>
              </div>

              <button
                type="button"
                className="records-hero-action"
                onClick={() => {
                  window.requestAnimationFrame(() => {
                    const card=document.querySelector<HTMLElement>('.lcr-workspace')
                    if(!card)return
                    card.querySelector<HTMLElement>('#lcr-ledger-heading')?.focus({preventScroll:true})
                    revealWorkspaceRegion(card,'start')
                  })
                }}
              >
                <span className="records-hero-action-kicker">Attendance Ledger</span>
                <strong>View Records</strong>
                <span className="records-hero-action-note">Filter &amp; Export</span>
                <span className="records-hero-action-icon" aria-hidden="true">
                  <ClipboardList size={22} />
                </span>
              </button>
            </BorderGlow>

            <AttendanceRecords events={events} />
          </>
        </WorkspacePanel>

        <WorkspacePanel active={page === 'scanner'} retain={false} label="Scanner">{page === 'scanner' && (
          <div className="lc-scanner-page">
            <ScannerOverview service={selectedScannerEvent} count={selectedScannerEvent ? scannerCounts[selectedScannerEvent.id] ?? 0 : 0}
              state={selectedScannerEvent ? getServiceState(selectedScannerEvent, currentTime).className : ''}/>

            <section className="lc-scanner-selection-bar" ref={scannerServicePickerRef} aria-label="Check-In Service" data-lc-reveal>
              <span className="lc-scanner-selection-bar__symbol" aria-hidden="true"><CalendarDays size={23}/></span>
              <div className="lc-scanner-selection-bar__copy"><p className="lc-scanner-selection-bar__eyebrow">Check-In Service</p>
                <h2>{selectedScannerEvent?.name ?? 'No Service Selected'}</h2>
                {selectedScannerEvent ? <div className="lc-scanner-selection-bar__meta"><span><Clock3 size={13} aria-hidden="true"/>{eventDateTime(selectedScannerEvent.starts_at)}</span>{selectedScannerEvent.location && <span><MapPin size={13} aria-hidden="true"/>{selectedScannerEvent.location}</span>}</div>
                  : <p className="lc-scanner-selection-bar__hint">Choose an upcoming or in-progress service.</p>}
              </div>
              <ScannerServicePicker
                services={scannerEvents.filter(event => ['upcoming', 'in-progress'].includes(getServiceState(event, currentTime).className))}
                value={selectedScannerEvent?.id ?? ''} disabled={scannerLoading || !!scannerError} now={currentTime}
                onChange={setScannerEventId} formatDate={eventDateTime}/>
            </section>

            {scannerLoading && <p className="lc-scanner-availability" role="status"><RefreshCw size={14} aria-hidden="true"/>Loading Services…</p>}
            {scannerError && <div className="lc-scanner-availability is-error" role="alert"><p>{scannerError}</p><button type="button" onClick={() => { setScannerLoading(true); void loadScannerServices() }}>Try Again</button></div>}
            {!selectedScannerEvent && !scannerError && <ScannerStart
              services={scannerEvents.filter(event => ['upcoming', 'in-progress'].includes(getServiceState(event, currentTime).className))}
              counts={scannerCounts} now={currentTime} loading={scannerLoading} onSelect={setScannerEventId}/>}
            <AttendanceScanner event={selectedScannerEvent}
              checkInCount={selectedScannerEvent ? scannerCounts[selectedScannerEvent.id] ?? 0 : 0}
              onCheckIn={serviceId => {
                window.dispatchEvent(new Event('lifecity-attendance-changed'))
                if (servicesRequest.current.page === 'scanner' && requestedPageRef.current === 'scanner' && scannerEventId === serviceId) void loadScannerServices()
              }}/>
          </div>
        )}</WorkspacePanel>
        </ScreenBoundary>
      </section>
      <AppFooter/>
    </main></WorkspaceCacheProvider>
  )
}
