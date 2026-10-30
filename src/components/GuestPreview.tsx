import BorderGlow from './BorderGlow'
import '../guest-layout.css'
import './GuestPreview.css'
import './ServiceCornerNotes.css'
import CommunityArt from './CommunityArt'
import FoldText from './FoldText'
import WhatsNew from './WhatsNew'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CircleAlert, Clock3, FilePenLine, History, MapPin, QrCode, RefreshCw, Users } from 'lucide-react'
import { revealWorkspaceRegion } from '../lib/workspaceViewport'
import { supabase } from '../lib/supabase'
import { isDemoMode } from '../demo/mode'

type Service = {id:string;name:string;starts_at:string;location:string|null;is_sunday_service:boolean;state:'upcoming'|'in-progress'}
type Result = {rows:Service[];total:number;page:number;page_size:number;server_time:string}
const dateLabel=(value:string)=>new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value))
const calendarPart=(value:string,part:'month'|'day'|'weekday')=>new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',[part]:part==='day'?'numeric':'short'}).format(new Date(value))

function publicService(value:unknown):Service {
 const row=value as Partial<Service>|null
 if(!row||typeof row.id!=='string'||typeof row.name!=='string'||typeof row.starts_at!=='string'||!Number.isFinite(Date.parse(row.starts_at))||!['upcoming','in-progress'].includes(row.state??'')||(row.location!==null&&typeof row.location!=='string'))throw new Error('Invalid public service')
 // Keep the schedule's public projection explicit. Member details, notes and
 // attendance are never part of the guest view, even if a response adds fields.
 return {id:row.id,name:row.name,starts_at:row.starts_at,location:row.location,is_sunday_service:row.is_sunday_service===true,state:row.state!}
}
function GoogleMark(){
 return <span className="lcg-google-mark" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 48 48"><path fill="#4285F4" d="M43.6 24.5c0-1.5-.1-2.9-.4-4.3H24v8.1h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.7c3.9-3.6 6-8.9 6-15.2Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.2c-1.8 1.2-4.1 1.9-6.8 1.9-5.3 0-9.8-3.6-11.4-8.4H5.7v5.4A20.4 20.4 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.4a12.2 12.2 0 0 1 0-7.8v-5.4H5.7a20.3 20.3 0 0 0 0 18.6l6.9-5.4Z"/><path fill="#EA4335" d="M24 11.2c3 0 5.6 1 7.6 3l5.7-5.7A19.3 19.3 0 0 0 24 3 20.4 20.4 0 0 0 5.7 14.2l6.9 5.4c1.6-4.8 6.1-8.4 11.4-8.4Z"/></svg></span>
}

