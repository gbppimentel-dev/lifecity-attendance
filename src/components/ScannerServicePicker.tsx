import { motionEnabled } from '../lib/motion'
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
  const animation = useRef<Animation | null>(null)
  const closing = useRef(false)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = services.find(service => service.id === value)
  const matches = services.filter(service => `${service.name} ${service.location ?? ''} ${formatDate(service.starts_at)}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))

  useEffect(() => {
    if (!open) return
    const element = dialog.current!
    element.showModal()
    closing.current=false
    if(motionEnabled()&&element.animate){
      animation.current=element.animate([{opacity:0,transform:'translateY(18px) scale(.98)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:240,easing:'cubic-bezier(.16,1,.3,1)'})
    }
    const media=matchMedia('(prefers-reduced-motion: reduce)')
    const stop=()=>{if(!motionEnabled())animation.current?.finish()}
    window.addEventListener('lifecity-motion-change',stop);window.addEventListener('storage',stop);media.addEventListener('change',stop)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      animation.current?.cancel();animation.current=null
      window.removeEventListener('lifecity-motion-change',stop);window.removeEventListener('storage',stop);media.removeEventListener('change',stop)
      element.close()
      document.body.style.overflow = overflow
      trigger.current?.focus({ preventScroll: true })
    }
  }, [open])
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])

  function closePicker() {
    if(closing.current)return
    closing.current=true
    const element=dialog.current
    animation.current?.cancel()
    if(!element||!motionEnabled()||!element.animate){setOpen(false);return}
    const run=element.animate([{opacity:1,transform:'translateY(0) scale(1)'},{opacity:0,transform:'translateY(10px) scale(.985)'}],{duration:160,easing:'ease-in',fill:'both'})
    animation.current=run
    void run.finished.then(()=>{if(animation.current===run)setOpen(false)}).catch(()=>{})
  }
  function choose(id: string) { onChange(id); closePicker() }
  return <>
    <style>{`
      body .lc-service-sheet label.lc-service-search {
        display: flex;
        flex-direction: row;
        align-items: center;
        flex-wrap: nowrap;
        gap: 10px;
        width: 100%;
        min-width: 0;
        min-height: 48px;
        margin: 20px 0 0;
        padding: 0 14px;
        box-sizing: border-box;
        border: 1px solid #cde0d9;
        border-radius: 12px;
        background: #fff;
        color: #718985;
      }
      body .lc-service-sheet label.lc-service-search > svg {
        position: static;
        display: block;
        flex: 0 0 18px;
        width: 18px;
        height: 18px;
        margin: 0;
        transform: none;
      }
      body .lc-service-sheet label.lc-service-search > input {
        display: block;
        flex: 1 1 0%;
        width: 0;
        min-width: 0;
        max-width: 100%;
        min-height: 48px;
        margin: 0;
        padding: 12px 0;
        box-sizing: border-box;
        border: 0;
        border-radius: 0;
        background: transparent;
        color: #315b53;
        font: inherit;
        font-size: 16px;
        font-weight: 400;
        line-height: 1.5;
        text-transform: none;
        box-shadow: none;
      }
      body .lc-service-sheet label.lc-service-search > input::placeholder {
        color: #879b96;
        opacity: 1;
        font-weight: 400;
      }
      body .lc-service-sheet label.lc-service-search:focus-within {
        outline: 2px solid #318d7e;
        outline-offset: 3px;
      }
      body .lc-service-sheet label.lc-service-search > input:focus {
        outline: none;
        box-shadow: none;
      }
    `}</style>
    <button ref={trigger} type="button" className="lc-service-trigger" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setSearch(''); setOpen(true) }}>
      <CalendarDays size={21}/><span>{selected ? 'Change Service' : 'Choose a Service'}</span><ChevronDown size={18}/>
    </button>
    <dialog ref={dialog} className="lc-service-sheet" aria-labelledby="lc-service-sheet-title" onCancel={event => {event.preventDefault();closePicker()}} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closePicker() } }}>
      <header><div><p className="card-kicker">Check-In Service</p><h2 id="lc-service-sheet-title">Choose a Service</h2></div><button type="button" className="lc-service-close" aria-label="Close service picker" onClick={closePicker} autoFocus><X size={20}/></button></header>
      <label className="lc-service-search"><Search size={18} aria-hidden="true"/><input type="search" placeholder="Search services or locations" aria-label="Search check-in services" value={search} onChange={event => setSearch(event.target.value)}/></label>
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
