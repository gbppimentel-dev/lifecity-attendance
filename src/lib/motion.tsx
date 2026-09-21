import { useEffect, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

const KEY = 'lifecity-motion-enabled'
const EVENT = 'lifecity-motion-change'
const preference = () => { try { return localStorage.getItem(KEY) !== 'off' } catch { return true } }
export function motionEnabled() {
  return (document.documentElement.dataset.lcMotion ? document.documentElement.dataset.lcMotion === 'on' : preference()) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
let currentTransition: { skipTransition: () => void } | null = null
export function changeWithMotion(update: () => void) {
  currentTransition?.skipTransition()
  if (!motionEnabled()) { update(); return }
  // Animate the actual page, not a whole-window screenshot. Works without View Transitions.
  const oldPage = document.querySelector<HTMLElement>('.lc-mobile-workspace > .content')
  if (!oldPage?.animate) { update(); return }
  let committed = false
  let animation: Animation | null = null
  const previousInert = oldPage.inert
  const transition = { skipTransition: () => commit(false) }
  function commit(animateNext: boolean) {
    animation?.cancel()
    if (committed) { if (currentTransition === transition) currentTransition = null; return }
    committed = true
    oldPage!.inert = previousInert
    flushSync(update)
    const newPage = document.querySelector<HTMLElement>('.lc-mobile-workspace > .content')
    if (animateNext && motionEnabled() && newPage?.animate) {
      animation = newPage.animate([{opacity:0,translate:'0 16px'},{opacity:1,translate:'0 0'}],{duration:340,easing:'cubic-bezier(.16,1,.3,1)'})
      void animation.finished.catch(()=>{}).finally(()=>{if(currentTransition===transition)currentTransition=null})
    } else if (currentTransition === transition) currentTransition = null
  }
  currentTransition = transition
  oldPage.inert = true
  animation = oldPage.animate([{opacity:1,translate:'0 0'},{opacity:0,translate:'0 -8px'}],{duration:140,easing:'ease-out',fill:'forwards'})
  void animation.finished.then(()=>commit(true)).catch(()=>{})
}

/** Keep a closing panel mounted until its real height/opacity transition finishes. */
// Forms and tool panels now mount/unmount immediately. Keep this component so
// existing call sites need no changes and the general card observer skips them.
export function MotionPresence({show,children}:{show:boolean;children:ReactNode;motionKey?:string}) {
  return show ? <div className="lc-motion-presence lc-static-panel">{children}</div> : null
}

function applyMotion() {
  const enabled = motionEnabled()
  document.documentElement.dataset.lcMotion = enabled ? 'on' : 'off'
  if (!enabled) currentTransition?.skipTransition()
}
// Apply before the first React render to prevent motion flashing on refresh.
applyMotion()

export function MotionSettings() {
  const [enabled, setEnabled] = useState(preference)
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [stored, setStored] = useState(true)
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const sync = (event: Event) => { if (event instanceof CustomEvent && typeof event.detail === 'boolean') setEnabled(event.detail); else if (event.type === 'storage') setEnabled(preference()); setReduced(media.matches) }
    window.addEventListener('storage', sync)
    window.addEventListener(EVENT, sync)
    media.addEventListener('change', sync)
    return () => { window.removeEventListener('storage', sync); window.removeEventListener(EVENT, sync); media.removeEventListener('change', sync) }
  }, [])
  return <section className="lc-motion-settings" aria-labelledby="lc-motion-title">
    <div><p className="eyebrow">Motion & Performance</p><h2 id="lc-motion-title">Interface Animations</h2>
      <p>Page transitions, decorative card effects, export-bar motion, and mouse-click ripples. Forms open and close instantly.</p>
      <small>Applies immediately on this browser. Turn off for less motion and smoother performance.</small>
    </div>
    <label className="lc-motion-toggle"><input type="checkbox" checked={enabled} onChange={event => {
      const value = event.target.checked
      setEnabled(value)
      try { localStorage.setItem(KEY, value ? 'on' : 'off'); setStored(true) } catch { setStored(false) }
      document.documentElement.dataset.lcMotion = value && !reduced ? 'on' : 'off'
      // Dispatch the chosen value too, so blocking browser storage does not prevent this-session control.
      window.dispatchEvent(new CustomEvent(EVENT, { detail: value }))
    }}/><span>Enable Animations</span></label>
    {reduced && <p className="lc-motion-note" role="status">Your device requests reduced motion, so animations are currently off.</p>}
    {!stored && <p className="lc-motion-note" role="status">Applied for this session. Your browser could not save this preference.</p>}
  </section>
}

