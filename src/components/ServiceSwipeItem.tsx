import { Archive, ArchiveRestore, Camera, Check, ChevronDown, Clock3, MapPin, Pencil, StickyNote, Trash2, UsersRound } from 'lucide-react'
import SwipeRow, { type SwipeAction } from './SwipeRow'
import './ServiceSwipeItem.css'

type Service = {
  id: string
  name: string
  starts_at: string
  location: string | null
  admin_note: string | null
  is_sunday_service: boolean
  archived_at: string | null
}

type Props = {
  service: Service
  state: { label: string; className: string }
  checkIns: number
  activeMembers: number
  selectedForScanner: boolean
  busy: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onSunday: () => void
  onEdit: () => void
  onRequestAction: (kind: 'delete' | 'archive' | 'restore') => void
}

const dateFormat = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
})
const monthFormat = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', month: 'short' })
const dayFormat = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', day: 'numeric' })
const weekdayFormat = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', weekday: 'short' })

export default function ServiceSwipeItem({
  service, state, checkIns, activeMembers, selectedForScanner, busy, open, onOpenChange,
  onSunday, onEdit, onRequestAction,
}: Props) {
  const canScan = state.className === 'upcoming' || state.className === 'in-progress'
  const actionKind = service.archived_at ? 'restore' : checkIns > 0 ? 'archive' : 'delete'
  const actions: SwipeAction[] = [
    { id: 'edit', label: 'Edit', icon: <Pencil size={19} />, title: `Edit ${service.name}`, onSelect: onEdit },
    {
      id: actionKind,
      label: actionKind === 'restore' ? 'Restore' : actionKind === 'archive' ? 'Archive' : 'Delete',
      icon: actionKind === 'restore' ? <ArchiveRestore size={20} /> : actionKind === 'archive' ? <Archive size={20} /> : <Trash2 size={20} />,
      onSelect: () => onRequestAction(actionKind),
    },
  ]
  const start = new Date(service.starts_at)
  const attendancePercent = activeMembers ? Math.round((checkIns / activeMembers) * 100) : 0

  return <SwipeRow
    label={service.name}
    actions={actions}
    open={open}
    onOpenChange={onOpenChange}
    disabled={busy}
    fullSwipe={false}
    actionWidth={76}
    className="lcsv-swipe"
  >
    <article className="lcsv-service-content" data-state={state.className} data-sunday={service.is_sunday_service || undefined}>
      <time className="lcsv-date" dateTime={service.starts_at} aria-label={dateFormat.format(start)}>
        <span className="lcsv-date-month">{monthFormat.format(start)}</span><strong>{dayFormat.format(start)}</strong><span className="lcsv-date-weekday">{weekdayFormat.format(start)}</span>
      </time>
      <div className="lcsv-main">
        <div className="lcsv-badges">
          <span className={`lcsv-state lcsv-state-${state.className}`}>{state.label}</span>
          {canScan && selectedForScanner && <span className="lcsv-selected-badge"><Camera size={11} aria-hidden="true"/>Scanner Selected</span>}
        </div>
        <h3 className="lcsv-title">{service.name}</h3>
        <div className="lcsv-meta"><span><Clock3 size={13} aria-hidden="true"/><time dateTime={service.starts_at}>{dateFormat.format(start)}</time></span>{service.location && <span><MapPin size={13} aria-hidden="true"/>{service.location}</span>}</div>
        {service.admin_note && <>
          <p className="lcsv-note lcsv-note-desktop"><StickyNote size={13} aria-hidden="true"/><span>{service.admin_note}</span></p>
          <details className="lcsv-note-mobile">
            <summary><StickyNote size={12} aria-hidden="true"/>Service Note<ChevronDown size={13} aria-hidden="true" /></summary>
            <p className="lcsv-note">{service.admin_note}</p>
          </details>
        </>}
      </div>
      <div className="lcsv-row-controls">
        <label className="lcsv-sunday-toggle" data-no-swipe data-checked={service.is_sunday_service || undefined}
          data-disabled={busy || undefined} title={`${service.is_sunday_service ? 'Unmark' : 'Mark'} ${service.name} as a Sunday service`}>
          <input type="checkbox" checked={service.is_sunday_service} disabled={busy} onChange={onSunday}
            aria-label={`Sunday service for ${service.name}`} aria-busy={busy}/>
          <span className="lcsv-sunday-track" aria-hidden="true"><span className="lcsv-sunday-thumb"><Check size={8} strokeWidth={3}/></span></span>
          <span className="lcsv-sunday-label">Sunday</span>
        </label>
        <div className="lcsv-attendance" aria-label={`${checkIns.toLocaleString()} check-ins${service.is_sunday_service ? `, ${attendancePercent}% of ${activeMembers.toLocaleString()} active members` : ''}`}>
          <div><UsersRound size={15} aria-hidden="true"/><strong>{checkIns.toLocaleString()}</strong></div>
          <span>Check-In{checkIns === 1 ? '' : 's'}</span>
          {service.is_sunday_service && <small>{attendancePercent}% of {activeMembers.toLocaleString()} Active</small>}
        </div>
      </div>
    </article>
  </SwipeRow>
}
