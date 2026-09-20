// Change ID: LC-P08C-v1
// Change ID: LC-UI-LABELS-v3
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CalendarDays, Camera, CheckCircle2, Clock3, RefreshCw, Users } from 'lucide-react'
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

export default function Dashboard({ activeScannerEventId, onOpenScanner, onViewRecords }: DashboardProps) {
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


      <footer className="lc-dashboard-footer">
        <p className="lc-dashboard-credit">© {new Date().getFullYear()} LifeCity Attendance · LifeCity Church of Christ</p>
        <p className="lc-dashboard-verse">“So whether you eat or drink or whatever you do, do it all for the glory of God.” — 1 Corinthians 10:31</p>
        <button type="button" className="lc-dashboard-tech" disabled title="Available when the app is complete">Tech Stack</button>
      </footer>
    </>
  )
}
