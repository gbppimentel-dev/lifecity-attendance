// Replacement ID: page-transition-replay-v1
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  Archive,
  ArchiveRestore,
  Camera,
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import AttendanceRecords from './components/AttendanceRecords'
import AttendanceScanner from './components/AttendanceScanner'
import Dashboard from './components/Dashboard'
import MemberManager from './components/MemberManager'
import { supabase } from './lib/supabase'

type Page = 'dashboard' | 'members' | 'events' | 'scanner' | 'records'

type AttendanceEvent = {
  id: string
  name: string
  starts_at: string
  ends_at: string | null
  location: string | null
  admin_note: string | null
  is_sunday_service: boolean
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
    return { label: 'In progress', className: 'in-progress' }
  }

  return { label: 'Completed', className: 'completed' }
}

export default function App() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [page, setPage] = useState<Page>('dashboard')
  const [isPageTransitioning, setIsPageTransitioning] = useState(false)
  const [pageTransitionKey, setPageTransitionKey] = useState(0)
  const [events, setEvents] = useState<AttendanceEvent[]>([])
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const [attendanceCounts, setAttendanceCounts] = useState<Record<string, number>>({})
  const [activeMemberCount, setActiveMemberCount] = useState(0)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [eventForm, setEventForm] = useState(emptyEvent)
  const [showEventForm, setShowEventForm] = useState(false)
  const [editingService, setEditingService] = useState<AttendanceEvent | null>(null)
  const [scannerEventId, setScannerEventId] = useState('')
  const [serviceMonth, setServiceMonth] = useState('')
  const [serviceYear, setServiceYear] = useState('')
  const [serviceSort, setServiceSort] = useState<'recent' | 'oldest'>('recent')
  const [archiveFilter, setArchiveFilter] = useState<'all' | 'active' | 'archived'>('active')
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
    setIsPageTransitioning(true)
    setPageTransitionKey((current) => current + 1)

    const duration = 340
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

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage('Incorrect email or password. Please try again.')
    }

    setLoading(false)
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

  async function deleteService(item: AttendanceEvent) {
    setMessage('')

    const { count, error: attendanceError } = await supabase
      .from('attendance')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', item.id)

    if (attendanceError) {
      setMessage(attendanceError.message)
      return
    }

    if ((count ?? 0) > 0) {
      if (window.confirm('This event has attendance records and cannot be deleted. Archive it instead? You can restore it later.')) {
        await setServiceArchive(item, true)
      }
      return
    }

    if (!window.confirm(`Delete “${item.name}”? This cannot be undone.`)) {
      return
    }

    setLoading(true)
    const { error } = await supabase.from('events').delete().eq('id', item.id)

    if (error) {
      setMessage(error.message)
    } else {
      await loadEvents()
    }

    setLoading(false)
  }

  async function setServiceArchive(item: AttendanceEvent, archived: boolean) {
    setLoading(true)
    const { error } = await supabase
      .from('events')
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq('id', item.id)

    if (error) setMessage(error.message)
    else await loadEvents()

    setLoading(false)
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
    await supabase.auth.signOut()
    setEvents([])
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

  if (!userEmail) {
    return (
      <main className="login-page">
        <section className="login-card">
          <div className="brand-icon">
            <Users size={28} />
          </div>

          <p className="eyebrow">LifeCity Attendance</p>
          <h1>Welcome back</h1>
          <p className="muted">Sign in to manage members and attendance.</p>

          <form className="login-form" onSubmit={handleLogin}>
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            {message && <p className="error-message">{message}</p>}

            <button className="primary-button full-width" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="app-page">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon small">
            <Users size={20} />
          </div>
          <span>LifeCity Attendance</span>
        </div>

        <nav className="main-nav">
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
        </nav>

        <button className="text-button" onClick={handleLogout}>
          <LogOut size={17} />
          Sign out
        </button>
      </header>

      <section
        className={`content${isPageTransitioning ? ' is-page-changing' : ''}`}
        key={pageTransitionKey}
      >

        {page === 'dashboard' && (
          <Dashboard
            activeScannerEventId={scannerEventId}
            onOpenScanner={() => changePage('scanner')}
            onViewRecords={() => changePage('records')}
          />
        )}

        {page === 'members' && <MemberManager />}

        {page === 'events' && (
          <>
            <section className="services-editorial-hero">
              <div className="services-hero-copy">
                <p className="eyebrow">Attendance setup</p>
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
                  {showEventForm ? 'Form is open' : 'Start here'}
                </span>
                <strong>{showEventForm ? 'Close form' : 'New service'}</strong>
                <span className="services-create-action-note">
                  {showEventForm ? 'Return to your list' : 'Set the date & time'}
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
                      {editingService ? 'Edit event' : 'New event'}
                    </p>
                    <h2>{editingService ? 'Update this event' : 'Create an Event'}</h2>
                  </div>
                  <button
                    className="close-button"
                    type="button"
                    onClick={() => {
                      setShowEventForm(false)
                      setEditingService(null)
                      setEventForm(emptyEvent)
                    }}
                    aria-label="Close service form"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form className="event-form" onSubmit={handleAddEvent}>
                  <label className="wide-field">
                    Event name
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
                    <span>Service note <em>Optional</em></span>
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

                  {message && (
                    <p className="error-message wide-field">{message}</p>
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
                      {loading ? 'Saving…' : editingService ? 'Save changes' : 'Save Event'}
                    </button>
                  </div>
                </form>
              </section>
            )}

            <section className="directory-card">
              <div className="directory-toolbar">
                <div>
                  <h2>All services</h2>
                  <p>{filteredServices.length} of {events.length} shown</p>
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

              {events.length === 0 ? (
                <div className="empty-state">
                  <CalendarDays size={30} />
                  <h3>No services yet</h3>
                  <p>Create your next service to prepare for scanning.</p>
                </div>
              ) : filteredServices.length === 0 ? (
                <div className="empty-state">
                  <CalendarDays size={30} />
                  <h3>No services found</h3>
                  <p>Try another month or year.</p>
                </div>
              ) : (
                <div className="event-list">
                  <div className="service-list-heading">
                    <button
                      className={`service-sort-button${serviceSort === 'oldest' ? ' sort-oldest' : ''}`}
                      onClick={() =>
                        setServiceSort((current) =>
                          current === 'recent' ? 'oldest' : 'recent',
                        )
                      }
                      title="Change service sorting"
                    >
                      <strong>Service</strong>
                      <span>{serviceSort === 'recent' ? 'Recent first' : 'Oldest first'}</span>
                      <ChevronDown size={16} />
                    </button>
                    <span className="sunday-service-heading">Sunday Service?</span>
                    <span>Actions</span>
                  </div>

                  {filteredServices.map((item) => {
                    const serviceState = getServiceState(item, currentTime)
                    const canScan =
                      serviceState.className === 'upcoming' ||
                      serviceState.className === 'in-progress'

                    return (
                    <article className="event-row" key={item.id}>
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
                          <span className="current-scanner-indicator">Currently checking in</span>
                        )}
                        <span>
                          {eventDateTime(item.starts_at)}
                          {item.location ? ` · ${item.location}` : ''}
                        </span>
                        <small className="service-attendance-summary">
                          {item.is_sunday_service
                            ? `${attendanceCounts[item.id] ?? 0} / ${activeMemberCount} · ${activeMemberCount ? Math.round(((attendanceCounts[item.id] ?? 0) / activeMemberCount) * 100) : 0}%`
                            : `${attendanceCounts[item.id] ?? 0} check-in${(attendanceCounts[item.id] ?? 0) === 1 ? '' : 's'}`}
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
                          aria-label={`Mark ${item.name} as a Sunday service`}
                        />
                      </label>

                      <div className="service-row-actions">
                        <button
                          className="service-action-button"
                          onClick={() => openEditService(item)}
                          title="Edit service"
                          aria-label={`Edit ${item.name}`}
                        >
                          <Pencil size={20} />
                        </button>
                        {item.archived_at ? (
                          <button className="service-action-button" onClick={() => void setServiceArchive(item, false)} title="Unarchive event" aria-label={`Unarchive ${item.name}`}>
                            <ArchiveRestore size={19} />
                          </button>
                        ) : (
                          <>
                            {canScan && (
                              <button
                                className="service-action-button service-scan-button"
                                onClick={() => openScannerForService(item)}
                                title="Open scanner for this event"
                                aria-label={`Scan check-ins for ${item.name}`}
                              >
                                <Camera size={19} />
                              </button>
                            )}
                            {(attendanceCounts[item.id] ?? 0) === 0 && (
                              <button
                                className="service-action-button danger"
                                onClick={() => void deleteService(item)}
                                title="Delete event"
                                aria-label={`Delete ${item.name}`}
                              >
                                <Trash2 size={19} />
                              </button>
                            )}
                            {(attendanceCounts[item.id] ?? 0) > 0 && (
                              <button className="service-action-button" onClick={() => void setServiceArchive(item, true)} title="Archive event" aria-label={`Archive ${item.name}`}>
                                <Archive size={19} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </article>
                    )
                  })}
                </div>
              )}
            </section>

          </>
        )}

        {page === 'records' && (
          <>
            <div className="page-heading">
              <div>
                <p className="eyebrow">Reports</p>
                <h1>Attendance records</h1>
                <p className="muted">
                  Review check-ins and export an Excel-friendly CSV report.
                </p>
              </div>
            </div>

            <AttendanceRecords events={events} />
          </>
        )}

        {page === 'scanner' && (
          <>
            <section className="scanner-editorial-hero">
              <div className="scanner-hero-copy">
                <p className="eyebrow">Attendance station</p>
                <h1>Check in members</h1>
                <p>
                  Scan a member QR code, or use manual search when needed.
                </p>
                <span className="scanner-hero-caption">Camera first · Manual search when needed</span>
              </div>

              <button
                type="button"
                className="scanner-status-card"
                onClick={() => scannerServicePickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                aria-label="Choose the service for check-in"
              >
                <span className="scanner-status-kicker">
                  {selectedScannerEvent ? 'Scanner ready' : 'Choose a service'}
                </span>
                <strong>
                  {selectedScannerEvent
                    ? `${attendanceCounts[selectedScannerEvent.id] ?? 0} check-in${(attendanceCounts[selectedScannerEvent.id] ?? 0) === 1 ? '' : 's'} so far`
                    : 'Waiting to start'}
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
                <p className="card-kicker">Check-in service</p>
                <h2 title={selectedScannerEvent?.name}>
                  {selectedScannerEvent?.name ?? 'Choose a service'}
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
                    aria-label="Choose check-in service"
                    title={selectedScannerEvent ? `${selectedScannerEvent.name} — ${eventDateTime(selectedScannerEvent.starts_at)}` : 'Choose a service'}
                  >
                    <option value="">Choose an event</option>

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
                    {attendanceCounts[selectedScannerEvent.id] ?? 0} check-in{(attendanceCounts[selectedScannerEvent.id] ?? 0) === 1 ? '' : 's'} so far
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

