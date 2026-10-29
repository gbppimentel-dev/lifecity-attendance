import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { motionEnabled } from '../lib/motion'
import './WorkspacePanel.css'

/** Retain a visited workspace without keeping it visible or keyboard-accessible. */
export default function WorkspacePanel({ active, children, label, id, labelledBy, retain = true, tabs = false }: {
  active: boolean
  children: ReactNode
  label?: string
  id?: string
  labelledBy?: string
  retain?: boolean
  tabs?: boolean
}) {
  const [visited, setVisited] = useState(active)
  const surface = useRef<HTMLDivElement>(null)
  // A render-time state adjustment prevents a first visit from committing an
  // empty wrapper, including when React abandons an interrupted transition.
  if (active && !visited) setVisited(true)

  useLayoutEffect(() => {
    const node = surface.current
    if (!active || !node || !motionEnabled() || typeof node.animate !== 'function') return
    // Opacity alone preserves the containing blocks used by fixed drawers,
    // calendar popovers and Scanner kiosk mode. The first frame stays readable.
    const entrance = node.animate([{ opacity: .64 }, { opacity: 1 }], {
      duration: 220, easing: 'cubic-bezier(.2,.75,.25,1)',
    })
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const settle = () => { if (!motionEnabled()) entrance.cancel() }
    window.addEventListener('lifecity-motion-change', settle)
    window.addEventListener('storage', settle)
    media.addEventListener('change', settle)
    return () => {
      entrance.cancel()
      window.removeEventListener('lifecity-motion-change', settle)
      window.removeEventListener('storage', settle)
      media.removeEventListener('change', settle)
    }
  }, [active, visited])

  if (!active && (!retain || !visited)) return null
  return <div ref={surface} id={id} className="lc-workspace-panel" data-lc-workspace-surface
    hidden={!active} aria-hidden={!active || undefined} role={tabs ? 'tabpanel' : label ? 'region' : undefined}
    aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy}>
    {children}
  </div>
}