export default function GuestPreview({onBack,onSignIn,signingIn,error:authError}:{onBack:()=>void;onSignIn:()=>void;signingIn:boolean;error:string}) {
 const demo = isDemoMode()
 const [page,setPage]=useState(1),[revision,setRevision]=useState(0)
 const [data,setData]=useState<Result|null>(null),[loadedPage,setLoadedPage]=useState(0)
 const [loading,setLoading]=useState(true),[error,setError]=useState('')
 const listRef=useRef<HTMLElement>(null),headingRef=useRef<HTMLHeadingElement>(null)
 const scrollPending=useRef(false),sequence=useRef(0)
 useEffect(()=>{
  let active=true;const request=++sequence.current
  setLoading(true);setError('')
  void(async()=>{try{
   const {data:result,error:failure}=await supabase.rpc('lc_guest_services',{p_page:page})
   if(failure)throw failure
   if(!result||!Array.isArray(result.rows)||!Number.isInteger(result.total)||result.total<0)throw new Error('Unexpected public schedule')
   const next:Result={rows:result.rows.map(publicService),total:result.total,page:Number.isInteger(result.page)&&result.page>0?result.page:page,page_size:Number.isInteger(result.page_size)&&result.page_size>0?result.page_size:12,server_time:typeof result.server_time==='string'?result.server_time:''}
   if(active&&sequence.current===request){setData(next);setLoadedPage(page)}
  }catch{if(active&&sequence.current===request)setError('Could not refresh the public schedule. Please try again.')}
  finally{if(active&&sequence.current===request)setLoading(false)}})()
  return()=>{active=false}
 },[page,revision])
 useEffect(()=>{
  const refresh=()=>{if(document.visibilityState==='visible')setRevision(value=>value+1)}
  const timer=window.setInterval(refresh,60000)
  document.addEventListener('visibilitychange',refresh)
  return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh)}
 },[])
 useEffect(()=>{
  if(loading||!scrollPending.current)return
  scrollPending.current=false
  revealWorkspaceRegion(listRef.current,'start')
  headingRef.current?.focus({preventScroll:true})
 },[loading,data,error])
 const visibleData=loadedPage===page?data:null
 const current=visibleData?.page??page,size=visibleData?.page_size??12
 const pages=Math.max(1,Math.ceil((visibleData?.total??0)/size))
 const hasSnapshot=!!visibleData
 function go(next:number){if(loading||next===current)return;scrollPending.current=true;setLoading(true);setError('');setPage(next)}
 function browse(){revealWorkspaceRegion(listRef.current,'start');headingRef.current?.focus({preventScroll:true})}
 return <main className="lc-guest lcg-workspace" data-change-id="LC-GUEST-v25">
  <header className="lcg-topbar"><div className="brand"><div className="brand-icon small"><Users size={20}/></div><span>LifeCity Attendance</span></div><div className="lcg-header-actions"><span className="lcg-access-label"><i aria-hidden="true"/>Guest Preview</span><button type="button" className="lcg-button lcg-back" aria-label="Back to Welcome" onClick={onBack} disabled={signingIn}><ArrowLeft size={17}/><span>Back to Welcome</span></button></div></header>
  <BorderGlow as="section" className="lcg-hero" borderRadius={22} animated aria-labelledby="lcg-welcome-title"><div><p className="eyebrow">LifeCity Church of Christ</p><h1 id="lcg-welcome-title"><FoldText text="Welcome to LifeCity"/></h1><p>See current and upcoming services, with their schedule and venue.</p><div className="lcg-hero-actions"><button type="button" className="lcg-button lcg-primary" onClick={browse}>View Services<ArrowRight size={16}/></button><span className="lcg-hero-note"><Check size={14}/>No sign-in needed to browse</span></div></div><div className="lcg-hero-art"><CommunityArt compact/><span>Public Service Schedule</span></div></BorderGlow>
  <section className="lcg-services" ref={listRef} aria-labelledby="lcg-services-title" aria-busy={loading}>
   {loading&&hasSnapshot&&<span className="lcg-update-line" role="status"><span className="lcg-sr-only">Updating services…</span></span>}
   <header className="lcg-section-head"><div className="lcg-section-title"><span className="lcg-section-icon" aria-hidden="true"><CalendarDays size={21}/></span><div><h2 id="lcg-services-title" ref={headingRef} tabIndex={-1}>What’s Coming Up</h2><p>Current and upcoming services · Manila time</p></div></div><div className="lcg-tools"><span className="lcg-count" aria-live="polite">{hasSnapshot?visibleData.total+' '+(visibleData.total===1?'Service':'Services'):loading?'Loading…':'Schedule'}</span><button type="button" className="lcg-button lcg-icon" aria-label="Refresh Services" title="Refresh Services" aria-busy={loading} disabled={loading} onClick={()=>setRevision(value=>value+1)}><RefreshCw size={17}/></button></div></header>
   {error&&hasSnapshot&&<div className="lcg-refresh-error" role="alert"><CircleAlert size={16}/><span>{error} The last loaded schedule is shown below.</span><button type="button" className="lcg-button" disabled={loading} onClick={()=>setRevision(value=>value+1)}>Try Again</button></div>}
   {!hasSnapshot&&loading?<div className="lcg-grid" role="status"><span className="lcg-sr-only">Loading services…</span>{[0,1,2].map(number=><div className="lcg-skeleton" key={number} aria-hidden="true"/>)}</div>:!hasSnapshot&&error?<div className="lcg-empty" role="alert"><CircleAlert size={30}/><div><h3>Schedule Unavailable</h3><p>We could not load the public services. Try again or ask the church team for the schedule.</p></div><button type="button" className="lcg-button" onClick={()=>setRevision(value=>value+1)}>Try Again</button></div>:!visibleData?.rows.length?<div className="lcg-empty"><CalendarDays size={30}/><div><h3>No Public Services Listed</h3><p>Ask the church team about upcoming services, or check the schedule again later.</p></div></div>:<div className="lcg-grid" data-count={visibleData.rows.length}>{visibleData.rows.map(service=><article className={'lcg-card'+(service.state==='in-progress'?' is-live':'')} key={service.id}><div className="lcg-card-top"><time className="lcg-calendar" dateTime={service.starts_at} aria-label={dateLabel(service.starts_at)}><span>{calendarPart(service.starts_at,'month')}</span><strong>{calendarPart(service.starts_at,'day')}</strong><small>{calendarPart(service.starts_at,'weekday')}</small></time><div className="lcg-pills"><span className={'lcg-pill '+service.state}>{service.state==='in-progress'?'In Progress':'Upcoming'}</span>{service.is_sunday_service&&<span className="lcg-pill sunday">Sunday Service</span>}</div></div><h3>{service.name}</h3><div className="lcg-service-meta"><p><Clock3 size={15} aria-hidden="true"/><span>{dateLabel(service.starts_at)}</span></p><p><MapPin size={15} aria-hidden="true"/><span>{service.location||'Venue to be confirmed'}</span></p></div></article>)}</div>}
   {!!visibleData?.total&&<footer className="lcg-pagination"><span>{(current-1)*size+1}–{Math.min(current*size,visibleData.total)} of {visibleData.total} Services</span><nav aria-label="Public Service Pages"><button type="button" className="lcg-button" aria-label="First Page" disabled={loading||current===1} onClick={()=>go(1)}><ChevronsLeft size={17}/></button><button type="button" className="lcg-button" aria-label="Previous Page" disabled={loading||current===1} onClick={()=>go(current-1)}><ChevronLeft size={17}/></button><span>Page {current} of {pages}</span><button type="button" className="lcg-button" aria-label="Next Page" disabled={loading||current>=pages} onClick={()=>go(current+1)}><ChevronRight size={17}/></button><button type="button" className="lcg-button" aria-label="Last Page" disabled={loading||current>=pages} onClick={()=>go(pages)}><ChevronsRight size={17}/></button></nav></footer>}
  </section>
  <section className="lcg-connect" aria-labelledby="lcg-connect-title"><div><p className="eyebrow">Member Access</p><h2 id="lcg-connect-title">Your Member Space</h2><p>Sign in to access your profile, attendance QR, and check-in history.</p><div className="lcg-benefits"><span><QrCode size={17}/>Attendance QR</span><span><FilePenLine size={17}/>Profile Requests</span><span><History size={17}/>Attendance History</span></div></div><div className="lcg-connect-action"><button type="button" className="lcg-button lcg-primary" disabled={signingIn} aria-busy={signingIn} onClick={onSignIn}><GoogleMark/>{signingIn?(demo?'Opening Demo…':'Connecting…'):(demo?'Try Member Sign-In':'Continue with Google')}<ArrowRight size={17}/></button><small>{demo?'Open a fictional member account. No Google account or personal sign-in is used.':'First visit? Sign in, then request a connection to your existing member profile. The church team verifies the connection.'}</small>{authError&&<p className="lcg-error" role="alert">{authError}</p>}</div></section>
  <WhatsNew audience="guest"/>
  <footer className="lcg-footer"><span>LifeCity Attendance · LifeCity Church of Christ</span><span>Public schedule · Times in Manila</span></footer>
 </main>
}
