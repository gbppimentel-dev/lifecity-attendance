import { useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Github, Layers, ArrowDown } from 'lucide-react'
import { techStack } from '../lib/techStack'
import { createPortal } from 'react-dom'
import { techLogos, type TechLogoKey } from '../lib/techLogos'

function Logo({name}:{name:TechLogoKey}) {
 const logo=techLogos[name]
 return <img src={logo.src} alt={logo.name} width={32} height={32} title={logo.name}/>
}

export default function TechStackPage({onClose}:{onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null)
 const [selected,setSelected]=useState(0)
 const detail=useRef<HTMLElement>(null)
 const item=techStack[selected]
 function selectTechnology(index:number){
  setSelected(index)
  if(window.matchMedia('(max-width: 760px)').matches)requestAnimationFrame(()=>{detail.current?.scrollIntoView({block:'start',behavior:'instant'});detail.current?.focus({preventScroll:true})})
 }
 useLayoutEffect(()=>{
  const node=dialog.current,previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow
  const padding=document.body.style.paddingRight,gap=window.innerWidth-document.documentElement.clientWidth
  if(gap>0)document.body.style.paddingRight=`${parseFloat(getComputedStyle(document.body).paddingRight)+gap}px`
  document.body.style.overflow='hidden';node?.showModal()
  return()=>{node?.close();document.body.style.overflow=overflow;document.body.style.paddingRight=padding;previous?.focus({preventScroll:true})}
 },[])
 return createPortal(<dialog ref={dialog} className="lc-tech-page" onClick={e=>e.stopPropagation()} aria-labelledby="lc-tech-title" onCancel={e=>{e.preventDefault();onClose()}}>
  <div className="lc-tech-inner">
   <header className="lc-tech-top"><button autoFocus className="lc-tech-back" onClick={onClose}><ArrowLeft size={16}/>Back</button><span>LifeCity Attendance <span className="lc-tech-top-divider">/</span> Under the Hood</span><a href="https://github.com/gbppimentel-dev/lifecity-attendance" target="_blank" rel="noopener noreferrer" className="lc-tech-source"><Github size={16}/><span>Source Code</span><ArrowUpRight size={14}/><span className="lcf-sr-only"> (opens in a new tab)</span></a></header>
   <section className="lc-tech-heading"><div><span className="lc-tech-eyebrow">THE WEB APPLICATION</span><h1 id="lc-tech-title">Tech Stack<span>.</span></h1><p>Select a tool. See what it does.</p></div><div className="lc-tech-emblem" aria-hidden="true"><Layers size={54}/><span>BUILD / CONNECT / DELIVER</span></div></section>
   <div className="lc-tech-workspace">
    <section id="lc-tech-index" className="lc-tech-index" aria-label="Technologies"><div className="lc-tech-index-heading"><span>Technology Index</span><span>{techStack.length} tools &amp; capabilities</span></div><div className="lc-tech-list">{techStack.map((technology,index)=><button key={technology.name} className="lc-tech-entry" aria-pressed={selected===index} aria-controls="lc-tech-detail" onClick={()=>selectTechnology(index)}><span className="lc-tech-mark">{technology.logos?.length?technology.logos.map(name=><Logo key={name} name={name}/>):<span>{technology.mark}</span>}</span><span className="lc-tech-entry-copy"><strong>{technology.name}</strong><small>{technology.purpose}</small></span><ArrowUpRight size={15} aria-hidden="true"/></button>)}</div></section>
    <section id="lc-tech-detail" ref={detail} tabIndex={-1} className="lc-tech-inspector" aria-label={`${item.name} details`}>
     <button className="lc-tech-return" onClick={()=>{const button=dialog.current?.querySelector<HTMLButtonElement>('.lc-tech-entry[aria-pressed="true"]');button?.scrollIntoView({block:"center",behavior:"instant"});button?.focus({preventScroll:true})}}><ArrowLeft size={14}/>Technology Index</button><div key={item.name} className="lc-tech-inspector-content"><div className="lc-tech-inspector-top"><span>TOOL {String(selected+1).padStart(2,'0')}</span><span className="lc-tech-large-logo">{item.logos?.length?item.logos.map(name=><Logo key={name} name={name}/>):item.mark}</span></div><h2>{item.name}</h2><p className="lc-tech-inspector-purpose">{item.purpose}</p><div className="lc-tech-explanation"><h3>What It Does</h3><p>{item.about}</p><h3>How We Use It</h3><p>{item.description}</p></div><div className="lc-tech-path"><span className="lc-tech-path-label">IN PRACTICE</span><ol>{item.flow.map((step,index)=><li key={step}><span className="lc-tech-step-number">0{index+1}</span><span>{step}</span>{index<2&&<ArrowDown size={13} aria-hidden="true"/>}</li>)}</ol></div></div>
    </section>
   </div>
   <footer className="lc-tech-end"><span>LifeCity Attendance · Web Edition</span><small>Logos belong to their respective owners. Platform marks represent browser capabilities.</small></footer>
  </div>
 </dialog>,document.body)
}
