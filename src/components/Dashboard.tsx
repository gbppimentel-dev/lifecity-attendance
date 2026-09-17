// Replacement ID: dashboard-remove-sunday-trend-v1
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, Camera, CheckCircle2, Clock3, RefreshCw, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Member = {
  id: string
  status: 'active' | 'inactive'
}

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

function manilaDateParts(value: string | Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
    })
      .formatToParts(new Date(value))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return { year: parts.year, month: parts.month }
}

function isWithinDashboardPeriod(
  value: string,
  period: DashboardPeriod,
  currentDate: { year: string; month: string },
) {
  if (period === 'all') return true

  const date = manilaDateParts(value)
  if (period === 'year') return date.year === currentDate.year
  return date.year === currentDate.year && date.month === currentDate.month
}

export default function Dashboard({ activeScannerEventId, onOpenScanner, onViewRecords }: DashboardProps) {
  const [members, setMembers] = useState<Member[]>([])
  const [events, setEvents] = useState<AttendanceEvent[]>([])
  const [checkIns, setCheckIns] = useState<CheckIn[]>([])
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    void loadDashboard()
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-attendance-refresh')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        () => void loadDashboard(false),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  async function loadDashboard(showLoading = true) {
    if (showLoading) setLoading(true)
    setError('')

    const [membersResult, eventsResult, attendanceResult] = await Promise.all([
      supabase.from('members').select('id, status'),
      supabase
        .from('events')
        .select('id, name, starts_at, location, admin_note, is_sunday_service, archived_at')
        .order('starts_at', { ascending: false }),
      supabase
        .from('attendance')
        .select(`
          id,
          event_id,
          checked_in_at,
          members ( first_name, last_name, member_number ),
          events ( name )
        `)
        .order('checked_in_at', { ascending: false }),
    ])

    const firstError = membersResult.error ?? eventsResult.error ?? attendanceResult.error

    if (firstError) {
      setError(firstError.message)
    } else {
      setMembers((membersResult.data ?? []) as Member[])
      setEvents((eventsResult.data ?? []) as AttendanceEvent[])
      setCheckIns((attendanceResult.data ?? []) as unknown as CheckIn[])
    }

    if (showLoading) setLoading(false)
  }

  const activeMembers = useMemo(
    () => members.filter((member) => member.status === 'active'),
    [members],
  )
  const currentDate = manilaDateParts(new Date())
  const periodEvents = events.filter((event) =>
    isWithinDashboardPeriod(event.starts_at, dashboardPeriod, currentDate),
  )
  const periodCheckIns = checkIns.filter((checkIn) =>
    isWithinDashboardPeriod(checkIn.checked_in_at, dashboardPeriod, currentDate),
  )
  const pastEvents = periodEvents.filter(
    (event) => new Date(event.starts_at).getTime() <= Date.now(),
  )
  const latestEvent = pastEvents[0] ?? null
  const latestSundayService =
    pastEvents.find((event) => event.is_sunday_service) ?? null
  const latestEventCheckIns = latestEvent
    ? periodCheckIns.filter((checkIn) => checkIn.event_id === latestEvent.id)
    : []
  const latestSundayCheckIns = latestSundayService
    ? periodCheckIns.filter((checkIn) => checkIn.event_id === latestSundayService.id)
    : []
  const attendanceRate = activeMembers.length
    ? Math.round((latestSundayCheckIns.length / activeMembers.length) * 100)
    : 0
  const upcomingEvent = [...periodEvents]
    .filter((event) => new Date(event.starts_at).getTime() > Date.now())
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    )[0]
  const recentCheckIns = periodCheckIns.slice(0, 6)
  const activeScannerEvent = events.find((event) => event.id === activeScannerEventId) ?? null
  const activeScannerCheckIns = activeScannerEvent
    ? checkIns.filter((checkIn) => checkIn.event_id === activeScannerEvent.id)
    : []
  const activeScannerState = activeScannerEvent
    ? (() => {
        if (activeScannerEvent.archived_at) return 'archived'
        const startsAt = new Date(activeScannerEvent.starts_at).getTime()
        if (Date.now() < startsAt) return 'upcoming'
        if (Date.now() < startsAt + 3 * 60 * 60 * 1000) return 'in-progress'
        return 'completed'
      })()
    : null
  const showActiveCheckIn =
    activeScannerState === 'upcoming' || activeScannerState === 'in-progress'
  if (loading) {
    return <p className="dashboard-loading">Loading dashboard…</p>
  }

  if (error) {
    return <p className="error-message">{error}</p>
  }

  return (
    <>
      <section className="dashboard-editorial-hero">
        <div className="dashboard-hero-copy">
          <p className="eyebrow">Overview</p>
          <h1>Dashboard</h1>
          <p>A quick view of your LifeCity attendance activity.</p>
          <span className="dashboard-hero-caption">
            {activeMembers.length} active members · {periodCheckIns.length} check-ins in this view
          </span>
        </div>

        <div className="dashboard-hero-utilities">
          <label className="dashboard-period-select">
            <span>Showing</span>
            <select
              value={dashboardPeriod}
              onChange={(event) => setDashboardPeriod(event.target.value as DashboardPeriod)}
              aria-label="Dashboard date range"
            >
              <option value="all">All time</option>
              <option value="month">This month</option>
              <option value="year">This year</option>
            </select>
          </label>

          <button className="dashboard-refresh" onClick={() => void loadDashboard()}>
            <RefreshCw size={16} />
            Refresh snapshot
          </button>
        </div>

        <span className="dashboard-hero-orbit" aria-hidden="true" />
        <span className="dashboard-hero-spark dashboard-hero-spark-one" aria-hidden="true">✦</span>
        <span className="dashboard-hero-spark dashboard-hero-spark-two" aria-hidden="true">✦</span>
      </section>

      {showActiveCheckIn && activeScannerEvent && (
        <section className="active-checkin-panel" aria-label="Current check-in">
          <div className="active-checkin-copy">
            <p className="card-kicker">Currently checking in</p>
            <h2>{activeScannerEvent.name}</h2>
            <p>
              {formatEventDate(activeScannerEvent.starts_at)}
              {activeScannerEvent.location ? ` · ${activeScannerEvent.location}` : ''}
            </p>
          </div>

          <div className="active-checkin-total">
            <strong>{activeScannerCheckIns.length}</strong>
            <span>check-in{activeScannerCheckIns.length === 1 ? '' : 's'} so far</span>
          </div>

          <button className="primary-button active-checkin-button" onClick={onOpenScanner}>
            <Camera size={17} />
            Open scanner
          </button>
        </section>
      )}

      <section className="dashboard-stats" aria-label="Attendance overview">
        <article className="dashboard-stat-card dashboard-metric-card metric-members">
          <div className="dashboard-metric-copy">
            <p>Total members</p>
            <small>{activeMembers.length} active member{activeMembers.length === 1 ? '' : 's'}</small>
          </div>
          <strong>{members.length}</strong>
          <span className="dashboard-stat-icon members"><Users size={20} /></span>
        </article>

        <article className="dashboard-stat-card dashboard-metric-card metric-events">
          <div className="dashboard-metric-copy">
            <p>Events created</p>
            <small>{upcomingEvent ? `Next: ${upcomingEvent.name}` : 'No upcoming event'}</small>
          </div>
          <strong>{periodEvents.length}</strong>
          <span className="dashboard-stat-icon events"><CalendarDays size={20} /></span>
        </article>

        <article className="dashboard-stat-card dashboard-metric-card metric-attendance">
          <div className="dashboard-metric-copy">
            <p>Latest event attendance</p>
            <small>{latestEvent ? latestEvent.name : 'No event recorded yet'}</small>
          </div>
          <strong>{latestEventCheckIns.length}</strong>
          <span className="dashboard-stat-icon attendance"><CheckCircle2 size={20} /></span>
        </article>

        <article className="dashboard-stat-card dashboard-metric-card metric-rate">
          <div className="dashboard-metric-copy">
            <p>Latest Sunday attendance</p>
            <small>{latestSundayService ? `${latestSundayCheckIns.length} of ${activeMembers.length} active members` : 'No Sunday service recorded yet'}</small>
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
              <p className="card-kicker">{latestEvent?.is_sunday_service ? 'Most recent Sunday service' : 'Most recent event'}</p>
              <h2>{latestEvent?.name ?? 'No events yet'}</h2>
            </div>
            {latestEvent && <span className="status active">{latestEventCheckIns.length} check-in{latestEventCheckIns.length === 1 ? '' : 's'}</span>}
          </div>

          {latestEvent ? (
            <>
              <p className="latest-event-meta">
                {formatEventDate(latestEvent.starts_at)}
                {latestEvent.location ? ` · ${latestEvent.location}` : ''}
              </p>
              {latestEvent.admin_note && (
                <p className="dashboard-service-note">
                  <span>Service note</span>
                  {latestEvent.admin_note}
                </p>
              )}
              {latestEvent.is_sunday_service ? (
                <>
                  <div className="attendance-progress" aria-label={`${Math.round((latestEventCheckIns.length / Math.max(activeMembers.length, 1)) * 100)}% attendance`}>
                    <span style={{ width: `${Math.min(Math.round((latestEventCheckIns.length / Math.max(activeMembers.length, 1)) * 100), 100)}%` }} />
                  </div>
                  <p className="latest-event-summary">
                    <strong>{latestEventCheckIns.length}</strong> of {activeMembers.length} active members checked in
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
          <p className="card-kicker">Next event</p>
          <h2>{upcomingEvent?.name ?? 'Nothing scheduled'}</h2>
          <p className="muted">
            {upcomingEvent
              ? `${formatEventDate(upcomingEvent.starts_at)}${upcomingEvent.location ? ` · ${upcomingEvent.location}` : ''}`
              : 'Create an event when your next service is confirmed.'}
          </p>
          {upcomingEvent?.admin_note && (
            <p className="dashboard-service-note dashboard-upcoming-note">
              <span>Service note</span>
              {upcomingEvent.admin_note}
            </p>
          )}
        </article>

        <article className="dashboard-card recent-checkins-card">
          <div className="dashboard-card-heading">
            <div>
              <p className="card-kicker">Live activity</p>
              <h2>Recent check-ins</h2>
            </div>
            <div className="recent-checkin-actions">
              <span className="recent-checkin-total">{periodCheckIns.length} total</span>
              <button type="button" className="dashboard-records-link" onClick={onViewRecords}>
                View all records
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
                  aria-label={`View attendance records after ${checkIn.members ? `${checkIn.members.first_name} ${checkIn.members.last_name}` : 'this check-in'}`}
                >
                  <div className="avatar">
                    {checkIn.members
                      ? `${checkIn.members.first_name[0]}${checkIn.members.last_name[0]}`
                      : '?'}
                  </div>
                  <div className="recent-checkin-surface">
                    <div className="recent-checkin-copy">
                      <strong>{checkIn.members ? `${checkIn.members.first_name} ${checkIn.members.last_name}` : 'Unknown member'}</strong>
                      <span>{checkIn.events?.name ?? 'Unknown event'}</span>
                      {index === 0 && <em>Just in</em>}
                    </div>
                    <time>{formatCheckInTime(checkIn.checked_in_at)}</time>
                  </div>
                </button>
              ))}
            </div>
          )}
        </article>
      </section>

    </>
  )
}
