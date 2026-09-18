// Change ID: LC-P05A-v1
import { useEffect, useRef, useState } from 'react'
import { Camera, CalendarDays, ClipboardList, LayoutDashboard, Link2, Menu, Settings, Users, X, ChevronRight } from 'lucide-react'

type Page = 'dashboard'|'members'|'events'|'scanner'|'records'|'settings'|'profile'
const primary = [
 {page:'dashboard' as const,label:'Dashboard',Icon:LayoutDashboard},
 {page:'scanner' as const,label:'Scanner',Icon:Camera},
 {page:'events' as const,label:'Services',Icon:CalendarDays},
]
const extra = [
 {page:'members' as const,label:'Members',description:'Find members, manage profiles, and open IDs.',Icon:Users},
 {page:'records' as const,label:'Records',description:'Review attendance and export reports.',Icon:ClipboardList},
 {page:'profile' as const,label:'My Member Space',description:'Your linked profile, ID, and attendance.',Icon:Link2},
 {page:'settings' as const,label:'Settings',description:'Manage accounts, access, and requests.',Icon:Settings},
]

export default function MobileAdminNav({page,isOwner,onNavigate}:{page:Page;isOwner:boolean;onNavigate:(page:Page)=>void}) {
 const dialogRef=useRef<HTMLDialogElement>(null)
 const [open,setOpen]=useState(false)
 const moreActive=!primary.some(item=>item.page===page)
 const visible=extra.filter(item=>item.page!=='settings'||isOwner)
 function close(){dialogRef.current?.close();setOpen(false)}
 function show(){if(!dialogRef.current?.open){dialogRef.current?.showModal();setOpen(true)}}
 function navigate(next:Page){close();onNavigate(next)}
 useEffect(()=>{
  const media=window.matchMedia('(min-width: 901px)')
  const resize=()=>{if(media.matches){dialogRef.current?.close();setOpen(false)}}
  media.addEventListener('change',resize)
  return()=>media.removeEventListener('change',resize)
 },[])
 useEffect(()=>{
  if(!open)return
  const overflow=document.body.style.overflow
  document.body.style.overflow='hidden'
  return()=>{document.body.style.overflow=overflow}
 },[open])
 return <>
  <nav className="lcm-bottom-nav" aria-label="Mobile Workspace Navigation" data-change-id="LC-P05A-v1">
   {primary.map(({page:target,label,Icon})=><button key={target} type="button" className={page===target?'is-current':''} aria-current={page===target?'page':undefined} onClick={()=>navigate(target)}><Icon size={21} aria-hidden="true"/><span>{label}</span></button>)}
   <button type="button" className={moreActive?'is-current':''} aria-expanded={open} aria-controls="lcm-workspace-menu" aria-haspopup="dialog" onClick={show}><Menu size={21} aria-hidden="true"/><span>More</span>{moreActive&&<span className="lcm-sr-only">Current section: {visible.find(item=>item.page===page)?.label}</span>}</button>
  </nav>
  <dialog id="lcm-workspace-menu" className="lcm-menu" ref={dialogRef} aria-labelledby="lcm-menu-title" onClose={()=>setOpen(false)} onClick={event=>{if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close()}}}>
   <header className="lcm-menu-heading"><div><p className="eyebrow">Your Workspace</p><h2 id="lcm-menu-title">Explore LifeCity</h2></div><button type="button" className="lcm-close" aria-label="Close Menu" onClick={close} autoFocus><X size={20}/></button></header>
   <p className="lcm-menu-intro">Your tools, wherever you are.</p>
   <nav className="lcm-menu-links" aria-label="More Workspace Pages">{visible.map(({page:target,label,description,Icon})=><button key={target} type="button" className={page===target?'is-current':''} aria-current={page===target?'page':undefined} onClick={()=>navigate(target)}><span className="lcm-menu-icon"><Icon size={21}/></span><span className="lcm-menu-copy"><strong>{label}</strong><small>{description}</small></span><ChevronRight size={17}/></button>)}</nav>
   <p className="lcm-menu-footer">{isOwner?'Owner Workspace':'Admin Workspace'} · LifeCity Attendance</p>
  </dialog>
 </>
}
