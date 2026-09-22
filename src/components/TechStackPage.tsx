import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Github, Layers, ArrowDown, ChevronLeft, ChevronRight, X } from 'lucide-react'
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
 const sheet=useRef<HTMLDialogElement>(null)
 const [isMobile,setIsMobile]=useState(()=>window.matchMedia('(max-width:760px)').matches)
 const [page,setPage]=useState(0)
 const pageSize=9
 const pageCount=Math.ceil(techStack.length/pageSize)
 useEffect(()=>{
  const media=window.matchMedia('(max-width:760px)')
  const update=()=>{setIsMobile(media.matches);if(!media.matches)sheet.current?.close()}
  media.addEventListener('change',update)
  return()=>media.removeEventListener('change',update)
 },[])
 function closeSheet(){sheet.current?.close()}
 function changePage(next:number){setPage(next)}
 const item=techStack[selected]
 function selectTechnology(index:number){
  setSelected(index)
  if(isMobile&&sheet.current){sheet.current.showModal();sheet.current.scrollTop=0}
 }
 useLayoutEffect(()=>{
  const node=dialog.current,previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow
  const padding=document.body.style.paddingRight,gap=window.innerWidth-document.documentElement.clientWidth
  if(gap>0)document.body.style.paddingRight=`${parseFloat(getComputedStyle(document.body).paddingRight)+gap}px`
  document.body.style.overflow='hidden';node?.showModal()
  return()=>{node?.close();document.body.style.overflow=overflow;document.body.style.paddingRight=padding;previous?.focus({preventScroll:true})}
 },[])
 const toolContent=(<div key={item.name} className="lc-tech-inspector-content"><div className="lc-tech-inspector-top"><span>TOOL {String(selected+1).padStart(2,'0')}</span><span className="lc-tech-large-logo">{item.logos?.length?item.logos.map(name=><Logo key={name} name={name}/>):item.mark}</span></div><h2>{item.name}</h2><p className="lc-tech-inspector-purpose">{item.purpose}</p><div className="lc-tech-explanation"><h3>What It Does</h3><p>{item.about}</p><h3>How We Use It</h3><p>{item.description}</p></div><div className="lc-tech-path"><span className="lc-tech-path-label">IN PRACTICE</span><ol>{item.flow.map((step,index)=><li key={step}><span className="lc-tech-step-number">0{index+1}</span><span>{step}</span>{index<2&&<ArrowDown size={13} aria-hidden="true"/>}</li>)}</ol></div></div>)
 return createPortal(<dialog ref={dialog} className="lc-tech-page" onClick={e=>e.stopPropagation()} aria-labelledby="lc-tech-title" onCancel={e=>{if(e.target===e.currentTarget){e.preventDefault();onClose()}}}>
  <div className="lc-tech-inner">
   <header className="lc-tech-top"><button autoFocus className="lc-tech-back" onClick={onClose}><ArrowLeft size={16}/>Back</button><span>LifeCity Attendance <span className="lc-tech-top-divider">/</span> Under the Hood</span><a href="https://github.com/gbppimentel-dev/lifecity-attendance" target="_blank" rel="noopener noreferrer" className="lc-tech-source"><Github size={16}/><span>Source Code</span><ArrowUpRight size={14}/><span className="lcf-sr-only"> (opens in a new tab)</span></a></header>
   <section className="lc-tech-heading"><div><span className="lc-tech-eyebrow">THE WEB APPLICATION</span><h1 id="lc-tech-title">Tech Stack<span>.</span></h1><p>Select a tool. See what it does.</p></div><div className="lc-tech-emblem" aria-hidden="true"><Layers size={54}/><span>BUILD / CONNECT / DELIVER</span></div></section>
   <div className="lc-tech-workspace">
    <section id="lc-tech-index" className="lc-tech-index" aria-label="Technologies"><div className="lc-tech-index-heading"><span>Technology Index</span><span>{techStack.length} tools &amp; capabilities</span></div><div className="lc-tech-list">{(isMobile?techStack.slice(page*pageSize,(page+1)*pageSize):techStack).map((technology,position)=>{const index=isMobile?page*pageSize+position:position;return <button key={technology.name} className="lc-tech-entry" aria-pressed={selected===index} aria-controls={isMobile?"lc-tech-sheet":"lc-tech-detail"} aria-haspopup={isMobile?"dialog":undefined} onClick={()=>selectTechnology(index)}><span className="lc-tech-mark">{technology.logos?.length?technology.logos.map(name=><Logo key={name} name={name}/>):<span>{technology.mark}</span>}</span><span className="lc-tech-entry-copy"><strong>{technology.name}</strong><small>{technology.purpose}</small></span><ArrowUpRight size={15} aria-hidden="true"/></button>})}</div>{isMobile&&<nav className="lc-tech-pagination" aria-label="Technology Pages"><button disabled={page===0} aria-label="Previous Technologies" onClick={()=>changePage(page-1)}><ChevronLeft size={18}/></button><span aria-live="polite">{page*pageSize+1}–{Math.min((page+1)*pageSize,techStack.length)} of {techStack.length}</span><button disabled={page===pageCount-1} aria-label="Next Technologies" onClick={()=>changePage(page+1)}><ChevronRight size={18}/></button></nav>}</section>
    <section id="lc-tech-detail" ref={detail} tabIndex={-1} className="lc-tech-inspector" aria-label={`${item.name} details`}>
     <button className="lc-tech-return" onClick={()=>{const button=dialog.current?.querySelector<HTMLButtonElement>('.lc-tech-entry[aria-pressed="true"]');button?.scrollIntoView({block:"center",behavior:"instant"});button?.focus({preventScroll:true})}}><ArrowLeft size={14}/>Technology Index</button>{toolContent}
    </section>
   </div>
   <footer className="lc-tech-end"><span>LifeCity Attendance · Web Edition</span><small>Logos belong to their respective owners. Platform marks represent browser capabilities.</small></footer>
  </div>
  <dialog ref={sheet} id="lc-tech-sheet" className="lc-tech-sheet" aria-label={`${item.name} details`} onCancel={e=>{e.preventDefault();e.stopPropagation();closeSheet()}} onClick={e=>{e.stopPropagation();if(e.target===e.currentTarget){const box=e.currentTarget.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)closeSheet()}}}>
    <header className="lc-tech-sheet-bar"><span>Technology Details</span><button autoFocus onClick={closeSheet} aria-label="Close Technology Details"><X size={18}/></button></header>{toolContent}
  </dialog>
 </dialog>,document.body)
}
