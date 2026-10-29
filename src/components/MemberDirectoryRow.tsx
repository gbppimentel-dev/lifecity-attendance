import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, Eye, LoaderCircle, MoreHorizontal, Pencil, ScanQrCode, Star, StickyNote, X } from 'lucide-react'
import './MemberDirectoryRow.css'

export type MemberSummary = {
  id: string
  first_name: string
  last_name: string
  member_number: string
  email: string | null
  mobile: string | null
  status: 'active' | 'inactive'
  is_starred: boolean
  admin_note: string | null
}

type Props = {
  member: MemberSummary
  ministryNames: string[]
  churchNames: string[]
  bulkMode: boolean
  selected: boolean
  statusBusy: boolean
  disabled?: boolean
  onSelect: () => void
  onView: () => void
  onQr: () => void
  onEdit: () => void
  onStar: () => void
  onNote: () => void
  onToggleStatus: () => void
}

type Position = { top: number; left: number; maxHeight: number }

function Affiliations({ names, label, className }: { names: string[]; label: string; className: string }) {
  if (!names.length) return null
  const shown = names.slice(0, 2).join(', ')
  const remaining = names.length - 2
  return <span className={className} title={`${label}: ${names.join(', ')}`}>
    <span aria-hidden="true">{shown}{remaining > 0 && <small> +{remaining}</small>}</span>
    <span className="lc-member-row__sr">{label}: {names.join(', ')}</span>
  </span>
}

