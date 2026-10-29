import { useId } from 'react'
import { Plus, Layers3, Network, Shapes } from 'lucide-react'
import { techLogos } from '../lib/techLogos'
import './TechStackCore.css'

const core = [
  { key: 'react', role: 'Interface' },
  { key: 'supabase', role: 'Data & Identity' },
  { key: 'vercel', role: 'Delivery' },
] as const

export default function TechStackCore({ toolCount, layerCount }: { toolCount: number; layerCount: number }) {
  const captionId = useId()
  return <figure className="lc-stack-core-figure" aria-labelledby={captionId}>
    <figcaption id={captionId} className="lc-stack-core-caption"><Network size={13} aria-hidden="true"/>Built to Work Together<span aria-hidden="true"/></figcaption>
    <div className="lc-stack-core-track">
      <div className="lc-stack-core-links" aria-hidden="true"><Plus size={12}/><Plus size={12}/></div>
      <ol className="lc-stack-core-nodes" role="list">
        {core.map(({ key, role }) => <li key={key} data-brand={key}>
          <span className="lc-stack-core-tile"><img src={techLogos[key].src} alt="" width={30} height={30}/></span>
          <strong>{techLogos[key].name}</strong><span className="lc-stack-core-role">{role}</span>
        </li>)}
      </ol>
    </div>
    <dl className="lc-stack-core-metrics">
      <div><dt><Shapes size={12} aria-hidden="true"/>Tools & Capabilities</dt><dd>{toolCount}</dd></div>
      <div><dt><Layers3 size={12} aria-hidden="true"/>Connected Layers</dt><dd>{layerCount}</dd></div>
    </dl>
  </figure>
}
