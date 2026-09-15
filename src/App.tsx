import { type FormEvent, useEffect, useState } from 'react'
import {
  CalendarDays,
  Camera,
  ClipboardList,
  LogOut,
  Plus,
  Users,
} from 'lucide-react'
import AttendanceRecords from './components/AttendanceRecords'
import AttendanceScanner from './components/AttendanceScanner'
import MemberManager from './components/MemberManager'
import { supabase } from './lib/supabase'

type Page = 'members' | 'events' | 'scanner' | 'records'

type AttendanceEvent = {
  id: string
  name: string
  starts_at: string
  ends_at: string | null
  location: string | null
  created_at: string
}

const emptyEvent = {
  name: '',
  startsAt: '',
  location: '',
}

function eventDateTime(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function App() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [page, setPage] = useState<Page>('members')
  const [events, setEvents] = useState<AttendanceEvent[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [eventForm, setEventForm] = useState(emptyEvent)
  const [showEventForm, setShowEventForm] = useState(false)
  const [scannerEventId, setScannerEventId] = useState('')

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

    const { error } = await supabase.from('events').insert({
      name: eventForm.name.trim(),
      starts_at: new Date(eventForm.startsAt).toISOString(),
      location: eventForm.location.trim() || null,
    })

    if (error) {
      setMessage(error.message)
    } else {
      setEventForm(emptyEvent)
      setShowEventForm(false)
      await loadEvents()
    }

    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setEvents([])
  }

  const selectedScannerEvent =
    events.find((event) => event.id === scannerEventId) ?? null

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
            Events
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
        {page === 'members' && <MemberManager />}

        {page === 'events' && (
          <>
            <div className="page-heading">
              <div>
                <p className="eyebrow">Attendance setup</p>
                <h1>Events & services</h1>
                <p className="muted">
                  Create an event before checking in members.
                </p>
              </div>

              <button
                className="primary-button"
                onClick={() => setShowEventForm(!showEventForm)}
              >
                <Plus size={18} />
                {showEventForm ? 'Close form' : 'Create event'}
              </button>
            </div>

            {showEventForm && (
              <section className="form-card">
                <h2>Create an event</h2>

                <form className="event-form" onSubmit={handleAddEvent}>
                  <label>
                    Event name
                    <input
                      value={eventForm.name}
                      onChange={(event) =>
                        setEventForm({
                          ...eventForm,
                          name: event.target.value,
                        })
                      }
                      placeholder="Example: Sunday Worship"
                      required
                    />
                  </label>

                  <label>
                    Starts at
                    <input
                      type="datetime-local"
                      value={eventForm.startsAt}
                      onChange={(event) =>
                        setEventForm({
                          ...eventForm,
                          startsAt: event.target.value,
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
                      placeholder="Example: Main Sanctuary"
                    />
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
                      {loading ? 'Saving…' : 'Save event'}
                    </button>
                  </div>
                </form>
              </section>
            )}

            <section className="directory-card">
              <div className="directory-toolbar">
                <div>
                  <h2>All events</h2>
                  <p>{events.length} created</p>
                </div>
              </div>

              {events.length === 0 ? (
                <div className="empty-state">
                  <CalendarDays size={30} />
                  <h3>No events yet</h3>
                  <p>Create your next service to prepare for scanning.</p>
                </div>
              ) : (
                <div className="event-list">
                  {events.map((item) => (
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
                    </article>
                  ))}
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