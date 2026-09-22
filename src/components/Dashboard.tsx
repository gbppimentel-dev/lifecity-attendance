import WhatsNew from './WhatsNew'
import '../mobile-dashboard.css'
// Change ID: LC-P08C-v1
// Change ID: LC-UI-LABELS-v3
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronDown, Check, Sparkles, CalendarDays, Camera, CheckCircle2, Clock3, RefreshCw, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'

type AttendanceEvent = {
  id: string
  name: string
  starts_at: string
  location: string | null
  admin_note: string | null
  is_sunday_service: boolean
  archived_at: string | null
}

type DashboardProps = {
  audience: 'admin' | 'owner'
  activeScannerEventId: string
  onOpenScanner: () => void
  onViewRecords: () => void
}

type DashboardPeriod = 'all' | 'month' | 'year'

type CheckIn = {
  id: string
  event_id: string
  checked_in_at: string
  members: {
    first_name: string
    last_name: string
    member_number: string
  } | null
  events: {
    name: string
  } | null
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatCheckInTime(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function eventPostcardDate(value: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      weekday: 'short',
    })
      .formatToParts(new Date(value))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return { month: parts.month, day: parts.day, weekday: parts.weekday }
}

type DashboardSnapshot = {
  period: DashboardPeriod
  as_of: string
  total_members: number
  active_members: number
  total_events: number
  total_check_ins: number
  latest_event: AttendanceEvent | null
  latest_event_check_ins: number
  latest_sunday_service: AttendanceEvent | null
  latest_sunday_check_ins: number
  upcoming_event: AttendanceEvent | null
  active_scanner_event: AttendanceEvent | null
  active_scanner_state: 'upcoming' | 'in-progress' | 'completed' | 'archived' | null
  active_scanner_check_ins: number
  recent_check_ins: CheckIn[]
}

function MobilePeriodPicker({value,onChange}:{value:DashboardPeriod;onChange:(value:DashboardPeriod)=>void}) {
  const ref=useRef<HTMLDetailsElement>(null)
  const options=[{value:'all',label:'All Time'},{value:'month',label:'This Month'},{value:'year',label:'This Year'}] as const
  useEffect(()=>{
    const close=(event:PointerEvent)=>{if(event.target instanceof Node&&!ref.current?.contains(event.target)&&ref.current)ref.current.open=false}
    document.addEventListener('pointerdown',close)
    return()=>document.removeEventListener('pointerdown',close)
  },[])
  return <details className="lcd-period-picker" ref={ref} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))e.currentTarget.open=false}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus()}}}>
    <summary aria-label={`Dashboard period: ${options.find(option=>option.value===value)?.label}`}>{options.find(option=>option.value===value)?.label}<ChevronDown size={14}/></summary>
    <div className="lcd-period-options" role="group" aria-label="Dashboard Period">{options.map(option=><button type="button" key={option.value} aria-pressed={value===option.value} onClick={()=>{if(ref.current){ref.current.open=false;ref.current.querySelector('summary')?.focus()}onChange(option.value)}}>{option.label}{value===option.value&&<Check size={14}/>}</button>)}</div>
  </details>
}

