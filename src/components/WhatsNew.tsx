import { Sparkles, History } from 'lucide-react'
import { getReleaseNotes, type ReleaseAudience } from '../lib/releaseNotes'
export default function WhatsNew({audience}:{audience:ReleaseAudience}){
 const [latest,...history]=getReleaseNotes(audience)
 if(!latest)return null
 return <section className="lc-whats-new" aria-label="What’s New in LifeCity Attendance">
  <header><div><p className="eyebrow">LifeCity Attendance · {audience==='user'?'Member':audience==='admin'?'Administrator':audience==='owner'?'Owner':'Guest'} Updates</p><h2><Sparkles size={22}/>What’s New</h2></div><span className="lcf-ticket-status reviewing">Pre-Launch · Before v1.0</span></header>
  <p className="lc-release-stage">We’re refining the web experience. Phone UI polishing comes next, ahead of the v1.0 launch.</p>
  <article><small>{latest.version}</small><h3>{latest.title}</h3><ul>{latest.highlights.map(text=><li key={text}>{text}</li>)}</ul></article>
  <details><summary><History size={17}/>Version History</summary><p className="lc-release-stage">Earlier work is grouped into development milestones; these are not numbered releases.</p>{history.map(item=><article key={item.version}><small>{item.version}</small><h3>{item.title}</h3><ul>{item.highlights.map(text=><li key={text}>{text}</li>)}</ul></article>)}</details>
 </section>
}
