import CommunityArt from './CommunityArt'
import WhatsNew from './WhatsNew'
// Change ID: LC-P04B-v2-GOOGLE-LOGO
import { useEffect, useRef, useState } from 'react'
import { Users, Home, ArrowRight, CalendarDays, MapPin, RefreshCw, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, QrCode, Heart } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Service = {id:string;name:string;starts_at:string;location:string|null;is_sunday_service:boolean;state:'upcoming'|'in-progress'}
type Result = {rows:Service[];total:number;page:number;page_size:number;server_time:string}
const dateLabel=(value:string)=>new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value))

export default function GuestPreview({onBack,onSignIn,signingIn,error:authError}:{onBack:()=>void;onSignIn:()=>void;signingIn:boolean;error:string}) {
 const [page,setPage]=useState(1)
 const [revision,setRevision]=useState(0)
 const [data,setData]=useState<Result|null>(null)
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const listRef=useRef<HTMLElement>(null)
 const scrollPending=useRef(false)
 useEffect(()=>{
  let active=true
  setLoading(true);setError('')
  void(async()=>{try{
   const {data:result,error:failure}=await supabase.rpc('lc_guest_services',{p_page:page})
   if(failure)throw failure
   if(!result||!Array.isArray(result.rows))throw new Error('Unexpected response')
   if(active)setData(result as Result)
  }catch{if(active){setData(null);setError('We could not load the public service schedule. Please try again shortly.')}}finally{if(active)setLoading(false)}})()
  return()=>{active=false}
 },[page,revision])
 useEffect(()=>{
  const refresh=()=>{if(document.visibilityState==='visible')setRevision(v=>v+1)}
  const timer=window.setInterval(refresh,60000)
  document.addEventListener('visibilitychange',refresh)
  return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh)}
 },[])
 useEffect(()=>{
  if(loading||!scrollPending.current)return
  scrollPending.current=false
  listRef.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})
 },[loading,data,error])
 const current=data?.page??1
 const pages=Math.max(1,Math.ceil((data?.total??0)/12))
 function go(next:number){if(loading)return;scrollPending.current=true;setPage(next)}
 return <main className="lc-guest" data-change-id="LC-P04B-v2-GOOGLE-LOGO">
  <header className="lcg-topbar"><div className="brand"><div className="brand-icon small"><Users size={20}/></div><span>LifeCity Attendance</span></div><button className="lcg-button lc-community-icon" aria-label="Back to Welcome" title="Back to Welcome" onClick={onBack} disabled={signingIn}><Home size={19}/></button></header>
  <section className="lcg-hero"><div><p className="eyebrow">A Place to Belong</p><h1>Come as You Are.</h1><p>Find a gathering, meet your community, and make room for something meaningful.</p><div className="lcg-hero-actions"><button className="lcg-button lcg-primary" onClick={()=>listRef.current?.scrollIntoView({block:"start",behavior:document.documentElement.dataset.lcMotion==="on"&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches?"smooth":"auto"})}>Find a Gathering<ArrowRight size={16}/></button><span className="lcg-guest-pill">You’re Welcome Here</span></div></div><CommunityArt/></section>
  <section className="lcg-services" ref={listRef} aria-labelledby="lcg-services-title" aria-busy={loading}>
   <header className="lcg-section-head"><div><p className="eyebrow">Gather with Us</p><h2 id="lcg-services-title">Current &amp; Upcoming Services</h2><p>Public gatherings · All times in Manila</p></div><div className="lcg-tools"><span aria-live="polite">{loading?'Updating…':`${data?.total??0} ${(data?.total??0)===1?'Service':'Services'}`}</span><button className="lcg-button lc-community-icon lc-refresh-icon" aria-label="Refresh Services" title="Refresh Services" aria-busy={loading} disabled={loading} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={17}/></button></div></header>
   {loading?<div className="lcg-grid" role="status"><span className="lcg-sr-only">Loading services…</span>{[0,1,2].map(n=><div className="lcg-skeleton" key={n} aria-hidden="true"/>)}</div>:error?<div className="lcg-empty" role="alert"><p>{error}</p><button className="lcg-button" onClick={()=>setRevision(v=>v+1)}>Try Again</button></div>:!data?.rows.length?<div className="lcg-empty"><CalendarDays size={30}/><h3>More Gatherings Soon</h3><p>There are no public services listed right now. Check back soon or ask the church team about the next gathering.</p></div>:<div className="lcg-grid" data-count={data.rows.length}>{data.rows.map(service=><article className="lcg-card" key={service.id}><div className="lc-service-date" aria-hidden="true"><span>{new Intl.DateTimeFormat('en',{timeZone:'Asia/Manila',month:'short'}).format(new Date(service.starts_at))}</span><strong>{new Intl.DateTimeFormat('en',{timeZone:'Asia/Manila',day:'numeric'}).format(new Date(service.starts_at))}</strong></div><div className="lcg-pills"><span className={'lcg-pill '+service.state}>{service.state==='in-progress'?'In Progress':'Upcoming'}</span>{service.is_sunday_service&&<span className="lcg-pill sunday">Sunday Service</span>}</div><h3>{service.name}</h3><div className="lcg-service-meta"><p><CalendarDays size={17}/><span>{dateLabel(service.starts_at)}</span></p><p><MapPin size={17}/><span>{service.location||'Ask the church team for the venue.'}</span></p></div></article>)}</div>}
   {!!data?.total&&!error&&<footer className="lcg-pagination"><span>{(current-1)*12+1}–{Math.min(current*12,data.total)} of {data.total} Services</span><nav aria-label="Public Service Pages"><button className="lcg-button" aria-label="First Page" disabled={loading||current===1} onClick={()=>go(1)}><ChevronsLeft size={17}/></button><button className="lcg-button" aria-label="Previous Page" disabled={loading||current===1} onClick={()=>go(current-1)}><ChevronLeft size={17}/></button><span>{current} / {pages}</span><button className="lcg-button" aria-label="Next Page" disabled={loading||current>=pages} onClick={()=>go(current+1)}><ChevronRight size={17}/></button><button className="lcg-button" aria-label="Last Page" disabled={loading||current>=pages} onClick={()=>go(pages)}><ChevronsRight size={17}/></button></nav></footer>}
  </section>
  <section className="lcg-connect"><div><p className="eyebrow">Your LifeCity Space</p><h2>Make Yourself at Home</h2><p>Sign in with Google, then connect your member profile to keep your church essentials close.</p><div className="lcg-benefits"><span><QrCode size={17}/>Your Member ID</span><span><CalendarDays size={17}/>Attendance History</span><span><Heart size={17}/>Your Profile</span></div></div><div className="lcg-connect-action"><button className="lcg-button lcg-primary" disabled={signingIn} onClick={onSignIn}><span aria-hidden="true" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:28,height:28,flexShrink:0,borderRadius:8,background:"#fff"}}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48"><path fill="#4285F4" d="M43.6 24.5c0-1.5-.1-2.9-.4-4.3H24v8.1h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.7c3.9-3.6 6-8.9 6-15.2Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.2c-1.8 1.2-4.1 1.9-6.8 1.9-5.3 0-9.8-3.6-11.4-8.4H5.7v5.4A20.4 20.4 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.4a12.2 12.2 0 0 1 0-7.8v-5.4H5.7a20.3 20.3 0 0 0 0 18.6l6.9-5.4Z"/><path fill="#EA4335" d="M24 11.2c3 0 5.6 1 7.6 3l5.7-5.7A19.3 19.3 0 0 0 24 3 20.4 20.4 0 0 0 5.7 14.2l6.9 5.4c1.6-4.8 6.1-8.4 11.4-8.4Z"/></svg></span>{signingIn?'Connecting…':'Continue with Google'}<ArrowRight size={17}/></button><small>New here? Your login is created when you first sign in. Member profiles are connected after verification.</small>{authError&&<p className="lcg-error" role="alert">{authError}</p>}</div></section>
  <WhatsNew audience="guest"/>
  <footer className="lcg-footer">LifeCity Attendance · Connected in Community</footer>
 </main>
}
