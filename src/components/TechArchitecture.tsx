import { useId } from 'react'
import { Camera, CloudUpload, Database, Layers, ScanQrCode } from 'lucide-react'
import type { TechGroup } from '../lib/techStack'
import './TechArchitecture.css'

type Props = {
  activeGroup: TechGroup | null
  onExploreGroup: (group: TechGroup) => void
}

/** The connections describe responsibilities, rather than a deployment pipeline. */
export default function TechArchitecture({ activeGroup, onExploreGroup }: Props) {
  const id = useId()
  const arrowId = `${id}-arrow`
  const card = (group: TechGroup, title: string, copy: string, Icon: typeof Camera, tone: string, central = false) => (
    <button type="button" className={`lc-stack-map__card is-${tone}${central ? ' is-central' : ''}`}
      aria-pressed={activeGroup === group} onClick={() => onExploreGroup(group)}
      aria-label={`Explore ${group}. ${title}. ${copy}`}>
      <span className="lc-stack-map__icon" aria-hidden="true"><Icon size={central ? 25 : 18}/></span>
      <span className="lc-stack-map__copy"><span className="lc-stack-map__group">{group}</span><strong>{title}</strong><span>{copy}</span></span>
    </button>
  )

  return <section className="lc-stack-map" aria-labelledby={`${id}-title`} aria-describedby={`${id}-connections`}>
    <header className="lc-stack-map__heading"><div><h2 id={`${id}-title`}>How the App Fits Together</h2><p>Five connected layers behind every LifeCity workspace.</p></div><span>Select a layer to explore its tools</span></header>
    <p className="lc-stack-map__sr" id={`${id}-connections`}>Build and delivery serves the interface. Browser tools connect device features to the interface. The interface exchanges records with the backend and presents QR tools and reports.</p>
    <div className="lc-stack-map__board">
      <svg className="lc-stack-map__connections" viewBox="0 0 1000 140" preserveAspectRatio="none" aria-hidden="true">
        <defs><marker id={arrowId} viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1 6 4 1 7"/></marker></defs>
        <path d="M282 33 H298 Q307 33 307 44 V59 Q307 70 316 70" markerEnd={`url(#${arrowId})`}/>
        <path d="M282 107 H298 Q307 107 307 96 V81 Q307 70 316 70" markerEnd={`url(#${arrowId})`}/>
        <path d="M630 70 H637 Q646 70 646 59 V44 Q646 33 657 33 H659" markerStart={`url(#${arrowId})`} markerEnd={`url(#${arrowId})`}/>
        <path d="M630 70 H637 Q646 70 646 81 V96 Q646 107 657 107 H659" markerEnd={`url(#${arrowId})`}/>
      </svg>
      <div className="lc-stack-map__support">
        {card('Build & Delivery', 'From Source to Site', 'Vite builds the app; Vercel serves it.', CloudUpload, 'amber')}
        {card('Browser Tools', 'Connected to the Device', 'Camera, sound, storage, and device features.', Camera, 'lavender')}
      </div>
      {card('Interface', 'LifeCity in the Browser', 'React, typed components, and shared styles bring every page together.', Layers, 'teal', true)}
      <div className="lc-stack-map__services">
        {card('Data & Identity', 'Accounts & Stored Records', 'Supabase Auth, PostgreSQL, and access policies.', Database, 'lavender')}
        {card('QR & Reports', 'Check-In & Takeaways', 'QR scanning, member IDs, and CSV files.', ScanQrCode, 'teal')}
      </div>
    </div>
  </section>
}
