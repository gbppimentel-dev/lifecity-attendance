// Adapted from the React Bits RubberSegment supplied for LifeCity.
// Stretching edges are decorative; native buttons retain activation and focus.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import './RubberSegment.css'

export type RubberSegmentItem = {
  value: string
  label: ReactNode
  icon?: ReactNode
  disabled?: boolean
  id?: string
  controls?: string
}
type Props = {
  items: (string | RubberSegmentItem)[]
  value?: string
  defaultValue?: string
  onChange?: (value: string, index: number) => void
  onIntent?: (value: string) => void
  as?: 'nav' | 'div'
  variant?: 'navigation' | 'tabs' | 'group'
  ariaLabel?: string
  'aria-label'?: string
  size?: 'sm' | 'md' | 'lg'
  trackColor?: string
  thumbColor?: string
  textColor?: string
  activeTextColor?: string
  radius?: number
  inset?: number
  equalSlots?: boolean
  stretch?: number
  squash?: number
  speed?: number
  glide?: number
  draggable?: boolean
  disabled?: boolean
  className?: string
  style?: CSSProperties
}
type Slot = { l: number; r: number }
type Grip = { id: number; slot: number; x0: number; y0: number; onThumb: boolean; moved: boolean; offset: number; width: number; history: [number, number][] }
const PRESETS = { sm: { height: 32, font: 12, pad: 10 }, md: { height: 40, font: 13, pad: 13 }, lg: { height: 46, font: 14, pad: 14 } }
const EASE_OUT = [0.23, 1, 0.32, 1] as const
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
const rubber = (over: number, size: number) => over * size * .55 / (size + .55 * Math.abs(over))
const recentVelocity = (history: [number, number][]) => {
  const now = performance.now(), recent = history.filter(([time]) => now - time <= 100)
  if (recent.length < 2) return 0
  const first = recent[0], last = recent[recent.length - 1]
  return last[0] - first[0] >= 8 ? clamp((last[1] - first[1]) / (last[0] - first[0]) * 1000, -2000, 2000) : 0
}

