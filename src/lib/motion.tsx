import { useEffect, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import AnimatedContent, { animateContent, type AnimatedContentHandle } from '../components/AnimatedContent'

const KEY = 'lifecity-motion-enabled'
const EVENT = 'lifecity-motion-change'
const preference = () => { try { return localStorage.getItem(KEY) !== 'off' } catch { return true } }
export function motionEnabled() {
  return (document.documentElement.dataset.lcMotion ? document.documentElement.dataset.lcMotion === 'on' : preference()) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
export function changeWithMotion(update: () => void) {
  if (!motionEnabled()) { update(); return }
  // Commit immediately; the shared runtime reveals newly mounted sections.
  // The header, focus, and page controls never wait for an outgoing animation.
  flushSync(update)
}

/** Panels mount immediately, with a small entrance fade and no delayed close. */
export function MotionPresence({show,children,motionKey}:{show:boolean;children:ReactNode;motionKey?:string}) {
  return show ? <AnimatedContent key={motionKey} trigger="mount" distance={0} duration={.2} initialOpacity={.9}
    className="lc-motion-presence lc-static-panel">{children}</AnimatedContent> : null
}

function applyMotion() {
  const enabled = motionEnabled()
  document.documentElement.dataset.lcMotion = enabled ? 'on' : 'off'
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
      <p>Smooth section reveals as you browse, gentle panel entrances, interactive Dashboard cards, and moving gradient borders. Navigation responds immediately and panels close instantly.</p>
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
    let frame = 0
    let enabled = sessionPreference && !media.matches
    let pruneRemoved = false
    const tracked = new WeakSet<HTMLElement>()
    const pendingRoots = new Set<HTMLElement>()
    const hidden = new Set<HTMLElement>()
    const awaitingScroll = new Set<HTMLElement>()
    const animations = new Map<HTMLElement, AnimatedContentHandle>()
    // Reveal meaningful content groups, never individual rows, live camera
    // frames, particles, or controls. Existing group content is not rescanned.
    const selector = [
      '.dashboard-editorial-hero', '.active-checkin-panel', '.dashboard-stats', '.dashboard-grid',
      '.members-editorial-hero', '.services-editorial-hero', '.scanner-editorial-hero',
      '.records-page-heading', '.directory-card', '.records-card', '.scanner-event-picker', '.lc-scanner-idle',
      '.form-card', '.directory-tools-workspace', '.ministry-manager-card', '.csv-import-card', '.manual-checkin-card', '.member-editor-card',
      '.lca-hero', '.lca-panel', '.lct-panel', '.lch-panel', '.lcf-inbox', '.lc-motion-settings',
      '.lcr-panel', '.lpe-owner-panel', '.lpe-editor', '.lmh-panel', '.lc-whats-new',
      '.lc-auth-story', '.lc-auth-frame', '.lcg-hero', '.lcg-services', '.lcg-connect',
      '.lmp-hero', '.lmp-grid', '.lmp-services',
      '.lcd-head', '.lcd-toolbar', '.lcd-actions', '.lcd-live', '.lcd-metrics', '.lcd-focus', '.lcd-news',
      '[data-lc-reveal]'
    ].join(',')
    const root = document.getElementById('root')
    if (!root) return
    function start(element: HTMLElement) {
      if (!enabled || !element.isConnected || element.closest('[hidden],[aria-hidden="true"]')) return
      // A cohesive fade leaves the page readable from its first frame.
      // No delay, layout wrapper, transform, or per-section ScrollTrigger.
      const handle = animateContent(element, {
        trigger: 'mount', once: true, distance: 0,
        duration: .22, initialOpacity: .9, ease: 'power2.out',
      })
      animations.set(element, handle)
      void handle.finished.then(() => { if (animations.get(element) === handle) animations.delete(element) })
    }
    // One native observer waits for all below-fold sections. GSAP is created
    // only when a section enters view; fetched lists do not create dormant
    // timelines or scroll listeners for the rest of the document.
    const scrollObserver = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return
        const element = entry.target as HTMLElement
        scrollObserver?.unobserve(element); awaitingScroll.delete(element)
        start(element)
      })
    }, { threshold: 0, rootMargin: '0px 0px -20px 0px' })
    function flush() {
      frame = 0
      if (pruneRemoved) {
        pruneRemoved = false
        animations.forEach((handle, element) => { if (!element.isConnected) { handle.destroy(); animations.delete(element) } })
        awaitingScroll.forEach(element => { if (!element.isConnected) { scrollObserver?.unobserve(element); awaitingScroll.delete(element) } })
        hidden.forEach(element => { if (!element.isConnected) hidden.delete(element) })
      }
      const candidates = new Set<HTMLElement>()
      pendingRoots.forEach(subtree => {
        if (!subtree.isConnected) return
        if (subtree.matches(selector)) candidates.add(subtree)
        subtree.querySelectorAll<HTMLElement>(selector).forEach(element => candidates.add(element))
      })
      pendingRoots.clear()
      const visible: HTMLElement[] = [], belowFold: HTMLElement[] = []
      candidates.forEach(element => {
        if (tracked.has(element) || element.closest('.lc-motion-presence,[data-animated-content]') || element.parentElement?.closest(selector)) return
        if (element.closest('[hidden],[aria-hidden="true"]')) { hidden.add(element); return }
        // Live camera/QR and fixed popups keep their existing exact geometry.
        if (element.querySelector('video,canvas,.scanner-reader,.lmp-code')) { tracked.add(element); return }
        if (!enabled) { tracked.add(element); hidden.delete(element); return }
        // Finish all layout reads before any GSAP writes. The former
        // interleaved loop forced layout again for every successive group.
        const rect = element.getBoundingClientRect()
        if (!rect.width && !rect.height) { hidden.add(element); return }
        tracked.add(element); hidden.delete(element)
        if (rect.top < innerHeight && rect.bottom > 0) visible.push(element)
        else belowFold.push(element)
      })
      visible.forEach(start)
      belowFold.forEach(element => {
        if (!scrollObserver) return // Content stays visible without this API.
        awaitingScroll.add(element); scrollObserver.observe(element)
      })
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(flush) }
    function enqueue(subtree: HTMLElement) {
      // Insertions inside a group (table rows, counts, form controls) never
      // require another document scan or a repeated entrance.
      if (subtree.parentElement?.closest(selector)) return
      for (const queued of pendingRoots) if (queued.contains(subtree)) return
      pendingRoots.forEach(queued => { if (subtree.contains(queued)) pendingRoots.delete(queued) })
      pendingRoots.add(subtree); schedule()
    }
    const observer = new MutationObserver(records => {
      records.forEach(record => {
        if (record.type === 'attributes') {
          const element = record.target as HTMLElement
          if (!element.hidden && element.getAttribute('aria-hidden') !== 'true') enqueue(element)
          return
        }
        record.addedNodes.forEach(node => { if (node instanceof HTMLElement) enqueue(node) })
        if ((animations.size || awaitingScroll.size || hidden.size) &&
          Array.from(record.removedNodes).some(node => node instanceof HTMLElement)) { pruneRemoved = true; schedule() }
      })
    })
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden'] })
    function resized() {
      // IntersectionObserver handles visible sections itself. Only groups
      // previously hidden by responsive CSS need reconsideration on resize.
      hidden.forEach(enqueue)
    }
    function sync(event?: Event) {
      if (event instanceof CustomEvent && typeof event.detail === 'boolean') sessionPreference = event.detail
      else if (event?.type === 'storage') sessionPreference = preference()
      enabled = sessionPreference && !media.matches
      document.documentElement.dataset.lcMotion = enabled ? 'on' : 'off'
      if (!enabled) {
        animations.forEach(handle => handle.settle()); animations.clear()
        scrollObserver?.disconnect(); awaitingScroll.clear()
      }
    }
    sync()
    enqueue(root)
    window.addEventListener(EVENT,sync); window.addEventListener('storage',sync)
    window.addEventListener('resize',resized)
    media.addEventListener('change',sync)
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame)
      scrollObserver?.disconnect(); awaitingScroll.clear(); pendingRoots.clear(); hidden.clear()
      animations.forEach(handle => handle.destroy()); animations.clear()
      window.removeEventListener(EVENT,sync); window.removeEventListener('storage',sync)
      window.removeEventListener('resize',resized); media.removeEventListener('change',sync)
    }
  }, [])
  return null
}
