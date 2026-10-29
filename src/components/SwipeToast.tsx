// Adapted from the React Bits SwipeToast supplied for this project.
// Async actions stay available when they fail; pointer cancellation never dismisses.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { CircleAlert, LoaderCircle, Undo2, X } from 'lucide-react'
import './SwipeToast.css'

export type ToastCloseReason = 'timeout' | 'swipe' | 'action' | 'close' | 'escape' | 'programmatic'
export type ToastTone = 'success' | 'error' | 'info'
type Props = {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  actionLabel?: ReactNode
  onAction?: () => void | Promise<void>
  open?: boolean
  onClose?: (reason: ToastCloseReason) => void
  tone?: ToastTone
  duration?: number
  pauseOnHover?: boolean
  closeButton?: boolean
  dismissible?: boolean
  inline?: boolean
  width?: number
  radius?: number
  slideMs?: number
  settleBounce?: number
  swipeDistance?: number
  fuse?: 'bottom' | 'top' | 'none'
  background?: string
  color?: string
  fuseColor?: string
  className?: string
}
type Drag = { id: number; start: number; base: number; moved: boolean; history: [number, number][] }

export default function SwipeToast({
  title, description, icon, actionLabel, onAction, open = true, onClose, tone = 'success',
  duration = 5000, pauseOnHover = true, closeButton = true, dismissible = true,
  inline = false, width = 390, radius = 16, slideMs = 260, settleBounce = .15,
  swipeDistance = 40, fuse = 'bottom', background, color, fuseColor, className = '',
}: Props) {
  const card = useRef<HTMLDivElement>(null)
  const fuseElement = useRef<HTMLElement>(null)
  const fuseAnimation = useRef<Animation | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const drag = useRef<Drag | null>(null)
  const flags = useRef({ hover: false, focus: false, interacting: false, hidden: document.hidden, busy: false })
  const [phase, setPhase] = useState<'open' | 'closing' | 'gone'>('open')
  const phaseRef = useRef(phase)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [mounted, setMounted] = useState(false)
  const alive = useRef(true)
  const previousFocus = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const [appMotionOff, setAppMotionOff] = useState(() => document.documentElement.dataset.lcMotion === 'off')
  const reduce = useReducedMotion() || appMotionOff
  const latest = useRef({ onClose, onAction, reduce, slideMs, dismissible })
  latest.current = { onClose, onAction, reduce, slideMs, dismissible }
  const y = useMotionValue(0)

  const syncFuse = useCallback(() => {
    const animation = fuseAnimation.current
    if (!animation || animation.playState === 'finished') return
    if (Object.values(flags.current).some(Boolean)) animation.pause()
    else if (animation.playState === 'paused') animation.play()
  }, [])

  const close = useCallback((reason: ToastCloseReason) => {
    if (phaseRef.current !== 'open' || flags.current.busy) return
    phaseRef.current = 'closing'
    drag.current = null
    fuseAnimation.current?.pause()
    setPhase('closing')
    if (card.current?.contains(document.activeElement) && previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true })
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      if (!alive.current) return
      phaseRef.current = 'gone'
      setPhase('gone')
      latest.current.onClose?.(reason)
    }, latest.current.reduce || reason === 'escape' ? 0 : latest.current.slideMs)
  }, [])

  useEffect(() => {
    alive.current = true
    const frame = requestAnimationFrame(() => setMounted(true))
    const syncVisibility = () => { flags.current.hidden = document.hidden; syncFuse() }
    const observer = new MutationObserver(() => setAppMotionOff(document.documentElement.dataset.lcMotion === 'off'))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-lc-motion'] })
    document.addEventListener('visibilitychange', syncVisibility)
    return () => {
      alive.current = false
      cancelAnimationFrame(frame)
      clearTimeout(closeTimer.current)
      fuseAnimation.current?.cancel()
      observer.disconnect()
      document.removeEventListener('visibilitychange', syncVisibility)
      y.stop()
    }
  }, [syncFuse, y])

  useEffect(() => { if (!open) close('programmatic') }, [open, close])
  useEffect(() => {
    if (phase !== 'open' || duration <= 0 || actionError || !fuseElement.current) return
    const animation = fuseElement.current.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration, easing: 'linear', fill: 'forwards' })
    fuseAnimation.current = animation
    animation.onfinish = () => close('timeout')
    syncFuse()
    return () => { animation.onfinish = null; animation.cancel(); if (fuseAnimation.current === animation) fuseAnimation.current = null }
  }, [phase, duration, actionError, close, syncFuse])
  useEffect(() => { if (!pauseOnHover) { flags.current.hover = false; syncFuse() } }, [pauseOnHover, syncFuse])

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const current = drag.current
    if (!current || current.id !== event.pointerId) return
    drag.current = null
    flags.current.interacting = false
    if (card.current?.hasPointerCapture(event.pointerId)) card.current.releasePointerCapture(event.pointerId)
    const first = current.history[0], last = current.history.at(-1)
    const velocity = first && last && current.history.length > 1 && performance.now() - last[0] < 100 ? (last[1] - first[1]) / Math.max(1, last[0] - first[0]) : 0
    if (!cancelled && current.moved && y.get() > 0 && (velocity > .11 || (y.get() >= swipeDistance && velocity >= 0))) { close('swipe'); return }
    if (reduce) y.set(0)
    else animate(y, 0, { type: 'spring', duration: .35, bounce: settleBounce })
    syncFuse()
  }

  const runAction = async () => {
    if (flags.current.busy || phaseRef.current !== 'open' || !latest.current.onAction) return
    flags.current.busy = true
    setBusy(true)
    syncFuse()
    try {
      await latest.current.onAction()
      flags.current.busy = false
      if (!alive.current) return
      setBusy(false)
      close('action')
    } catch (error) {
      flags.current.busy = false
      if (!alive.current) return
      setBusy(false)
      setActionError(error instanceof Error ? error.message : 'Unable to undo. Please try again.')
      // Keep a failed Undo available until it succeeds or the user dismisses it.
      fuseAnimation.current?.cancel()
    }
  }

  if (phase === 'gone') return null
  return <div className={`swipe-toast${className ? ` ${className}` : ''}`} data-phase={phase}
    data-tone={actionError ? 'error' : tone} data-inline={inline} data-reduced={reduce || undefined}
    data-mounted={mounted} data-fuse={duration > 0 && !actionError ? fuse : 'none'} data-busy={busy || undefined}
    style={{ '--st-w': `${width}px`, '--st-radius': `${radius}px`, '--st-slide': `${slideMs}ms`,
      ...(background ? { '--st-bg': background } : {}), ...(color ? { '--st-ink': color } : {}), ...(fuseColor ? { '--st-fuse': fuseColor } : {}),
    } as CSSProperties}>
    <div className="swipe-toast__lift">
      <motion.div ref={card} className="swipe-toast__card" role={tone === 'error' || actionError ? 'alert' : 'status'} aria-atomic="true" tabIndex={0}
        aria-busy={busy} style={{ y }} data-dismissible={dismissible && !busy}
        onPointerDown={event => {
          if (!dismissible || flags.current.busy || phaseRef.current !== 'open' || drag.current || !event.isPrimary || event.button !== 0 || (event.target as Element).closest('button,a,input')) return
          y.stop()
          drag.current = { id: event.pointerId, start: event.clientY, base: y.get(), moved: false, history: [[performance.now(), y.get()]] }
          flags.current.interacting = true
          card.current?.setPointerCapture(event.pointerId)
          syncFuse()
        }}
        onPointerMove={event => {
          const current = drag.current
          if (!current || current.id !== event.pointerId) return
          const delta = event.clientY - current.start
          if (!current.moved && Math.abs(delta) < 4) return
          current.moved = true
          event.preventDefault()
          const raw = current.base + delta
          const next = raw >= 0 ? raw : raw * 24 * .55 / (24 + .55 * Math.abs(raw))
          y.set(next)
          current.history.push([performance.now(), next])
          if (current.history.length > 4) current.history.shift()
        }}
        onPointerUp={event => finishDrag(event)} onPointerCancel={event => finishDrag(event, true)} onLostPointerCapture={event => finishDrag(event, true)}
        onPointerEnter={event => { if (pauseOnHover && event.pointerType === 'mouse') { flags.current.hover = true; syncFuse() } }}
        onPointerLeave={event => { if (event.pointerType === 'mouse') { flags.current.hover = false; syncFuse() } }}
        onFocus={() => { flags.current.focus = true; syncFuse() }}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { flags.current.focus = false; syncFuse() } }}
        onKeyDown={event => { if (event.key === 'Escape' && dismissible && !busy) { event.preventDefault(); event.stopPropagation(); close('escape') } }}>
        {(icon || actionError) && <span className="swipe-toast__icon" aria-hidden="true">{actionError ? <CircleAlert /> : icon}</span>}
        <span className="swipe-toast__body"><span className="swipe-toast__title">{title}</span>
          {(description || actionError) && <span className="swipe-toast__desc">{actionError || description}</span>}
        </span>
        {actionLabel && onAction && <button type="button" className="swipe-toast__action" disabled={busy} onClick={() => void runAction()}>
          {busy ? <LoaderCircle size={15} className="swipe-toast__action-busy" aria-hidden="true" /> : actionLabel === 'Undo' ? <Undo2 size={15} aria-hidden="true" /> : null}
          <span>{busy ? 'Undoing…' : actionLabel}</span>
        </button>}
        {closeButton && <button type="button" className="swipe-toast__close" disabled={busy} aria-label="Dismiss notification" title="Dismiss notification" onClick={() => close('close')}><X size={16} aria-hidden="true" /></button>}
        <span className="swipe-toast__timer-track" aria-hidden="true"><i ref={fuseElement} className="swipe-toast__fuse" /></span>
      </motion.div>
    </div>
  </div>
}