export default function RubberSegment({
  items, value, defaultValue, onChange, onIntent, as: Container = 'div', variant = 'group',
  ariaLabel, 'aria-label': ariaLabelAttribute, size = 'md', trackColor, thumbColor,
  textColor, activeTextColor, radius = 14, inset = 3, equalSlots = false,
  stretch = 100, squash = 3, speed = 1, glide = 75, draggable = true,
  disabled = false, className = '', style,
}: Props) {
  const list = items.map(item => typeof item === 'string' ? { value: item, label: item } : item)
  const firstEnabled = list.findIndex(item => !item.disabled)
  const [inner, setInner] = useState(defaultValue ?? list[firstEnabled]?.value ?? '')
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [previewIndex, setPreviewIndex] = useState(-1)
  const [, renderInteraction] = useState(0)
  const current = value ?? inner
  const index = list.findIndex(item => item.value === current)
  const [appMotionOff, setAppMotionOff] = useState(() => document.documentElement.dataset.lcMotion === 'off')
  const reduced = useReducedMotion() || appMotionOff
  const root = useRef<HTMLElement>(null)
  const thumb = useRef<HTMLDivElement>(null)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const slots = useRef<Slot[]>([])
  const box = useRef<DOMRect | null>(null)
  const committed = useRef(index)
  const generation = useRef(0)
  const mounted = useRef(true)
  const handoff = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const grip = useRef<Grip | null>(null)
  const suppressClickUntil = useRef(0)
  const previewTarget = useRef(-1)
  const latest = useRef({ list, index, reduced, disabled, onChange, onIntent, value, speed, squash, glide })
  latest.current = { list, index, reduced, disabled, onChange, onIntent, value, speed, squash, glide }
  const left = useMotionValue(0), right = useMotionValue(0), innerWidth = useMotionValue(0)
  const previewLeft = useMotionValue(0), previewRight = useMotionValue(0), previewOpacity = useMotionValue(0)
  const thumbRadius = Math.max(0, radius - inset)
  const clipPath = useTransform(() => `inset(0 ${Math.max(0, innerWidth.get() - right.get())}px 0 ${Math.max(0, left.get())}px round ${thumbRadius}px)`)
  const previewClipPath = useTransform(() => `inset(0 ${Math.max(0, innerWidth.get() - previewRight.get())}px 0 ${Math.max(0, previewLeft.get())}px round ${thumbRadius}px)`)
  const listKey = list.map(item => `${item.value}:${item.disabled ? 1 : 0}`).join('|')
  const preset = PRESETS[size]
  const time = (seconds: number) => seconds / clamp(latest.current.speed, .25, 4)

  // A separate tint follows intent; the selected rubber thumb never changes on hover.
  const movePreview = (target: number, visible: boolean, immediate = false) => {
    const slot = slots.current[target]
    const show = visible && !!slot && !latest.current.disabled && !latest.current.list[target]?.disabled
    previewTarget.current = show ? target : -1
    setPreviewIndex(show ? target : -1)
    if (latest.current.reduced || immediate) {
      previewLeft.jump(slot?.l ?? 0); previewRight.jump(slot?.r ?? 0); previewOpacity.jump(show ? 1 : 0)
      return
    }
    const direction = Math.sign((slot?.l ?? 0) - previewLeft.get())
    if (slot) {
      animate(previewLeft, slot.l, { type: 'spring', duration: time(direction > 0 ? .4 : .32), bounce: .16 })
      animate(previewRight, slot.r, { type: 'spring', duration: time(direction > 0 ? .32 : .4), bounce: .16 })
    }
    animate(previewOpacity, show ? 1 : 0, { duration: time(show ? .14 : .22), ease: EASE_OUT })
  }
  const showPreview = (target: number) => { if (!grip.current) movePreview(target, true) }
  const clearPreview = (immediate = false) => {
    if (previewTarget.current < 0 && previewOpacity.get() === 0) return
    movePreview(latest.current.index, false, immediate)
  }

  const stop = () => {
    clearTimeout(handoff.current)
    generation.current++
    left.stop(); right.stop()
  }
  const jump = (target: number) => {
    stop()
    const slot = slots.current[target]
    if (!slot) { left.jump(0); right.jump(0); return }
    left.jump(slot.l); right.jump(slot.r)
  }
  const land = (target: number, velocity: number | null = null, flick = false, withSquash = true) => {
    if (!mounted.current) return
    const slot = slots.current[target]
    if (!slot) { jump(target); return }
    if (latest.current.reduced) { jump(target); return }
    const token = ++generation.current
    const direction = Math.sign(slot.l + slot.r - left.get() - right.get()) || 1
    const lead = direction > 0 ? right : left, trail = direction > 0 ? left : right
    const leadTo = direction > 0 ? slot.r : slot.l, trailTo = direction > 0 ? slot.l : slot.r
    const v = (motionValue: typeof left) => clamp(velocity ?? motionValue.getVelocity(), -2000, 2000)
    animate(lead, leadTo, { type: 'spring', duration: time(flick ? .4 : .3), bounce: flick ? .18 : 0, velocity: v(lead) })
    const overshoot = withSquash ? clamp(latest.current.squash, 0, 8) * direction : 0
    animate(trail, trailTo + overshoot, { type: 'spring', duration: time(.3), bounce: 0, velocity: v(trail) }).then(() => {
      if (generation.current === token && overshoot) animate(trail, trailTo, { type: 'spring', duration: time(.16), bounce: 0 })
    })
  }
  const travel = (from: number, target: number) => {
    stop()
    const before = slots.current[from], after = slots.current[target]
    if (!after || !before || latest.current.reduced) { jump(target); return }
    const amount = clamp(stretch, 0, 130) / 100
    animate(left, after.l + (Math.min(before.l, after.l) - after.l) * amount, { duration: time(.19), ease: EASE_OUT })
    animate(right, after.r + (Math.max(before.r, after.r) - after.r) * amount, { duration: time(.19), ease: EASE_OUT })
    handoff.current = setTimeout(() => land(target), time(.15) * 1000)
  }
  const commit = (target: number, animateSelection = true) => {
    const item = latest.current.list[target]
    if (!item || item.disabled || latest.current.disabled) return
    const before = committed.current
    committed.current = target
    if (animateSelection && before !== target) travel(before, target)
    if (item.value === current) return
    if (latest.current.value === undefined) setInner(item.value)
    renderInteraction(n => n + 1)
    latest.current.onChange?.(item.value, target)
  }
  const releaseCapture = (id: number, slot: number) => {
    const button = buttons.current[slot]
    if (button?.hasPointerCapture(id)) button.releasePointerCapture(id)
    button?.removeAttribute('data-pressed')
    root.current?.removeAttribute('data-held')
  }
  const cancelDrag = () => {
    const held = grip.current
    if (held) { grip.current = null; releaseCapture(held.id, held.slot); suppressClickUntil.current = performance.now() + 350 }
    jump(latest.current.index)
    clearPreview(true)
  }
  const measure = () => {
    const overlay = thumb.current
    if (!overlay) return
    box.current = overlay.getBoundingClientRect()
    slots.current = buttons.current.slice(0, latest.current.list.length).map(button => {
      const rect = button?.getBoundingClientRect()
      return rect ? { l: rect.left - box.current!.left, r: rect.right - box.current!.left } : { l: 0, r: 0 }
    })
    innerWidth.set(box.current.width)
    const previewSlot = slots.current[previewTarget.current >= 0 ? previewTarget.current : committed.current]
    previewLeft.jump(previewSlot?.l ?? 0); previewRight.jump(previewSlot?.r ?? 0)
    if (grip.current) cancelDrag()
    else jump(committed.current)
  }

  useLayoutEffect(() => {
    committed.current = index
    clearPreview(true)
    measure()
    const observer = new ResizeObserver(measure)
    if (root.current) observer.observe(root.current)
    buttons.current.forEach(button => { if (button) observer.observe(button) })
    let active = true
    void document.fonts?.ready.then(() => { if (active) measure() })
    return () => { active = false; observer.disconnect() }
    // Values changing independently should not replay the rubber animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, size, inset, equalSlots])
  useLayoutEffect(() => {
    if (committed.current !== index) {
      if (grip.current) cancelDrag()
      committed.current = index
      jump(index)
      clearPreview(true)
    }
  })
  useEffect(() => {
    const observer = new MutationObserver(() => setAppMotionOff(document.documentElement.dataset.lcMotion === 'off'))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-lc-motion'] })
    return () => observer.disconnect()
  }, [])
  useEffect(() => { if (reduced || disabled) cancelDrag() }, [reduced, disabled])
  useEffect(() => {
    mounted.current = true
    const cancel = () => { if (grip.current) cancelDrag(); clearPreview(true) }
    const hidden = () => { if (document.hidden) cancel() }
    window.addEventListener('blur', cancel)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      mounted.current = false
      window.removeEventListener('blur', cancel)
      document.removeEventListener('visibilitychange', hidden)
      grip.current = null
      stop()
      previewLeft.stop(); previewRight.stop(); previewOpacity.stop()
    }
  }, [])

  const finish = (event: ReactPointerEvent<HTMLElement>, cancelled = false) => {
    const held = grip.current
    if (!held || held.id !== event.pointerId) return
    grip.current = null
    releaseCapture(held.id, held.slot)
    if (!held.moved) {
      if (cancelled) suppressClickUntil.current = performance.now() + 350
      // A down event stops a spring; even a simple tap must finish settling it.
      land(committed.current, null, false, false)
      return
    }
    suppressClickUntil.current = performance.now() + 350
    if (cancelled) { land(committed.current, null, false, false); return }
    const velocity = recentVelocity(held.history)
    const decay = 1 - .1 * Math.pow(.05, clamp(latest.current.glide, 0, 100) / 100)
    const projection = latest.current.glide <= 0 ? 0 : (velocity / 1000) * decay / (1 - decay)
    const center = (left.get() + right.get()) / 2 + projection
    const enabled = latest.current.list.map((item, i) => item.disabled ? -1 : i).filter(i => i >= 0)
    let target = enabled.reduce((best, i) => Math.abs((slots.current[i].l + slots.current[i].r) / 2 - center) < Math.abs((slots.current[best].l + slots.current[best].r) / 2 - center) ? i : best, enabled[0] ?? -1)
    if (target < 0) { jump(committed.current); return }
    if (Math.abs(velocity) > 110 && target === committed.current) {
      const physical = enabled.slice().sort((a, b) => slots.current[a].l - slots.current[b].l)
      const position = physical.indexOf(committed.current)
      if (position >= 0) target = physical[clamp(position + Math.sign(velocity), 0, physical.length - 1)]
    }
    commit(target, false)
    land(target, velocity, Math.abs(velocity) > 110, Math.abs(velocity) > 110)
  }
  const key = (event: KeyboardEvent<HTMLButtonElement>, position: number) => {
    if (disabled) return
    const enabled = list.map((item, i) => item.disabled ? -1 : i).filter(i => i >= 0)
    const from = Math.max(0, enabled.indexOf(position))
    let target: number | undefined
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
    if (event.key === 'Home') target = enabled[0]
    else if (event.key === 'End') target = enabled[enabled.length - 1]
    else if (event.key === 'ArrowDown' || event.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) target = enabled[(from + 1) % enabled.length]
    else if (event.key === 'ArrowUp' || event.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) target = enabled[(from - 1 + enabled.length) % enabled.length]
    else if (event.key === 'Escape' && grip.current) { event.preventDefault(); cancelDrag(); return }
    if (target === undefined) return
    event.preventDefault()
    setFocusedIndex(target)
    buttons.current[target]?.focus()
    if (variant === 'group') commit(target)
  }
  const selectedTabStop = index >= 0 && !list[index]?.disabled ? index : firstEnabled
  const roving = variant === 'group' ? selectedTabStop : focusedIndex >= 0 && list[focusedIndex] && !list[focusedIndex].disabled ? focusedIndex : selectedTabStop
  const role = variant === 'tabs' ? 'tablist' : variant === 'group' ? 'radiogroup' : Container === 'nav' ? undefined : 'navigation'
  const variables = {
    '--rs-radius': `${radius}px`, '--rs-inset': `${inset}px`, '--rs-thumb-radius': `${thumbRadius}px`,
    '--rs-h': `${preset.height}px`, '--rs-font': `${preset.font}px`, '--rs-pad': `${preset.pad}px`,
    ...(trackColor ? { '--rs-track': trackColor } : {}), ...(thumbColor ? { '--rs-thumb': thumbColor } : {}),
    ...(textColor ? { '--rs-ink': textColor } : {}), ...(activeTextColor ? { '--rs-ink-active': activeTextColor } : {}),
    ...style,
  } as CSSProperties
  return <Container ref={element => { root.current = element }} role={role} aria-label={ariaLabel ?? ariaLabelAttribute ?? (variant === 'navigation' ? 'Workspace Navigation' : 'Segmented control')}
    aria-disabled={disabled || undefined} className={`rubber-segment${className ? ` ${className}` : ''}`}
    data-variant={variant} data-equal={equalSlots || undefined} data-draggable={draggable && !disabled || undefined} style={variables}
    onPointerLeave={() => { if (!grip.current) clearPreview() }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clearPreview() }}
    onPointerMove={event => {
      const held = grip.current
      if (!held || held.id !== event.pointerId || !held.onThumb) return
      const x = event.clientX - (box.current?.left ?? 0), dx = x - held.x0, dy = event.clientY - held.y0
      if (!held.moved) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { finish(event, true); return }
        if (Math.abs(dx) < 4 || Math.abs(dx) < Math.abs(dy)) return
        held.moved = true; held.offset = x - left.get(); held.width = right.get() - left.get()
        root.current?.setAttribute('data-held', '')
      }
      event.preventDefault()
      const raw = x - held.offset, max = Math.max(0, innerWidth.get() - held.width)
      const l = latest.current.reduced ? clamp(raw, 0, max) : raw < 0 ? rubber(raw, held.width) : raw > max ? max + rubber(raw - max, held.width) : raw
      left.set(l); right.set(l + held.width)
      held.history.push([performance.now(), x]); if (held.history.length > 8) held.history.shift()
    }}
    onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)}>
    {list.map((item, i) => <button key={item.value} ref={element => { buttons.current[i] = element }} type="button"
      id={item.id} aria-controls={item.controls} role={variant === 'tabs' ? 'tab' : variant === 'group' ? 'radio' : undefined}
      aria-current={variant === 'navigation' && i === index ? 'page' : undefined}
      aria-selected={variant === 'tabs' ? i === index : undefined} aria-checked={variant === 'group' ? i === index : undefined}
      tabIndex={variant === 'navigation' || i === roving ? 0 : -1} disabled={disabled || item.disabled}
      className={`rubber-segment__item${i === index ? ' is-current' : ''}${variant === 'navigation' && i === index ? ' nav-active' : ''}`}
      data-preview={i === previewIndex || undefined}
      onFocus={event => {
        setFocusedIndex(i)
        if (disabled || item.disabled) return
        latest.current.onIntent?.(item.value)
        if (event.currentTarget.matches(':focus-visible')) showPreview(i)
      }} onKeyDown={event => key(event, i)}
      onPointerEnter={event => {
        if (disabled || item.disabled) return
        latest.current.onIntent?.(item.value)
        if (event.pointerType !== 'touch') showPreview(i)
      }}
      onPointerDown={event => {
        if (disabled || item.disabled || !event.isPrimary || event.button !== 0 || grip.current) return
        latest.current.onIntent?.(item.value)
        clearPreview(true)
        box.current = thumb.current?.getBoundingClientRect() ?? null
        const x = event.clientX - (box.current?.left ?? 0)
        const onThumb = draggable && index >= 0 && x >= left.get() && x <= right.get()
        grip.current = { id: event.pointerId, slot: i, x0: x, y0: event.clientY, onThumb, moved: false, offset: 0, width: 0, history: [[performance.now(), x]] }
        event.currentTarget.setPointerCapture(event.pointerId)
        if (onThumb) stop()
        else if (!reduced) event.currentTarget.setAttribute('data-pressed', '')
      }}
      onClick={event => {
        if (performance.now() < suppressClickUntil.current) { suppressClickUntil.current = 0; event.preventDefault(); event.stopPropagation(); return }
        commit(i)
      }}>
      {item.icon && <span className="rubber-segment__icon" aria-hidden="true">{item.icon}</span>}<span>{item.label}</span>
    </button>)}
    <motion.div className="rubber-segment__hover" aria-hidden="true" style={{ clipPath: previewClipPath, opacity: previewOpacity }} />
    <motion.div ref={thumb} className="rubber-segment__thumb" aria-hidden="true" style={{ clipPath, opacity: index < 0 ? 0 : 1 }}>
      {list.map((item, i) => <span key={item.value} className="rubber-segment__item rubber-segment__copy" data-preview={i === previewIndex || undefined}>
        {item.icon && <span className="rubber-segment__icon">{item.icon}</span>}<span>{item.label}</span>
      </span>)}
    </motion.div>
  </Container>
}
