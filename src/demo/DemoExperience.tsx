import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarDays, Check, ClipboardList, ExternalLink, FlaskConical, LayoutDashboard, LockKeyhole, RotateCcw, ScanQrCode, ShieldCheck, SlidersHorizontal, Sparkles, UserRound, UsersRound, X } from 'lucide-react'
import BorderGlow from '../components/BorderGlow'
import CommunityArt from '../components/CommunityArt'
import { resetAppliedAppearance } from '../lib/appearance'
import { useToast } from '../lib/toasts'
import { createDemoClient, getDemoRole, resetDemoData, setDemoRole } from './client'
import { originalSiteUrl } from './mode'
import './demo.css'

type DemoRole = 'owner' | 'admin' | 'member' | 'guest'
const enteredKey = 'lifecity-demo:entered'
const roles = [
  { value: 'owner', title: 'Owner', description: 'The complete workspace, including accounts and appearance.', Icon: ShieldCheck },
  { value: 'admin', title: 'Admin', description: 'Member management, services, check-in, and records.', Icon: LayoutDashboard },
  { value: 'member', title: 'Member', description: 'A personal profile, attendance QR, requests, and history.', Icon: UserRound },
  { value: 'guest', title: 'Guest', description: 'Public services and a preview of the church community.', Icon: UsersRound },
] as const

function wasEntered() {
  try { return sessionStorage.getItem(enteredKey) === 'true' } catch { return false }
}

function rememberEntered(value: boolean) {
  try { if (value) sessionStorage.setItem(enteredKey, 'true'); else sessionStorage.removeItem(enteredKey) } catch { /* The current tab still works without browser storage. */ }
}

