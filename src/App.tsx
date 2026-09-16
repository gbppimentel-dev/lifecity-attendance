import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  Camera,
  ChevronDown,
  ClipboardList,
  Eye,
  LayoutDashboard,
  LogOut,
  Plus,
  Pencil,
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
  is_sunday_service: boolean
  created_at: string
}

const emptyEvent = {
  name: '',
  startsDate: '',
  startsTime: '',
  location: '',
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

export default function App() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [page, setPage] = useState<Page>('dashboard')
  const [events, setEvents] = useState<AttendanceEvent[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [eventForm, setEventForm] = useState(emptyEvent)
  const [showEventForm, setShowEventForm] = useState(false)
  const [editingService, setEditingService] = useState<AttendanceEvent | null>(null)
  const [viewingService, setViewingService] = useState<AttendanceEvent | null>(null)
  const [scannerEventId, setScannerEventId] = useState('')
  const [serviceMonth, setServiceMonth] = useState('')
  const [serviceYear, setServiceYear] = useState('')
  const [serviceSort, setServiceSort] = useState<'recent' | 'oldest'>('recent')
  const serviceFormRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user.email ?? null)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null)
    })

    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (userEmail) {
      void loadEvents()
    }
  }, [userEmail])

  async function loadEvents() {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('starts_at', { ascending: false })

    if (error) {
      setMessage(error.message)
      return
    }

    const loadedEvents = data as AttendanceEvent[]
    setEvents(loadedEvents)

    if (!scannerEventId && loadedEvents.length > 0) {
      setScannerEventId(loadedEvents[0].id)
    }
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
    setViewingService(null)
    setEditingService(item)
    setEventForm({
      name: item.name,
      startsDate: dateTimeLocal(item.starts_at).slice(0, 10),
      startsTime: dateTimeLocal(item.starts_at).slice(11),
      location: item.location ?? '',
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
          (!serviceMonth || parts.month === serviceMonth) &&
          (!serviceYear || parts.year === serviceYear)
        )
      })
      .sort((a, b) => {
        const difference =
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
        return serviceSort === 'recent' ? -difference : difference
      })
  }, [events, serviceMonth, serviceSort, serviceYear])

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
            onClick={() => setPage('dashboard')}
          >
            <LayoutDashboard size={17} />
            Dashboard
          </button>

          <button
            className={page === 'members' ? 'nav-active' : ''}
            onClick={() => setPage('members')}
          >
            <Users size={17} />
            Members
          </button>

          <button
            className={page === 'events' ? 'nav-active' : ''}
            onClick={() => setPage('events')}
          >
            <CalendarDays size={17} />
            Services
          </button>

          <button
            className={page === 'scanner' ? 'nav-active' : ''}
            onClick={() => setPage('scanner')}
          >
            <Camera size={17} />
            Scanner
          </button>

          <button
            className={page === 'records' ? 'nav-active' : ''}
            onClick={() => setPage('records')}
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

      <section className="content">
        {page === 'dashboard' && <Dashboard />}

        {page === 'members' && <MemberManager />}

        {page === 'events' && (
          <>
            <div className="page-heading">
              <div>
                <p className="eyebrow">Attendance setup</p>
                <h1>Services</h1>
                <p className="muted">
                  Create an event before checking in members.
                </p>
              </div>

              <button
                className="primary-button"
                onClick={() => (showEventForm ? setShowEventForm(false) : openCreateService())}
              >
                <Plus size={18} />
                {showEventForm ? 'Close form' : 'Create Event'}
              </button>
            </div>

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

                  {filteredServices.map((item) => (
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
                        <strong>{item.name}</strong>
                        <span>
                          {eventDateTime(item.starts_at)}
                          {item.location ? ` · ${item.location}` : ''}
                        </span>
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
                          onClick={() => setViewingService(item)}
                          title="View service"
                          aria-label={`View ${item.name}`}
                        >
                          <Eye size={20} />
                        </button>
                        <button
                          className="service-action-button"
                          onClick={() => openEditService(item)}
                          title="Edit service"
                          aria-label={`Edit ${item.name}`}
                        >
                          <Pencil size={20} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {viewingService && (
              <div className="modal-backdrop" onClick={() => setViewingService(null)}>
                <section
                  className="service-view-modal"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button className="close-button" onClick={() => setViewingService(null)}>
                    <X size={18} />
                  </button>
                  <button
                    className="service-modal-edit-button"
                    onClick={() => openEditService(viewingService)}
                    title="Edit service"
                    aria-label="Edit service"
                  >
                    <Pencil size={19} />
                  </button>
                  <p className="eyebrow">Service details</p>
                  <h2>{viewingService.name}</h2>
                  <dl className="service-details-list">
                    <div><dt>Starts at</dt><dd>{eventDateTime(viewingService.starts_at)}</dd></div>
                    <div><dt>Location</dt><dd>{viewingService.location ?? 'Not specified'}</dd></div>
                    <div><dt>Sunday Service</dt><dd>{viewingService.is_sunday_service ? 'Yes' : 'No'}</dd></div>
                  </dl>
                </section>
              </div>
            )}
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
            <div className="page-heading">
              <div>
                <p className="eyebrow">Live check-in</p>
                <h1>QR Scanner</h1>
                <p className="muted">
                  Select the event, then scan member QR codes using the camera.
                </p>
              </div>
            </div>

            <section className="scanner-event-picker">
              <label>
                Event to check in
                <select
                  value={scannerEventId}
                  onChange={(event) => setScannerEventId(event.target.value)}
                >
                  <option value="">Choose an event</option>

                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name} — {eventDateTime(event.starts_at)}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <AttendanceScanner event={selectedScannerEvent} />
          </>
        )}
      </section>
    </main>
  )
}
