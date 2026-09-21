import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Code2, Database, Camera, Sparkles, Search, Github, Layers } from 'lucide-react'
import { techGroups, techStack, type TechGroup } from '../lib/techStack'
import '../tech-stack.css'

export default function TechStackPage({onClose}:{onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null)
 const [query,setQuery]=useState(''),[group,setGroup]=useState<TechGroup|'All'>('All')
 useEffect(()=>{
  const node=dialog.current,previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow
  node?.showModal();document.body.style.overflow='hidden'
  return()=>{node?.close();document.body.style.overflow=overflow;previous?.focus()}
 },[])
 const matches=techStack.filter(item=>(group==='All'||item.group===group)&&`${item.name} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase()))
 return <dialog ref={dialog} className="lc-tech-page" aria-labelledby="lc-tech-title" onCancel={e=>{e.preventDefault();onClose()}}>
  <div className="lc-tech-inner">
   <header className="lc-tech-top"><button autoFocus className="lc-tech-back" onClick={onClose}><ArrowLeft size={17}/>Back to the App</button><span>LifeCity Attendance</span></header>
   <section className="lc-tech-hero"><div><p className="lc-tech-kicker">Small Pieces. Shared Purpose.</p><h1 id="lc-tech-title">Built for Every Gathering.</h1><p>The tools that turn a scan into a welcome, a record into a report, and a little idea into a better app.</p><span className="lc-tech-count">{techStack.length} Technologies &amp; Capabilities · Web Edition</span></div><div className="lc-tech-art" aria-hidden="true"><span><Code2 size={36}/></span><span><Database size={27}/></span><span><Camera size={26}/></span><Sparkles size={25}/></div></section>
   <div className="lc-tech-controls"><label className="lc-tech-search"><Search size={18}/><input aria-label="Search Technologies" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a tool or capability…"/></label><nav aria-label="Technology Categories">{(['All',...techGroups] as const).map(name=><button key={name} aria-pressed={group===name} onClick={()=>setGroup(name)}>{name}</button>)}</nav></div>
   <p className="lc-tech-results" role="status">{matches.length} of {techStack.length} shown</p>
   <div className="lc-tech-groups">{techGroups.map(category=>{const items=matches.filter(item=>item.group===category);return items.length>0&&<section key={category}><h2><Layers size={18}/>{category}</h2><div className="lc-tech-cards">{items.map(item=><article key={item.name}><span className="lc-tech-mark" aria-hidden="true">{item.mark}</span><div><h3>{item.name}</h3><p>{item.description}</p></div></article>)}</div></section>})}</div>
   {!matches.length&&<div className="lc-tech-empty"><Search size={28}/><h2>No Tools Found</h2><p>Try another word or explore all categories.</p><button className="lc-tech-back" onClick={()=>{setQuery('');setGroup('All')}}>Show Everything</button></div>}
   <footer className="lc-tech-end"><Code2 size={23}/><h2>Still Growing, Thoughtfully.</h2><p>This inventory reflects the current web build. Mobile-specific tools will be added here when they become part of the project.</p><a href="https://github.com/gbppimentel-dev/lifecity-attendance" target="_blank" rel="noopener noreferrer"><Github size={17}/>Explore the Source<span className="lcf-sr-only"> (opens in a new tab)</span></a><small>Technology names belong to their respective owners. Badges here are interface labels, not official brand logos.</small></footer>
  </div>
 </dialog>
}
