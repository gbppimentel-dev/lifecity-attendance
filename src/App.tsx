import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  LogOut,
  Plus,
  Search,
  Users,
  UserPlus,
} from 'lucide-react'
import { supabase } from './lib/supabase'

type Member = {
  id: string
  member_number: string
  first_name: string
  last_name: string
  email: string | null
  mobile: string | null
  member_group: string | null
  status: 'active' | 'inactive'
  created_at: string
}

const emptyForm = {
  firstName: '',
  lastName: '',
  email: '',
  mobile: '',
  memberGroup: '',
}

export default function App() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [search, setSearch] = useState('')
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [savingMember, setSavingMember] = useState(false)
  const [memberError, setMemberError] = useState('')
  const [showForm, setShowForm] = useState(false)

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
      loadMembers()
    }
  }, [userEmail])

  async function loadMembers() {
    setLoadingMembers(true)

    const { data, error } = await supabase
      .from('members')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setMemberError(error.message)
    } else {
      setMembers(data as Member[])
    }

    setLoadingMembers(false)
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoginError('')
    setLoginLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setLoginError('Incorrect email or password. Please try again.')
    }

    setLoginLoading(false)
  }

  async function handleAddMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMemberError('')
    setSavingMember(true)

    const { error } = await supabase.from('members').insert({
      member_number: `M-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      email: form.email.trim() || null,
      mobile: form.mobile.trim() || null,
      member_group: form.memberGroup.trim() || null,
    })

    if (error) {
      setMemberError(error.message)
      setSavingMember(false)
      return
    }

    setForm(emptyForm)
    setShowForm(false)
    setSavingMember(false)
    loadMembers()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setMembers([])
  }

  const visibleMembers = useMemo(() => {
    const query = search.toLowerCase().trim()

    if (!query) return members

    return members.filter((member) =>
      `${member.first_name} ${member.last_name} ${member.member_number} ${member.member_group ?? ''}`
        .toLowerCase()
        .includes(query),
    )
  }, [members, search])

  if (!userEmail) {
    return (
      <main className="login-page">
        <section className="login-card">
          <div className="brand-icon"><Users size={28} /></div>
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
                placeholder="you@example.com"
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Your password"
                required
              />
            </label>

            {loginError && <p className="error-message">{loginError}</p>}

            <button className="primary-button full-width" disabled={loginLoading}>
              {loginLoading ? 'Signing in…' : 'Sign in'}
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
          <div className="brand-icon small"><Users size={20} /></div>
          <span>LifeCity Attendance</span>
        </div>

        <button className="text-button" onClick={handleLogout}>
          <LogOut size={17} />
          Sign out
        </button>
      </header>

      <section className="content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Member directory</p>
            <h1>Members</h1>
            <p className="muted">Register people now. QR codes will be added next.</p>
          </div>

          <button className="primary-button" onClick={() => setShowForm(!showForm)}>
            <UserPlus size={18} />
            {showForm ? 'Close form' : 'Add member'}
          </button>
        </div>

        {showForm && (
          <section className="form-card">
            <h2>Register a member</h2>

            <form className="member-form" onSubmit={handleAddMember}>
              <label>
                First name
                <input
                  value={form.firstName}
                  onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                  required
                />
              </label>

              <label>
                Last name
                <input
                  value={form.lastName}
                  onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                  required
                />
              </label>

              <label>
                Email <span>Optional</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </label>

              <label>
                Mobile number <span>Optional</span>
                <input
                  value={form.mobile}
                  onChange={(event) => setForm({ ...form, mobile: event.target.value })}
                />
              </label>

              <label className="wide-field">
                Group / ministry <span>Optional</span>
                <input
                  value={form.memberGroup}
                  onChange={(event) => setForm({ ...form, memberGroup: event.target.value })}
                  placeholder="Example: Youth, Worship Team, Adults"
                />
              </label>

              {memberError && <p className="error-message wide-field">{memberError}</p>}

              <div className="form-actions wide-field">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button className="primary-button" disabled={savingMember}>
                  <Plus size={18} />
                  {savingMember ? 'Saving…' : 'Save member'}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="directory-card">
          <div className="directory-toolbar">
            <div>
              <h2>All members</h2>
              <p>{members.length} registered</p>
            </div>

            <label className="search-box">
              <Search size={18} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search members"
              />
            </label>
          </div>

          {loadingMembers ? (
            <p className="empty-state">Loading members…</p>
          ) : visibleMembers.length === 0 ? (
            <div className="empty-state">
              <Users size={30} />
              <h3>No members found</h3>
              <p>Add your first member to begin building the directory.</p>
            </div>
          ) : (
            <div className="member-list">
              {visibleMembers.map((member) => (
                <article className="member-row" key={member.id}>
                  <div className="avatar">
                    {member.first_name[0]}{member.last_name[0]}
                  </div>

                  <div className="member-name">
                    <strong>{member.first_name} {member.last_name}</strong>
                    <span>{member.member_number}</span>
                  </div>

                  <span className="group-label">{member.member_group || 'No group'}</span>
                  <span className={`status ${member.status}`}>{member.status}</span>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}