export function MotionRuntime() {
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    let sessionPreference = preference()
    let observer: MutationObserver | null = null
    let resize: ResizeObserver | null = null
    const animations = new Set<Animation>()
    const ghosts = new Set<HTMLElement>()
    const tracked = new Map<HTMLElement, { left: number; top: number; width: number; height: number }>()
    const selector = '.dashboard-stat-card,.dashboard-card,.event-postcard,.service-list-item,.member-card,.lpe-review-card,.lcr-request,.lc-service-option,.scan-result,.lcse-choice'
    const root = document.getElementById('root')!
    function animate(element: HTMLElement, frames: Keyframe[], duration: number, done?: () => void) {
      if (!element.animate) { done?.(); return }
      const animation = element.animate(frames, { duration, easing: 'cubic-bezier(.2,.7,.2,1)' })
      animations.add(animation)
      void animation.finished.catch(() => {}).finally(() => { animations.delete(animation); done?.() })
    }
    function measure(element: HTMLElement) {
      const rect = element.getBoundingClientRect()
      if (rect.width && rect.height) tracked.set(element, {left:rect.left+scrollX,top:rect.top+scrollY,width:rect.width,height:rect.height})
    }
    function register(element: HTMLElement, entering: boolean) {
      if (tracked.has(element) || element.closest('[aria-hidden="true"],.lc-motion-presence') || element.querySelector('video,canvas')) return
      measure(element); resize?.observe(element)
      const rect = element.getBoundingClientRect()
      if (entering && rect.bottom > 0 && rect.top < innerHeight && rect.width) {
        animate(element, [{opacity:0,translate:'0 8px'},{opacity:1,translate:'0 0'}], 220)
      }
    }
    function stop() {
      observer?.disconnect(); observer = null
      resize?.disconnect(); resize = null
      animations.forEach(animation => animation.cancel()); animations.clear()
      ghosts.forEach(ghost => ghost.remove()); ghosts.clear(); tracked.clear()
    }
    function start() {
      stop()
      if (document.documentElement.dataset.lcMotion !== 'on') return
      resize = new ResizeObserver(entries => entries.forEach(entry => measure(entry.target as HTMLElement)))
      root.querySelectorAll<HTMLElement>(selector).forEach(element => register(element, false))
      observer = new MutationObserver(records => {
        // Animate only a bounded number per update; data tables may contain hundreds of rows.
        let budget = 12
        const additions = new Set<HTMLElement>()
        records.forEach(record => record.addedNodes.forEach(node => {
          if (!(node instanceof HTMLElement) || node.classList.contains('lc-click-ripple')) return
          if (node.matches(selector)) additions.add(node)
          node.querySelectorAll<HTMLElement>(selector).forEach(element => additions.add(element))
        }))
        // Forms mount/unmount immediately through static MotionPresence.
        // Do not clone removed cards: duplicate snapshots can flash over a closing form.
        tracked.forEach((_rect, element) => {
          if (!element.isConnected) { tracked.delete(element); resize?.unobserve(element) }
        })
        additions.forEach(element => { if (element.isConnected) register(element, budget-- > 0 && !currentTransition) })
      })
      observer.observe(root,{childList:true,subtree:true})
    }
    function sync(event?: Event) {
      if (event instanceof CustomEvent && typeof event.detail === 'boolean') sessionPreference = event.detail
      else if (event?.type === 'storage') sessionPreference = preference()
      const enabled = sessionPreference && !media.matches
      document.documentElement.dataset.lcMotion = enabled ? 'on' : 'off'
      if (!enabled) currentTransition?.skipTransition()
      start()
    }
    function click(event: MouseEvent) {
      if (document.documentElement.dataset.lcMotion !== 'on' || event.button !== 0 || event.detail === 0 || !matchMedia('(pointer:fine)').matches || ghosts.size >= 8) return
      const target = event.target as Element
      if (target.closest('input,textarea,select,[contenteditable="true"],:disabled')) return
      const ripple = document.createElement('span')
      ripple.className = 'lc-click-ripple'; ripple.setAttribute('aria-hidden','true')
      ripple.style.left = `${event.clientX}px`; ripple.style.top = `${event.clientY}px`
      // Render inside a modal/fullscreen element when present so the effect stays visible.
      ;(target.closest('dialog[open]') ?? document.fullscreenElement ?? document.body).appendChild(ripple)
      ghosts.add(ripple)
      animate(ripple,[{opacity:.5,transform:'translate(-50%,-50%) scale(.25)'},{opacity:0,transform:'translate(-50%,-50%) scale(1.5)'}],320,()=>{ripple.remove();ghosts.delete(ripple)})
    }
    sync()
    window.addEventListener(EVENT,sync); window.addEventListener('storage',sync)
    media.addEventListener('change',sync); document.addEventListener('click',click)
    return () => { stop();window.removeEventListener(EVENT,sync);window.removeEventListener('storage',sync);media.removeEventListener('change',sync);document.removeEventListener('click',click) }
  }, [])
  return null
}
