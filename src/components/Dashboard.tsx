import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock3, Users } from 'lucide-react'
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
  is_sunday_service: boolean
}

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

export default function Dashboard() {
  const [members, setMembers] = useState<Member[]>([])
  const [events, setEvents] = useState<AttendanceEvent[]>([])
  const [checkIns, setCheckIns] = useState<CheckIn[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    void loadDashboard()
  }, [])

  async function loadDashboard() {
    setLoading(true)
    setError('')

    const [membersResult, eventsResult, attendanceResult] = await Promise.all([
      supabase.from('members').select('id, status'),
      supabase
        .from('events')
        .select('id, name, starts_at, location, is_sunday_service')
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

    setLoading(false)
  }

  const activeMembers = useMemo(
    () => members.filter((member) => member.status === 'active'),
    [members],
  )
  const pastEvents = events.filter(
    (event) => new Date(event.starts_at).getTime() <= Date.now(),
  )
  const latestEvent = pastEvents[0] ?? null
  const latestSundayService =
    pastEvents.find((event) => event.is_sunday_service) ?? null
  const latestEventCheckIns = latestEvent
    ? checkIns.filter((checkIn) => checkIn.event_id === latestEvent.id)
    : []
  const latestSundayCheckIns = latestSundayService
    ? checkIns.filter((checkIn) => checkIn.event_id === latestSundayService.id)
    : []
  const attendanceRate = activeMembers.length
    ? Math.round((latestSundayCheckIns.length / activeMembers.length) * 100)
    : 0
  const upcomingEvent = [...events]
    .filter((event) => new Date(event.starts_at).getTime() > Date.now())
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    )[0]
  const recentCheckIns = checkIns.slice(0, 6)

  if (loading) {
    return <p className="dashboard-loading">Loading dashboard…</p>
  }

  if (error) {
    return <p className="error-message">{error}</p>
  }

  return (
    <>
      <div className="page-heading dashboard-heading">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>Dashboard</h1>
          <p className="muted">A quick view of your LifeCity attendance activity.</p>
        </div>

        <button className="secondary-button dashboard-refresh" onClick={() => void loadDashboard()}>
          Refresh data
        </button>
      </div>

      <section className="dashboard-stats" aria-label="Attendance overview">
        <article className="dashboard-stat-card">
          <span className="dashboard-stat-icon members"><Users size={20} /></span>
          <p>Total members</p>
          <strong>{members.length}</strong>
          <small>{activeMembers.length} active member{activeMembers.length === 1 ? '' : 's'}</small>
        </article>

        <article className="dashboard-stat-card">
          <span className="dashboard-stat-icon events"><CalendarDays size={20} /></span>
          <p>Events created</p>
          <strong>{events.length}</strong>
          <small>{upcomingEvent ? `Next: ${upcomingEvent.name}` : 'No upcoming event'}</small>
        </article>

        <article className="dashboard-stat-card">
          <span className="dashboard-stat-icon attendance"><CheckCircle2 size={20} /></span>
          <p>Latest event attendance</p>
          <strong>{latestEventCheckIns.length}</strong>
          <small>{latestEvent ? latestEvent.name : 'No event recorded yet'}</small>
        </article>

        <article className="dashboard-stat-card">
          <span className="dashboard-stat-icon rate"><Clock3 size={20} /></span>
          <p>Latest Sunday attendance</p>
          <strong>{latestSundayService ? `${attendanceRate}%` : '—'}</strong>
          <small>{latestSundayService ? `${latestSundayCheckIns.length} of ${activeMembers.length} active members` : 'No Sunday service recorded yet'}</small>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="dashboard-card latest-event-card">
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
              {latestEvent.is_sunday_service ? (
                <>
                  <div className="attendance-progress" aria-label={`${Math.round((latestEventCheckIns.length / Math.max(activeMembers.length, 1)) * 100)}% attendance`}>
                    <span style={{ width: `${Math.min(Math.round((latestEventCheckIns.length / Math.max(activeMembers.length, 1)) * 100), 100)}%` }} />
                  </div>
                  <p className="latest-event-summary">
                    <strong>{latestEventCheckIns.length}</strong> of {activeMembers.length} active members checked in
                  </p>
                </>
              ) : (
                <p className="latest-event-summary count-only-summary">
                  <strong>{latestEventCheckIns.length}</strong> member{latestEventCheckIns.length === 1 ? '' : 's'} checked in
                </p>
              )}
            </>
          ) : (
            <p className="muted">Create an event to start tracking attendance here.</p>
          )}
        </article>

        <article className="dashboard-card next-event-card">
          <p className="card-kicker">Next event</p>
          <h2>{upcomingEvent?.name ?? 'Nothing scheduled'}</h2>
          <p className="muted">
            {upcomingEvent
              ? `${formatEventDate(upcomingEvent.starts_at)}${upcomingEvent.location ? ` · ${upcomingEvent.location}` : ''}`
              : 'Create an event when your next service is confirmed.'}
          </p>
        </article>

        <article className="dashboard-card recent-checkins-card">
          <div className="dashboard-card-heading">
            <div>
              <p className="card-kicker">Live activity</p>
              <h2>Recent check-ins</h2>
            </div>
            <span>{checkIns.length} total</span>
          </div>

          {recentCheckIns.length === 0 ? (
            <p className="dashboard-empty">Recent QR scans will appear here.</p>
          ) : (
            <div className="recent-checkin-list">
              {recentCheckIns.map((checkIn) => (
                <div className="recent-checkin-row" key={checkIn.id}>
                  <div className="avatar">
                    {checkIn.members
                      ? `${checkIn.members.first_name[0]}${checkIn.members.last_name[0]}`
                      : '?'}
                  </div>
                  <div>
                    <strong>{checkIn.members ? `${checkIn.members.first_name} ${checkIn.members.last_name}` : 'Unknown member'}</strong>
                    <span>{checkIn.events?.name ?? 'Unknown event'}</span>
                  </div>
                  <time>{formatCheckInTime(checkIn.checked_in_at)}</time>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </>
  )
}