/** This shell is mounted only for the isolated portfolio demo, around the real app. */
export default function DemoExperience({ children }: { children: ReactNode }) {
  const [entered, setEntered] = useState(wasEntered)
  const [role, setRole] = useState<DemoRole>(() => getDemoRole())
  const [generation, setGeneration] = useState(0)
  const [open, setOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const launcher = useRef<HTMLButtonElement>(null)
  const restart = useRef<HTMLButtonElement>(null)
  const id = useId()
  const toast = useToast()

  useEffect(() => {
    const { data: { subscription } } = createDemoClient().auth.onAuthStateChange(() => setRole(getDemoRole()))
    return () => { subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
    else if (!open && dialog.current?.open) dialog.current.close()
  }, [open])

  useEffect(() => {
    if (!open) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow }
  }, [open])

  useEffect(() => { if (confirmReset) restart.current?.focus() }, [confirmReset])

  function closeControls() {
    dialog.current?.close()
    setOpen(false)
    setConfirmReset(false)
    setError('')
    launcher.current?.focus({ preventScroll: true })
  }

  function showControls() {
    setRole(getDemoRole())
    setConfirmReset(false)
    setError('')
    setOpen(true)
  }

  async function explore(next: DemoRole, fromLanding = false) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      toast.clear()
      await setDemoRole(next)
      setRole(next)
      rememberEntered(true)
      setEntered(true)
      setGeneration(value => value + 1)
      if (!fromLanding) closeControls()
      setAnnouncement(`Demo opened as ${roles.find(item => item.value === next)?.title}.`)
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    } catch {
      setError('The demo could not open. Please try again.')
    } finally { setBusy(false) }
  }

  async function restartDemo() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      // Discard old Undo handlers before replacing this tab's sample records.
      toast.clear()
      await resetDemoData()
      await setDemoRole('owner')
      resetAppliedAppearance()
      setRole('owner')
      setGeneration(value => value + 1)
      closeControls()
      setAnnouncement('Demo restarted. Sample data restored.')
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    } catch {
      setError('The demo could not restart. Please try again.')
    } finally { setBusy(false) }
  }

  function showLanding() {
    toast.clear()
    closeControls()
    rememberEntered(false)
    setEntered(false)
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }

  if (!entered) return <main className="lcdemo-page">
    <a className="lcdemo-skip" href="#lcdemo-start">Skip to Demo</a>
    <header className="lcdemo-masthead">
      <a className="lcdemo-brand" href="/demo/" aria-label="LifeCity Attendance Demo Home"><span className="lcdemo-brand-mark" aria-hidden="true"><UsersRound size={24}/><i/><b/></span><span>LifeCity Attendance<small>Portfolio Demo</small></span></a>
      <a className="lcdemo-original-link" href={originalSiteUrl} target="_blank" rel="noopener noreferrer">Original Website<ArrowUpRight size={15} aria-hidden="true"/></a>
    </header>

    <BorderGlow as="section" className="lcdemo-hero" borderRadius={30} animated aria-labelledby="lcdemo-title">
      <div className="lcdemo-hero-copy" data-lc-reveal>
        <p className="lcdemo-eyebrow"><span aria-hidden="true"/>Interactive Portfolio Project</p>
        <h1 id="lcdemo-title">The complete app.<br/><em>Your own demo.</em></h1>
        <p className="lcdemo-intro">Explore LifeCity Attendance with fictional members, services, and check-ins. The same interface and features, ready to try.</p>
        <div className="lcdemo-demo-note"><FlaskConical size={18} aria-hidden="true"/><p>This is a showcase demo. Your changes stay in this browser tab and never affect the original website.</p></div>
        <div className="lcdemo-hero-actions" id="lcdemo-start">
          <button type="button" className="lcdemo-primary" onClick={() => void explore(role, true)} disabled={busy}><span>{busy ? 'Opening Demo…' : 'Explore the Demo'}</span><ArrowRight size={19} aria-hidden="true"/></button>
          <span className="lcdemo-no-login"><LockKeyhole size={14} aria-hidden="true"/>No account or personal sign-in required</span>
        </div>
        {error && <p className="lcdemo-error" role="alert">{error}</p>}
      </div>
      <div className="lcdemo-preview" aria-hidden="true" data-lc-reveal>
        <div className="lcdemo-preview-heading"><span><i/>LifeCity Workspace</span><span className="lcdemo-preview-badge">Demo</span></div>
        <div className="lcdemo-preview-nav"><span className="is-active"><LayoutDashboard size={13}/>Dashboard</span><span><UsersRound size={13}/>Members</span><span><CalendarDays size={13}/>Services</span></div>
        <div className="lcdemo-art"><CommunityArt/><span className="lcdemo-sticky lcdemo-sticky--top"><Sparkles size={15}/>All features included</span></div>
        <div className="lcdemo-preview-totals"><div><UsersRound size={17}/><strong>600</strong><span>Fictional Members</span></div><div><CalendarDays size={17}/><strong>Live</strong><span>Sample Services</span></div><div><ScanQrCode size={17}/><strong>QR</strong><span>Attendance Check-In</span></div></div>
        <div className="lcdemo-preview-footer"><Check size={14}/><span>Private sample data. Ready to explore.</span></div>
      </div>
    </BorderGlow>

    <section className="lcdemo-personas" aria-labelledby="lcdemo-roles-title" data-lc-reveal>
      <header className="lcdemo-section-heading"><div><p className="lcdemo-eyebrow">Four Ways to Explore</p><h2 id="lcdemo-roles-title">Choose your view.</h2></div><p>Start as Owner for the complete workspace. Switch views anytime with <strong>Demo Options</strong>.</p></header>
      <div className="lcdemo-role-grid" role="group" aria-label="Starting Demo View">
        {roles.map(({ value, title, description, Icon }) => <button key={value} type="button" className="lcdemo-role" aria-pressed={role === value} onClick={() => setRole(value)} disabled={busy}>
          <span className="lcdemo-role-icon" aria-hidden="true"><Icon size={21}/></span><span className="lcdemo-role-copy"><strong>{title}{value === 'owner' && <small>Full Access</small>}</strong><span>{description}</span></span><span className="lcdemo-role-check" aria-hidden="true">{role === value && <Check size={13}/>}</span>
        </button>)}
      </div>
    </section>

    <section className="lcdemo-features" aria-label="Included in the Demo" data-lc-reveal>
      <div><span className="lcdemo-feature-icon" aria-hidden="true"><UsersRound size={20}/></span><h3>Manage the Directory</h3><p>Add and edit members, organize churches and ministries, and export records.</p></div>
      <div><span className="lcdemo-feature-icon" aria-hidden="true"><ScanQrCode size={20}/></span><h3>Try the Check-In Flow</h3><p>Schedule services, open the scanner, or check in a sample member manually.</p></div>
      <div><span className="lcdemo-feature-icon" aria-hidden="true"><ClipboardList size={20}/></span><h3>Review the Results</h3><p>Explore attendance, member requests, feedback, and workspace settings.</p></div>
    </section>
    <footer className="lcdemo-footer"><p>LifeCity Attendance · Portfolio Showcase</p><a href={originalSiteUrl} target="_blank" rel="noopener noreferrer">Visit the Original Website<ExternalLink size={13} aria-hidden="true"/></a></footer>
  </main>

  return <>
    <Fragment key={generation}>{children}</Fragment>
    <p className="lcdemo-sr" role="status" aria-live="polite">{announcement}</p>
    <button ref={launcher} type="button" className="lcdemo-launcher" onClick={showControls} aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-controls`}><span className="lcdemo-launcher-dot" aria-hidden="true"/><FlaskConical size={16} aria-hidden="true"/><span>Demo Options</span><SlidersHorizontal size={13} aria-hidden="true"/></button>
    <dialog ref={dialog} id={`${id}-controls`} className="lcdemo-controls" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onClose={() => { setOpen(false); setConfirmReset(false) }} onCancel={event => { if (busy) event.preventDefault(); else closeControls() }} onClick={event => { if (busy || event.target !== event.currentTarget) return; const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeControls() }}>
      <header className="lcdemo-controls-heading"><div><p className="lcdemo-eyebrow">Portfolio Demo</p><h2 id={`${id}-title`}>Explore the App</h2></div><button type="button" className="lcdemo-close" aria-label="Close Demo Options" onClick={closeControls} disabled={busy} autoFocus><X size={19}/></button></header>
      <p id={`${id}-description`} className="lcdemo-controls-intro">Your changes are private to this tab. Switch views to try each part of the app.</p>
      <div className="lcdemo-control-roles" role="group" aria-label="Explore Demo As">
        {roles.map(({ value, title, description, Icon }) => <button key={value} type="button" className="lcdemo-role" aria-label={`Explore as ${title}`} aria-pressed={role === value} onClick={() => void explore(value)} disabled={busy}>
          <span className="lcdemo-role-icon" aria-hidden="true"><Icon size={19}/></span><span className="lcdemo-role-copy"><strong>{title}</strong><span>{description}</span></span><span className="lcdemo-role-check" aria-hidden="true">{role === value && <Check size={13}/>}</span>
        </button>)}
      </div>
      {error && <p className="lcdemo-error" role="alert">{error}</p>}
      <section className="lcdemo-reset" aria-label="Restart Demo">
        {!confirmReset ? <><div><RotateCcw size={17} aria-hidden="true"/><span><strong>Start Again</strong><small>Restore the fictional sample data.</small></span></div><button type="button" className="lcdemo-secondary" onClick={() => setConfirmReset(true)} disabled={busy}>Restart Demo</button></> : <div className="lcdemo-reset-confirm"><strong>Restart this demo?</strong><p>Your demo changes will be replaced with fresh sample data.</p><div><button type="button" className="lcdemo-secondary" onClick={() => setConfirmReset(false)} disabled={busy}>Keep Exploring</button><button ref={restart} type="button" className="lcdemo-primary" onClick={() => void restartDemo()} disabled={busy}>{busy ? 'Restarting…' : 'Restart Demo'}<RotateCcw size={15} aria-hidden="true"/></button></div></div>}
      </section>
      <footer className="lcdemo-controls-footer"><button type="button" onClick={showLanding} disabled={busy}><ArrowDownLeft size={15} aria-hidden="true"/>About This Demo</button><a href={originalSiteUrl} target="_blank" rel="noopener noreferrer">Original Website<ArrowUpRight size={15} aria-hidden="true"/></a></footer>
    </dialog>
  </>
}
