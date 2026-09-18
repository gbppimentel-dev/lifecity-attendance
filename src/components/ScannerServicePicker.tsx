import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Check, ChevronDown, Search, X } from 'lucide-react'

type Service = { id: string; name: string; starts_at: string; location: string | null }
type Props = {
  services: Service[]; value: string; disabled: boolean; now: number
  onChange: (id: string) => void; formatDate: (date: string) => string
}

export default function ScannerServicePicker({ services, value, disabled, now, onChange, formatDate }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = services.find(service => service.id === value)
  const matches = services.filter(service => `${service.name} ${service.location ?? ''} ${formatDate(service.starts_at)}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))

  useEffect(() => {
    if (!open) return
    const element = dialog.current!
    element.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      element.close()
      document.body.style.overflow = overflow
      trigger.current?.focus({ preventScroll: true })
    }
  }, [open])
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])

  function choose(id: string) { onChange(id); setOpen(false) }
  return <>
    <button ref={trigger} type="button" className="lc-service-trigger" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setSearch(''); setOpen(true) }}>
      <CalendarDays size={21}/><span>{selected ? 'Change Service' : 'Choose a Service'}</span><ChevronDown size={18}/>
    </button>
    <dialog ref={dialog} className="lc-service-sheet" aria-labelledby="lc-service-sheet-title" onCancel={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setOpen(false) } }}>
      <header><div><p className="card-kicker">Check-In Service</p><h2 id="lc-service-sheet-title">Choose a Service</h2></div><button type="button" className="lc-service-close" aria-label="Close service picker" onClick={() => setOpen(false)} autoFocus><X size={20}/></button></header>
      <label className="lc-service-search"><Search size={18}/><input type="search" placeholder="Search services or locations" aria-label="Search check-in services" value={search} onChange={event => setSearch(event.target.value)}/></label>
      <p className="lc-service-count" role="status">{matches.length} service{matches.length === 1 ? '' : 's'} available</p>
      <div className="lc-service-options">
        {matches.map(service => <button type="button" key={service.id} className={'lc-service-option' + (service.id === value ? ' is-selected' : '')} aria-pressed={service.id === value} onClick={() => choose(service.id)}>
          <span><span className="lc-service-state">{Date.parse(service.starts_at) <= now ? 'In Progress' : 'Upcoming'}</span><strong>{service.name}</strong><small>{formatDate(service.starts_at)}</small>{service.location && <small>{service.location}</small>}</span>
          {service.id === value && <Check size={21} aria-label="Selected"/>}
        </button>)}
        {!matches.length && <p className="lc-service-empty">{services.length ? 'No matching services. Try another search.' : 'No upcoming or in-progress services are available.'}</p>}
      </div>
      {value && <button type="button" className="lc-service-clear" onClick={() => choose('')}>Clear Selection</button>}
    </dialog>
  </>
}