/** A compact directory entry; secondary profile tools live in one action menu. */
export default function MemberDirectoryRow({ member, ministryNames, churchNames, bulkMode, selected,
  statusBusy, disabled = false, onSelect, onView, onQr, onEdit, onStar, onNote, onToggleStatus }: Props) {
  const name = `${member.first_name} ${member.last_name}`.trim()
  const initials = `${member.first_name[0] ?? ''}${member.last_name[0] ?? ''}`
  const active = member.status === 'active'
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<Position | null>(null)
  const firstFocus = useRef(0)
  const actions = [
    { label: 'View Profile', icon: Eye, run: onView },
    { label: 'Edit Profile', icon: Pencil, run: onEdit },
  ]

  function close(restoreFocus = false) {
    setOpen(false)
    if (restoreFocus) trigger.current?.focus({ preventScroll: true })
  }

  function show(last = false) {
    if (disabled || statusBusy) return
    firstFocus.current = last ? actions.length - 1 : 0
    setPosition(null)
    setOpen(true)
  }

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const anchor = trigger.current
      if (!anchor?.isConnected) { close(); return }
      const rect = anchor.getBoundingClientRect()
      const viewport = window.visualViewport
      const edgeX = viewport?.offsetLeft ?? 0, edgeY = viewport?.offsetTop ?? 0
      const width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight
      if (rect.bottom < edgeY || rect.top > edgeY + height) { close(); return }
      const gap = 7, margin = 10, popupWidth = Math.min(210, width - margin * 2)
      const popup = menu.current
      const popupStyle = popup ? getComputedStyle(popup) : null
      // scrollHeight includes padding but excludes borders. Constraining a
      // border-box to that value clipped two pixels and created a scrollbar.
      const desired = popup ? Math.ceil(popup.scrollHeight
        + (parseFloat(popupStyle?.borderTopWidth ?? '0') || 0)
        + (parseFloat(popupStyle?.borderBottomWidth ?? '0') || 0)) : actions.length * 39 + 48
      const below = edgeY + height - rect.bottom - gap - margin, above = rect.top - edgeY - gap - margin
      const up = below < desired && above > below
      const maxHeight = Math.max(44, Math.min(desired, up ? above : below, height - margin * 2))
      setPosition({ left: Math.max(edgeX + margin, Math.min(rect.right - popupWidth, edgeX + width - popupWidth - margin)),
        top: up ? Math.max(edgeY + margin, rect.top - gap - maxHeight) : rect.bottom + gap, maxHeight })
    }
    place()
    const frame = requestAnimationFrame(() => items.current[firstFocus.current]?.focus({ preventScroll: true }))
    const reposition = (event: Event) => { if (!(event.target instanceof Node) || !menu.current?.contains(event.target)) place() }
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) close()
    }
    const focusOutside = (event: FocusEvent) => {
      const target = event.target as Node
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) close()
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('focusin', focusOutside)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    window.visualViewport?.addEventListener('resize', reposition)
    window.visualViewport?.addEventListener('scroll', reposition)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('focusin', focusOutside)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      window.visualViewport?.removeEventListener('resize', reposition)
      window.visualViewport?.removeEventListener('scroll', reposition)
    }
  }, [open, actions.length])

  useEffect(() => { if (disabled || statusBusy) close() }, [disabled, statusBusy])

  function menuKey(event: KeyboardEvent<HTMLDivElement>) {
    const at = items.current.indexOf(document.activeElement as HTMLButtonElement)
    let next = at
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return }
    if (event.key === 'Tab') { close(true); return }
    if (event.key === 'ArrowDown') next = (at + 1) % actions.length
    else if (event.key === 'ArrowUp') next = (at - 1 + actions.length) % actions.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = actions.length - 1
    else return
    event.preventDefault()
    items.current[next]?.focus()
  }

  return <article className="lc-member-row" data-selected={selected || undefined} data-inactive={!active || undefined}>
    {bulkMode && <label className="lc-member-row__select">
      <input type="checkbox" checked={selected} disabled={disabled} onChange={onSelect} aria-label={`Select ${name}`}/>
    </label>}
    <div className="lc-member-row__identity">
      <span className="lc-member-row__avatar" aria-hidden="true">{initials}</span>
      <div className="lc-member-row__person">
        <div className="lc-member-row__name-line">
          <button type="button" className="lc-member-row__star-button" disabled={disabled} onClick={onStar}
            data-starred={member.is_starred || undefined} aria-pressed={member.is_starred}
            aria-label={member.is_starred ? `Remove star from ${name}` : `Star ${name}`}
            title={member.is_starred ? 'Remove Star' : 'Star Member'}>
            <Star size={16} fill={member.is_starred ? 'currentColor' : 'none'} aria-hidden="true"/>
          </button>
          <button type="button" className="lc-member-row__name" disabled={disabled} onClick={onView}>{name}</button>
          {member.admin_note?.trim() && <button type="button" className="lc-member-row__note-button" disabled={disabled} onClick={onNote}
            aria-label={`View private note for ${name}`} title="View Private Note"><StickyNote size={15} aria-hidden="true"/></button>}
        </div>
        <span className="lc-member-row__number">{member.member_number}{member.is_starred && <span className="lc-member-row__sr"> · Starred member</span>}</span>
        {(member.email || member.mobile) && <span className="lc-member-row__contact" title={member.email || member.mobile || undefined}>{member.email || member.mobile}</span>}
      </div>
    </div>
    <div className="lc-member-row__community">
      <Affiliations names={churchNames} label="Churches" className="lc-member-row__churches"/>
      <Affiliations names={ministryNames} label="Ministries" className="lc-member-row__ministries"/>
      {!churchNames.length && !ministryNames.length && <span className="lc-member-row__unassigned">No affiliations yet</span>}
    </div>
    {/* Circular status interaction adapted from Javierrocadev on Uiverse.io. */}
    <label className="lc-member-row__status" data-active={active || undefined}
      data-disabled={disabled || statusBusy || undefined} data-busy={statusBusy || undefined}
      title={statusBusy ? 'Saving status…' : `${active ? 'Active' : 'Inactive'} · Set ${name} to ${active ? 'inactive' : 'active'}`}>
      <input className="lc-member-row__status-input" type="checkbox" checked={active}
        aria-label={`Active status for ${name}`} aria-busy={statusBusy}
        aria-describedby={`${id}-status-help`} disabled={disabled || statusBusy} onChange={onToggleStatus}/>
      <span className="lc-member-row__status-ring" aria-hidden="true">
        <span className="lc-member-row__status-mark">
          {statusBusy ? <LoaderCircle className="lc-member-row__saving" size={12}/> : active ? <Check size={13} strokeWidth={2.5}/> : <X size={12} strokeWidth={2.5}/>}
        </span>
      </span>
      <span className="lc-member-row__sr" id={`${id}-status-help`}>
        {statusBusy ? 'Saving status.' : `${active ? 'Active' : 'Inactive'}. Change to ${active ? 'inactive' : 'active'}.`}
      </span>
    </label>
    <div className="lc-member-row__more">
      <button type="button" className="lc-member-row__qr-button" disabled={disabled || statusBusy} onClick={onQr}
        aria-label={`Open QR and member ID for ${name}`} title="Member QR & ID"><span className="lc-member-row__qr-glyph" aria-hidden="true"><ScanQrCode size={20} strokeWidth={1.7}/></span></button>
      <button ref={trigger} type="button" className="lc-member-row__menu-trigger" aria-label={`More actions for ${name}`}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? `${id}-menu` : undefined}
        disabled={disabled || statusBusy} onClick={() => open ? close() : show()}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(event.key === 'ArrowUp') }
          if (event.key === 'Escape' && open) { event.preventDefault(); close(true) }
        }}><MoreHorizontal size={20} aria-hidden="true"/></button>
    </div>
    {open && createPortal(<div ref={menu} id={`${id}-menu`} role="menu" aria-label={`Actions for ${name}`}
      className="lc-member-menu" style={{ left: position?.left ?? 0, top: position?.top ?? 0,
        maxHeight: position?.maxHeight ?? 300, visibility: position ? 'visible' : 'hidden' }} onKeyDown={menuKey}>
      <span className="lc-member-menu__heading" aria-hidden="true">Member Tools</span>
      {actions.map((action, index) => <button key={action.label} ref={node => { items.current[index] = node }} type="button" role="menuitem"
        className="lc-member-menu__item" onClick={() => { close(true); action.run() }}>
        <action.icon size={16} aria-hidden="true"/><span>{action.label}</span>
      </button>)}
    </div>, document.body)}
  </article>
}
