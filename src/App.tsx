import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Download, LogOut, Plus, QrCode, Search, UserPlus, Users, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from './lib/supabase'

type Member = { id: string; member_number: string; first_name: string; last_name: string; email: string | null; mobile: string | null; member_group: string | null; status: 'active' | 'inactive'; qr_token: string; created_at: string }
type AttendanceEvent = { id: string; name: string; starts_at: string; ends_at: string | null; location: string | null; created_at: string }

const emptyMember = { firstName: '', lastName: '', email: '', mobile: '', memberGroup: '' }
const emptyEvent = { name: '', startsAt: '', location: '' }

export default function App() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [page, setPage] = useState<'members' | 'events'>('members')
  const [members, setMembers] = useState<Member[]>([])
  const [events, setEvents] = useState<AttendanceEvent[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [memberForm, setMemberForm] = useState(emptyMember)
  const [eventForm, setEventForm] = useState(emptyEvent)
  const [showMemberForm, setShowMemberForm] = useState(false)
  const [showEventForm, setShowEventForm] = useState(false)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserEmail(data.session?.user.email ?? null))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUserEmail(session?.user.email ?? null))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => { if (userEmail) { loadMembers(); loadEvents() } }, [userEmail])

  async function loadMembers() {
    const { data, error } = await supabase.from('members').select('*').order('created_at', { ascending: false })
    if (error) setMessage(error.message); else setMembers(data as Member[])
  }

  async function loadEvents() {
    const { data, error } = await supabase.from('events').select('*').order('starts_at', { ascending: false })
    if (error) setMessage(error.message); else setEvents(data as AttendanceEvent[])
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMessage('Incorrect email or password. Please try again.')
    setLoading(false)
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setLoading(true)
    const { error } = await supabase.from('members').insert({
      member_number: `M-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      first_name: memberForm.firstName.trim(), last_name: memberForm.lastName.trim(),
      email: memberForm.email.trim() || null, mobile: memberForm.mobile.trim() || null,
      member_group: memberForm.memberGroup.trim() || null,
    })
    if (error) setMessage(error.message); else { setMemberForm(emptyMember); setShowMemberForm(false); await loadMembers() }
    setLoading(false)
  }

  async function addEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setLoading(true)
    const { error } = await supabase.from('events').insert({
      name: eventForm.name.trim(), starts_at: new Date(eventForm.startsAt).toISOString(), location: eventForm.location.trim() || null,
    })
    if (error) setMessage(error.message); else { setEventForm(emptyEvent); setShowEventForm(false); await loadEvents() }
    setLoading(false)
  }

  function downloadQrCode(member: Member) {
    const svg = document.getElementById('member-qr-code') as SVGSVGElement | null
    if (!svg) return
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `lifecity-qr-${member.member_number}.svg`; link.click(); URL.revokeObjectURL(url)
  }

  const visibleMembers = useMemo(() => {
    const query = search.toLowerCase().trim()
    return !query ? members : members.filter((member) => `${member.first_name} ${member.last_name} ${member.member_number} ${member.member_group ?? ''}`.toLowerCase().includes(query))
  }, [members, search])

  if (!userEmail) return <main className="login-page"><section className="login-card"><div className="brand-icon"><Users size={28} /></div><p className="eyebrow">LifeCity Attendance</p><h1>Welcome back</h1><p className="muted">Sign in to manage members and attendance.</p><form className="login-form" onSubmit={login}><label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>{message && <p className="error-message">{message}</p>}<button className="primary-button full-width" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button></form></section></main>

  return <main className="app-page">
    <header className="topbar"><div className="brand"><div className="brand-icon small"><Users size={20} /></div><span>LifeCity Attendance</span></div><nav className="main-nav"><button className={page === 'members' ? 'nav-active' : ''} onClick={() => setPage('members')}><Users size={17} />Members</button><button className={page === 'events' ? 'nav-active' : ''} onClick={() => setPage('events')}><CalendarDays size={17} />Events</button></nav><button className="text-button" onClick={() => supabase.auth.signOut()}><LogOut size={17} />Sign out</button></header>
    <section className="content">
      {page === 'members' ? <>
        <div className="page-heading"><div><p className="eyebrow">Member directory</p><h1>Members</h1><p className="muted">Every member has a private QR code for check-in.</p></div><button className="primary-button" onClick={() => setShowMemberForm(!showMemberForm)}><UserPlus size={18} />{showMemberForm ? 'Close form' : 'Add member'}</button></div>
        {showMemberForm && <section className="form-card"><h2>Register a member</h2><form className="member-form" onSubmit={addMember}><label>First name<input value={memberForm.firstName} onChange={(e) => setMemberForm({ ...memberForm, firstName: e.target.value })} required /></label><label>Last name<input value={memberForm.lastName} onChange={(e) => setMemberForm({ ...memberForm, lastName: e.target.value })} required /></label><label>Email <span>Optional</span><input type="email" value={memberForm.email} onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} /></label><label>Mobile number <span>Optional</span><input value={memberForm.mobile} onChange={(e) => setMemberForm({ ...memberForm, mobile: e.target.value })} /></label><label className="wide-field">Group / ministry <span>Optional</span><input value={memberForm.memberGroup} onChange={(e) => setMemberForm({ ...memberForm, memberGroup: e.target.value })} placeholder="Example: Youth, Worship Team, Adults" /></label>{message && <p className="error-message wide-field">{message}</p>}<div className="form-actions wide-field"><button type="button" className="secondary-button" onClick={() => setShowMemberForm(false)}>Cancel</button><button className="primary-button" disabled={loading}><Plus size={18} />{loading ? 'Saving…' : 'Save member'}</button></div></form></section>}
        <section className="directory-card"><div className="directory-toolbar"><div><h2>All members</h2><p>{members.length} registered</p></div><label className="search-box"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members" /></label></div>{visibleMembers.length === 0 ? <div className="empty-state"><Users size={30} /><h3>No members found</h3><p>Add your first member to begin building the directory.</p></div> : <div className="member-list">{visibleMembers.map((member) => <article className="member-row" key={member.id}><div className="avatar">{member.first_name[0]}{member.last_name[0]}</div><div className="member-name"><strong>{member.first_name} {member.last_name}</strong><span>{member.member_number}</span></div><span className="group-label">{member.member_group || 'No group'}</span><span className={`status ${member.status}`}>{member.status}</span><button className="qr-button" onClick={() => setSelectedMember(member)}><QrCode size={17} />QR</button></article>)}</div>}</section>
      </> : <>
        <div className="page-heading"><div><p className="eyebrow">Attendance setup</p><h1>Events & services</h1><p className="muted">Create an event before checking in members.</p></div><button className="primary-button" onClick={() => setShowEventForm(!showEventForm)}><Plus size={18} />{showEventForm ? 'Close form' : 'Create event'}</button></div>
        {showEventForm && <section className="form-card"><h2>Create an event</h2><form className="event-form" onSubmit={addEvent}><label>Event name<input value={eventForm.name} onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })} placeholder="Example: Sunday Worship" required /></label><label>Starts at<input type="datetime-local" value={eventForm.startsAt} onChange={(e) => setEventForm({ ...eventForm, startsAt: e.target.value })} required /></label><label className="wide-field">Location <span>Optional</span><input value={eventForm.location} onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })} placeholder="Example: Main Sanctuary" /></label>{message && <p className="error-message wide-field">{message}</p>}<div className="form-actions wide-field"><button type="button" className="secondary-button" onClick={() => setShowEventForm(false)}>Cancel</button><button className="primary-button" disabled={loading}><Plus size={18} />{loading ? 'Saving…' : 'Save event'}</button></div></form></section>}
        <section className="directory-card"><div className="directory-toolbar"><div><h2>All events</h2><p>{events.length} created</p></div></div>{events.length === 0 ? <div className="empty-state"><CalendarDays size={30} /><h3>No events yet</h3><p>Create your next service or gathering to prepare for scanning.</p></div> : <div className="event-list">{events.map((item) => <article className="event-row" key={item.id}><div className="event-date"><strong>{new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(item.starts_at))}</strong><span>{new Intl.DateTimeFormat('en', { weekday: 'short' }).format(new Date(item.starts_at))}</span></div><div className="member-name"><strong>{item.name}</strong><span>{new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(new Date(item.starts_at))}{item.location ? ` · ${item.location}` : ''}</span></div></article>)}</div>}</section>
      </>}
    </section>
    {selectedMember && <div className="modal-backdrop" onMouseDown={() => setSelectedMember(null)}><section className="qr-modal" onMouseDown={(e) => e.stopPropagation()}><button className="close-button" onClick={() => setSelectedMember(null)} aria-label="Close QR code"><X size={20} /></button><p className="eyebrow">Member QR code</p><h2>{selectedMember.first_name} {selectedMember.last_name}</h2><p className="muted">{selectedMember.member_number}</p><div className="qr-frame"><QRCodeSVG id="member-qr-code" value={`att:${selectedMember.qr_token}`} size={220} level="M" includeMargin /></div><p className="qr-note">This code contains only a random private token, not the member’s personal details.</p><button className="primary-button full-width" onClick={() => downloadQrCode(selectedMember)}><Download size={18} />Download QR code</button></section></div>}
  </main>
}
