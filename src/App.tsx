import { CalendarDays, QrCode, Users } from 'lucide-react'

const starterSteps = [
  ['1', 'Create your Supabase project', 'This gives the app its database and admin login.'],
  ['2', 'Run the database schema', 'Copy the SQL file in this repository into Supabase.'],
  ['3', 'Connect environment values', 'Add your Supabase URL and anon key to .env.local.'],
  ['4', 'Build the Members page', 'Register people and generate their secure QR tokens.'],
]

export default function App() {
  return <main className="shell">
    <section className="hero">
      <p className="eyebrow">Attendance Monitoring</p>
      <h1>Your attendance app is ready to build.</h1>
      <p className="lead">A mobile-friendly QR check-in app for your church or organization.</p>
    </section>

    <section className="cards" aria-label="First version features">
      <article><Users size={24} /><h2>Members</h2><p>Registration, groups, statuses, and private QR tokens.</p></article>
      <article><QrCode size={24} /><h2>QR Check-in</h2><p>Scan on a phone and prevent duplicate attendance records.</p></article>
      <article><CalendarDays size={24} /><h2>Events & Reports</h2><p>Record attendance by service, then export clean CSV reports.</p></article>
    </section>

    <section className="next">
      <h2>Setup checklist</h2>
      <ol>{starterSteps.map(([number, title, detail]) => <li key={number}><span>{number}</span><div><strong>{title}</strong><p>{detail}</p></div></li>)}</ol>
    </section>
  </main>
}
