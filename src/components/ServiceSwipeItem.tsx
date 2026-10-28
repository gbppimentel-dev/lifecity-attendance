import { Archive, ArchiveRestore, CalendarCheck, Camera, ChevronDown, Pencil, Trash2 } from 'lucide-react'
import SwipeRow, { type SwipeAction } from './SwipeRow'

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
  onScanner: () => void
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
  onScanner, onSunday, onEdit, onRequestAction,
}: Props) {
  const canScan = state.className === 'upcoming' || state.className === 'in-progress'
  const actionKind = service.archived_at ? 'restore' : checkIns > 0 ? 'archive' : 'delete'
  const actions: SwipeAction[] = [
    {
      id: 'scanner', label: canScan ? 'Scanner' : 'Scanner closed', icon: <Camera size={20} />,
      disabled: !canScan,
      title: canScan ? `Open scanner for ${service.name}` : 'Check-in is available for upcoming and in-progress services.',
      onSelect: onScanner,
    },
    {
      id: 'sunday', label: service.is_sunday_service ? 'Sunday on' : 'Mark Sunday',
      icon: <CalendarCheck size={20} />, pressed: service.is_sunday_service,
      title: `${service.is_sunday_service ? 'Unmark' : 'Mark'} ${service.name} as a Sunday service`,
      onSelect: onSunday,
    },
    { id: 'edit', label: 'Edit', icon: <Pencil size={19} />, title: `Edit ${service.name}`, onSelect: onEdit },
    {
      id: actionKind,
      label: actionKind === 'restore' ? 'Restore' : actionKind === 'archive' ? 'Archive' : 'Delete',
      icon: actionKind === 'restore' ? <ArchiveRestore size={20} /> : actionKind === 'archive' ? <Archive size={20} /> : <Trash2 size={20} />,
      onSelect: () => onRequestAction(actionKind),
    },
  ]
  const start = new Date(service.starts_at)

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
    <article className="lcsv-service-content">
      <time className="lcsv-date" dateTime={service.starts_at} aria-label={dateFormat.format(start)}>
        <span>{monthFormat.format(start)}</span><strong>{dayFormat.format(start)}</strong><span>{weekdayFormat.format(start)}</span>
      </time>
      <div className="lcsv-main">
        <div className="lcsv-badges">
          <span className={`lcsv-state lcsv-state-${state.className}`}>{state.label}</span>
          {service.is_sunday_service && <span className="lcsv-sunday-badge">Sunday</span>}
          {canScan && selectedForScanner && <span className="lcsv-selected-badge">Selected for scanner</span>}
        </div>
        <h3 className="lcsv-title">{service.name}</h3>
        <p className="lcsv-meta">{dateFormat.format(start)}{service.location ? ` · ${service.location}` : ''}</p>
        <p className="lcsv-attendance">{service.is_sunday_service
          ? `${checkIns} / ${activeMembers} · ${activeMembers ? Math.round((checkIns / activeMembers) * 100) : 0}%`
          : `${checkIns} Check-In${checkIns === 1 ? '' : 's'}`}</p>
        {service.admin_note && <>
          <p className="lcsv-note lcsv-note-desktop"><span>Note</span>{service.admin_note}</p>
          <details className="lcsv-note-mobile">
            <summary>View note<ChevronDown size={13} aria-hidden="true" /></summary>
            <p className="lcsv-note">{service.admin_note}</p>
          </details>
        </>}
      </div>
    </article>
  </SwipeRow>
}
