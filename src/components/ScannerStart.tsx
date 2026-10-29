import { useId } from 'react'
import { ArrowUpRight, Clock3, MapPin, QrCode, ScanLine } from 'lucide-react'
import './ScannerStart.css'

type Service = { id: string; name: string; starts_at: string; location: string | null }
type Props = {
  services: Service[]
  counts: Record<string, number>
  now: number
  loading: boolean
  onSelect: (id: string) => void
}

const monthFormat = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', month: 'short' })
const dayFormat = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', day: 'numeric' })
const scheduleFormat = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', hour: 'numeric', minute: '2-digit' })

export default function ScannerStart({ services, counts, now, loading, onSelect }: Props) {
  const id = useId()
  const available = services.filter(service => Number.isFinite(Date.parse(service.starts_at)))
    .sort((a, b) => Number(Date.parse(a.starts_at) > now) - Number(Date.parse(b.starts_at) > now) || Date.parse(a.starts_at) - Date.parse(b.starts_at))
  const visible = available.slice(0, 3)

  return <section className="lc-scanner-start" aria-labelledby={`${id}-title`} aria-busy={loading}>
    <div className="lc-scanner-start__services">
      <header><div><h2 id={`${id}-title`}>Available Services</h2><p>Select a service to open the scanner.</p></div>
        <span>{loading ? 'Loading…' : `${available.length} Available`}</span>
      </header>
      {loading ? <div className="lc-scanner-start__cards" role="status" aria-label="Loading Services">{[0, 1, 2].map(index => <div key={index} className="lc-scanner-start__skeleton" aria-hidden="true"><i/><i/><i/></div>)}</div>
        : visible.length ? <div className="lc-scanner-start__cards">{visible.map(service => {
          const start = new Date(service.starts_at), live = start.getTime() <= now
          const count = counts[service.id] ?? 0
          return <button type="button" className="lc-scanner-start__service" data-live={live || undefined} key={service.id} onClick={() => onSelect(service.id)} aria-label={`Select ${service.name} for Check-In`}>
            <div className="lc-scanner-start__service-top"><time dateTime={service.starts_at}><span>{monthFormat.format(start)}</span><strong>{dayFormat.format(start)}</strong></time><span className="lc-scanner-start__state"><i/>{live ? 'In Progress' : 'Upcoming'}</span></div>
            <strong className="lc-scanner-start__name">{service.name}</strong>
            <span className="lc-scanner-start__meta"><Clock3 size={12} aria-hidden="true"/>{scheduleFormat.format(start)}</span>
            {service.location && <span className="lc-scanner-start__meta"><MapPin size={12} aria-hidden="true"/>{service.location}</span>}
            <span className="lc-scanner-start__service-bottom"><span>{count.toLocaleString()} Check-In{count === 1 ? '' : 's'}</span><ArrowUpRight size={16} aria-hidden="true"/></span>
          </button>
        })}</div> : <div className="lc-scanner-start__empty"><ScanLine size={24} aria-hidden="true"/><div><h3>No Available Services</h3><p>Create or update an upcoming service to begin check-in.</p></div></div>}
      {!loading && available.length > visible.length && <p className="lc-scanner-start__more">Showing the next {visible.length} of {available.length} services.</p>}
    </div>
    <aside className="lc-scanner-start__guide" aria-labelledby={`${id}-guide`}>
      <div className="lc-scanner-start__qr" aria-hidden="true"><i/><i/><i/><i/><QrCode size={65} strokeWidth={1.5}/></div>
      <h3 id={`${id}-guide`}>QR Check-In</h3><p>Place the member QR inside the camera guide and hold it still.</p>
      <span>No QR? Use Manual Check-In after selecting a service.</span>
    </aside>
  </section>
}