export default function Dashboard({ audience, activeScannerEventId, onOpenScanner, onViewRecords }: DashboardProps) {
  const [mobileView,setMobileView]=useState<'next'|'latest'|'activity'>('next')
  const [showAllActivity,setShowAllActivity]=useState(false)
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>('all')
  const [finishedKey, setFinishedKey] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const alive = useRef(true)
  const sequence = useRef(0)
  const key = JSON.stringify([dashboardPeriod,activeScannerEventId])
  const currentRequest = useRef({key,period:dashboardPeriod,scanner:activeScannerEventId})
  currentRequest.current = {key,period:dashboardPeriod,scanner:activeScannerEventId}

  useEffect(() => {
    alive.current=true
    return () => {alive.current=false;sequence.current++}
  },[])
  useEffect(() => {void loadDashboard()},[key])
  useEffect(() => {
    let timer: number | undefined
    const scheduleRefresh = () => {
      window.clearTimeout(timer)
      timer=window.setTimeout(() => void loadDashboard(),250)
    }
    const channel=supabase.channel('dashboard-attendance-refresh')
      .on('postgres_changes',{event:'*',schema:'public',table:'attendance'},scheduleRefresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'members'},scheduleRefresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'events'},scheduleRefresh)
      .subscribe()
    // Re-evaluate Manila month/year boundaries and the three-hour scanner window.
    const clock=window.setInterval(() => void loadDashboard(),60_000)
    return () => {window.clearTimeout(timer);window.clearInterval(clock);void supabase.removeChannel(channel)}
  },[])

  async function loadDashboard() {
    if(!alive.current)return
    const request=currentRequest.current
    const id=++sequence.current
    const isCurrent=() => alive.current && sequence.current===id && currentRequest.current.key===request.key
    setRefreshing(true)
    try {
      const {data,error:failure}=await supabase.rpc('lc_dashboard_snapshot',{p_period:request.period,p_scanner_event_id:request.scanner || null})
      if(!isCurrent())return
      if(failure)throw failure
      if(!data || data.period!==request.period || !Array.isArray(data.recent_check_ins) || typeof data.total_members!=='number' || typeof data.total_check_ins!=='number')throw new Error('Invalid dashboard response')
      setSnapshot(data as DashboardSnapshot)
      setError('')
    } catch {
      if(isCurrent()){setSnapshot(null);setError('Could not load the dashboard. Please try again.')}
    } finally {
      if(isCurrent()){setFinishedKey(request.key);setRefreshing(false)}
    }
  }

  const loading=finishedKey!==key || (!snapshot && !error)
  if (loading) {
    return (
      <section className="dashboard-loading-skeleton" aria-label="Loading Dashboard" aria-busy="true">
        <div className="dashboard-skeleton-hero">
          <span className="dashboard-skeleton-kicker" />
          <span className="dashboard-skeleton-title" />
          <span className="dashboard-skeleton-copy" />
          <span className="dashboard-skeleton-copy short" />
        </div>
        <div className="dashboard-skeleton-metrics">
          <span />
          <span />
          <span />
          <span />
        </div>
      </section>
    )
  }

  if (error || !snapshot) {
    return <section className="dashboard-card empty-state" role="alert">
      <h2>Dashboard Unavailable</h2><p>{error || 'Please try loading the dashboard again.'}</p>
      <button type="button" className="secondary-button" disabled={refreshing} onClick={() => void loadDashboard()}><RefreshCw size={16}/>{refreshing ? 'Loading…' : 'Try Again'}</button>
    </section>
  }

  const activeMemberCount=snapshot.active_members
  const totalMemberCount=snapshot.total_members
  const periodEventCount=snapshot.total_events
  const periodCheckInCount=snapshot.total_check_ins
  const latestEvent=snapshot.latest_event
  const latestEventCount=snapshot.latest_event_check_ins
  const latestSundayService=snapshot.latest_sunday_service
  const latestSundayCount=snapshot.latest_sunday_check_ins
  const upcomingEvent=snapshot.upcoming_event
  const recentCheckIns=snapshot.recent_check_ins
  const activeScannerEvent=snapshot.active_scanner_event
  const activeScannerCount=snapshot.active_scanner_check_ins
  const showActiveCheckIn=snapshot.active_scanner_state==='upcoming'||snapshot.active_scanner_state==='in-progress'
  const attendanceRate=activeMemberCount ? Math.round(latestSundayCount/activeMemberCount*100) : 0
  const latestEventRate=activeMemberCount ? Math.round(latestEventCount/activeMemberCount*100) : 0

  return (
    <>
      <style>{`
        @media (min-width: 901px) {
          body .lc-mobile-workspace > .content:has(.lc-dashboard-footer) {
            padding-bottom: 8px;
          }
          body .lc-mobile-workspace:has(.lc-dashboard-footer) {
            padding-bottom: 0;
          }
        }

        body .dashboard-editorial-hero .dashboard-hero-caption {
          text-transform: none !important;
        }
        body .dashboard-editorial-hero .dashboard-refresh,
        body .recent-checkins-card .recent-checkin-total {
          transform: none !important;
          rotate: none !important;
        }
        body .lc-dashboard-footer {
          width: 100%; margin: 36px auto 0; padding: 20px 16px 12px;
          display: grid; justify-items: center; gap: 5px;
          text-align: center; color: #858392;
        }
        body .lc-dashboard-footer .lc-dashboard-credit {
          margin: 0; font-size: 12px; font-weight: 400; line-height: 1.5;
        }
        body .lc-dashboard-footer .lc-dashboard-verse {
          max-width: 850px; margin: 0; font-size: 11px;
          font-weight: 400; font-style: italic; line-height: 1.6;
          color: #9693a3; text-wrap: balance;
        }
        body .lc-dashboard-footer .lc-dashboard-tech {
          min-height: 28px; margin: 2px 0 0; padding: 4px 12px;
          border: 0; background: transparent; color: #858392;
          font: inherit; font-size: 10px; line-height: 1.5;
          opacity: 1; cursor: default; transform: none; box-shadow: none;
        }
      `}</style>
      <section className="lcd-mobile" aria-label="Mobile Dashboard">
        <header className="lcd-head"><span className="lcd-header-art" aria-hidden="true"><span/><Sparkles size={21}/></span><div><p>LifeCity Attendance</p><h1>Dashboard</h1></div><button className="lcd-icon-button" onClick={()=>void loadDashboard()} disabled={refreshing} aria-label={refreshing?'Refreshing Dashboard':'Refresh Dashboard'}><RefreshCw size={18} className={refreshing?'lc-auth-spin':''}/></button></header>
        <div className="lcd-toolbar"><div className="lcd-period-control"><span>Period</span><MobilePeriodPicker value={dashboardPeriod} onChange={setDashboardPeriod}/></div><span>{periodCheckInCount} Check-Ins</span></div>
        <div className="lcd-actions"><button onClick={onOpenScanner}><Camera size={17}/>Scanner</button><button onClick={onViewRecords}><ArrowRight size={17}/>Records</button></div>
        {showActiveCheckIn&&activeScannerEvent&&<section className="lcd-live" aria-label="Current Check-In"><div><span className="lcd-kicker">Checking In Now</span><h2>{activeScannerEvent.name}</h2><p>{formatEventDate(activeScannerEvent.starts_at)}{activeScannerEvent.location?` · ${activeScannerEvent.location}`:''}</p></div><strong>{activeScannerCount}<small>Check-Ins</small></strong></section>}
        <section className="lcd-metrics" aria-label="Attendance Overview">
          <article><span><Users size={15}/>Members</span><strong>{totalMemberCount}</strong><small>{activeMemberCount} Active</small></article>
          <article><span><CalendarDays size={15}/>Events</span><strong>{periodEventCount}</strong><small>{dashboardPeriod==='all'?'All Time':dashboardPeriod==='month'?'This Month':'This Year'}</small></article>
          <article><span><CheckCircle2 size={15}/>Latest Event</span><strong>{latestEventCount}</strong><small>Check-Ins</small></article>
          <article><span><Clock3 size={15}/>Latest Sunday</span><strong>{latestSundayService?`${attendanceRate}%`:'—'}</strong><small>{latestSundayService?`${latestSundayCount} / ${activeMemberCount} Active`:'No Sunday Yet'}</small></article>
        </section>
        <section className="lcd-focus"><div className="lcd-switch" role="group" aria-label="Dashboard Details">{(['next','latest','activity'] as const).map(view=><button key={view} aria-pressed={mobileView===view} aria-controls="lcd-detail" onClick={()=>setMobileView(view)}>{view==='next'?'Up Next':view==='latest'?'Latest Event':'Activity'}</button>)}</div>
          <div id="lcd-detail" className="lcd-detail">
          {mobileView==='activity'?<><div className="lcd-activity-heading"><h2>Recent Check-Ins</h2><button onClick={onViewRecords}>All Records <ArrowRight size={13}/></button></div>{recentCheckIns.length===0?<p>No check-ins yet.</p>:<><div className="lcd-activity">{recentCheckIns.slice(0,showAllActivity?undefined:3).map(checkIn=><button key={checkIn.id} onClick={onViewRecords}><span><strong>{checkIn.members?`${checkIn.members.first_name} ${checkIn.members.last_name}`:'Unknown Member'}</strong><small>{checkIn.events?.name??'Unknown Event'}</small></span><time dateTime={checkIn.checked_in_at}>{formatCheckInTime(checkIn.checked_in_at)}</time></button>)}</div>{recentCheckIns.length>3&&<button className="lcd-more" aria-expanded={showAllActivity} onClick={()=>setShowAllActivity(v=>!v)}>{showAllActivity?'Show Less':`Show All ${recentCheckIns.length}`}</button>}</>}</>:(()=>{const event=mobileView==='next'?upcomingEvent:latestEvent;return event?<><span className="lcd-kicker">{mobileView==='next'?'Next Gathering':event.is_sunday_service?'Most Recent Sunday Service':'Most Recent Event'}</span><h2>{event.name}</h2><p className="lcd-event-date"><CalendarDays size={14}/>{formatEventDate(event.starts_at)}</p>{event.location&&<p>{event.location}</p>}{mobileView==='latest'&&<p className="lcd-event-total"><strong>{latestEventCount}</strong> Check-Ins{event.is_sunday_service?` · ${latestEventCount} of ${activeMemberCount} Active Members`:''}</p>}{mobileView==='latest'&&event.is_sunday_service&&<div className="lcd-progress" role="progressbar" aria-label="Latest Event Attendance" aria-valuenow={Math.min(latestEventRate,100)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${latestEventRate}% attendance`}><span style={{width:`${Math.min(latestEventRate,100)}%`}}/></div>}{event.admin_note&&<details className="lcd-note" key={event.id}><summary>Service Note</summary><p>{event.admin_note}</p></details>}</>:<p>{mobileView==='next'?'Nothing scheduled yet. Create a gathering in Services.':'No event recorded yet.'}</p>})()}
          </div>
        </section>
        <details className="lcd-news"><summary>What’s New <span>Updates &amp; History</span></summary><WhatsNew audience={audience}/></details>
      </section>
      <div className="lcd-desktop">
      <section className="dashboard-editorial-hero">
        <div className="dashboard-hero-copy">
          <p className="eyebrow">Overview</p>
          <h1>Dashboard</h1>
          <p>A quick view of your LifeCity attendance activity.</p>
          <span className="dashboard-hero-caption">
            {activeMemberCount} Active Members · {periodCheckInCount} check-ins in this view
          </span>
        </div>

        <div className="dashboard-hero-utilities">
          <label className="dashboard-period-select">
            <span>Showing</span>
            <select
              value={dashboardPeriod}
              onChange={(event) => setDashboardPeriod(event.target.value as DashboardPeriod)}
              aria-label="Dashboard Date Range"
            >
              <option value="all">All Time</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
            </select>
          </label>

          <button className="dashboard-refresh" disabled={refreshing} onClick={() => void loadDashboard()}>
            <RefreshCw size={16} />
            {refreshing ? 'Refreshing…' : 'Refresh Snapshot'}
          </button>
        </div>

        <span className="dashboard-hero-orbit" aria-hidden="true" />
        <span className="dashboard-hero-spark dashboard-hero-spark-one" aria-hidden="true">✦</span>
        <span className="dashboard-hero-spark dashboard-hero-spark-two" aria-hidden="true">✦</span>
      </section>

      {showActiveCheckIn && activeScannerEvent && (
        <section className="active-checkin-panel" aria-label="Current Check-In">
          <div className="active-checkin-copy">
            <p className="card-kicker">Currently Checking in</p>
            <h2>{activeScannerEvent.name}</h2>
            <p>
              {formatEventDate(activeScannerEvent.starts_at)}
              {activeScannerEvent.location ? ` · ${activeScannerEvent.location}` : ''}
            </p>
          </div>

          <div className="active-checkin-total">
            <strong>{activeScannerCount}</strong>
            <span>Check-In{activeScannerCount === 1 ? '' : 's'} So Far</span>
          </div>

          <button className="primary-button active-checkin-button" onClick={onOpenScanner}>
            <Camera size={17} />
            Open Scanner
          </button>
        </section>
      )}

      <section className="dashboard-stats" aria-label="Attendance Overview">
        <article className="dashboard-stat-card dashboard-metric-card metric-members">
          <div className="dashboard-metric-copy">
            <p className="lc-v3-metric-title">Total Members</p>
            <small>{activeMemberCount} Active Member{activeMemberCount === 1 ? '' : 's'}</small>
          </div>
          <strong>{totalMemberCount}</strong>
          <span className="dashboard-stat-icon members"><Users size={20} /></span>
        </article>

        <article className="dashboard-stat-card dashboard-metric-card metric-events">
          <div className="dashboard-metric-copy">
            <p className="lc-v3-metric-title">Events Created</p>
            <small>{upcomingEvent ? `Next: ${upcomingEvent.name}` : 'No Upcoming Event'}</small>
          </div>
          <strong>{periodEventCount}</strong>
          <span className="dashboard-stat-icon events"><CalendarDays size={20} /></span>
        </article>

        <article className="dashboard-stat-card dashboard-metric-card metric-attendance">
          <div className="dashboard-metric-copy">
            <p className="lc-v3-metric-title">Latest Event Attendance</p>
            <small>{latestEvent ? latestEvent.name : 'No Event Recorded Yet'}</small>
          </div>
          <strong>{latestEventCount}</strong>
          <span className="dashboard-stat-icon attendance"><CheckCircle2 size={20} /></span>
        </article>

        <article className="dashboard-stat-card dashboard-metric-card metric-rate">
          <div className="dashboard-metric-copy">
            <p className="lc-v3-metric-title">Latest Sunday Attendance</p>
            <small>{latestSundayService ? `${latestSundayCount} of ${activeMemberCount} Active Members` : 'No Sunday Service Recorded Yet'}</small>
          </div>
          <strong>{latestSundayService ? `${attendanceRate}%` : '—'}</strong>
          <span className="dashboard-stat-icon rate"><Clock3 size={20} /></span>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className={`dashboard-card latest-event-card event-postcard event-postcard-recent${latestEvent ? ' has-date' : ''}`}>
          {latestEvent && (
            <div className="event-postcard-date" aria-label={formatEventDate(latestEvent.starts_at)}>
              <span>{eventPostcardDate(latestEvent.starts_at).month}</span>
              <strong>{eventPostcardDate(latestEvent.starts_at).day}</strong>
              <small>{eventPostcardDate(latestEvent.starts_at).weekday}</small>
            </div>
          )}
          <span className="event-postcard-spark" aria-hidden="true">✦</span>
          <div className="dashboard-card-heading">
            <div>
              <p className="card-kicker">{latestEvent?.is_sunday_service ? 'Most Recent Sunday Service' : 'Most Recent Event'}</p>
              <h2>{latestEvent?.name ?? 'No Events Yet'}</h2>
            </div>
            {latestEvent && <span className="status active">{latestEventCount} Check-In{latestEventCount === 1 ? '' : 's'}</span>}
          </div>

          {latestEvent ? (
            <>
              <p className="latest-event-meta">
                {formatEventDate(latestEvent.starts_at)}
                {latestEvent.location ? ` · ${latestEvent.location}` : ''}
              </p>
              {latestEvent.admin_note && (
                <p className="dashboard-service-note">
                  <span>Service Note</span>
                  {latestEvent.admin_note}
                </p>
              )}
              {latestEvent.is_sunday_service ? (
                <>
                  <div className="attendance-progress" aria-label={`${latestEventRate}% Attendance`}>
                    <span style={{ width: `${Math.min(latestEventRate, 100)}%` }} />
                  </div>
                  <p className="latest-event-summary">
                    <strong>{latestEventCount}</strong> of {activeMemberCount} Active Members Checked in
                  </p>
                </>
              ) : null}
            </>
          ) : (
            <p className="muted">Create an event to start tracking attendance here.</p>
          )}
        </article>

        <article className={`dashboard-card next-event-card event-postcard event-postcard-upcoming${upcomingEvent ? ' has-date' : ''}`}>
          {upcomingEvent && (
            <div className="event-postcard-date" aria-label={formatEventDate(upcomingEvent.starts_at)}>
              <span>{eventPostcardDate(upcomingEvent.starts_at).month}</span>
              <strong>{eventPostcardDate(upcomingEvent.starts_at).day}</strong>
              <small>{eventPostcardDate(upcomingEvent.starts_at).weekday}</small>
            </div>
          )}
          <span className="event-postcard-spark" aria-hidden="true">✦</span>
          <p className="card-kicker">Next Event</p>
          <h2>{upcomingEvent?.name ?? 'Nothing Scheduled'}</h2>
          <p className="muted">
            {upcomingEvent
              ? `${formatEventDate(upcomingEvent.starts_at)}${upcomingEvent.location ? ` · ${upcomingEvent.location}` : ''}`
              : 'Create an event when your next service is confirmed.'}
          </p>
          {upcomingEvent?.admin_note && (
            <p className="dashboard-service-note dashboard-upcoming-note">
              <span>Service Note</span>
              {upcomingEvent.admin_note}
            </p>
          )}
        </article>

        <article className="dashboard-card recent-checkins-card">
          <div className="dashboard-card-heading">
            <div>
              <p className="card-kicker">Live Activity</p>
              <h2>Recent Check-Ins</h2>
            </div>
            <div className="recent-checkin-actions">
              <span className="recent-checkin-total">{periodCheckInCount} Total</span>
              <button type="button" className="dashboard-records-link" onClick={onViewRecords}>
                View All Records
                <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {recentCheckIns.length === 0 ? (
            <p className="dashboard-empty">Recent QR scans will appear here.</p>
          ) : (
            <div className="recent-checkin-list">
              {recentCheckIns.map((checkIn, index) => (
                <button
                  type="button"
                  className={`recent-checkin-row${index === 0 ? ' is-fresh' : ''}`}
                  key={checkIn.id}
                  onClick={onViewRecords}
                  aria-label={`View Attendance Records After ${checkIn.members ? `${checkIn.members.first_name} ${checkIn.members.last_name}` : 'This Check-In'}`}
                >
                  <div className="avatar">
                    {checkIn.members
                      ? `${checkIn.members.first_name?.[0] ?? ''}${checkIn.members.last_name?.[0] ?? ''}`
                      : '?'}
                  </div>
                  <div className="recent-checkin-surface">
                    <div className="recent-checkin-copy">
                      <strong>{checkIn.members ? `${checkIn.members.first_name} ${checkIn.members.last_name}` : 'Unknown Member'}</strong>
                      <span>{checkIn.events?.name ?? 'Unknown Event'}</span>
                      {index === 0 && <em>Latest</em>}
                    </div>
                    <time dateTime={checkIn.checked_in_at} title={formatEventDate(checkIn.checked_in_at)}>{formatCheckInTime(checkIn.checked_in_at)}</time>
                  </div>
                </button>
              ))}
            </div>
          )}
        </article>
      </section>

      <WhatsNew audience={audience}/>
      </div>
    </>
  )
}
