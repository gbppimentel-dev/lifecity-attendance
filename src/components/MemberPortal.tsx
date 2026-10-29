import BorderGlow from './BorderGlow'
import { useNoticeToast } from '../lib/useNoticeToast'
import type { ReleaseAudience } from '../lib/releaseNotes'
import CommunityArt from './CommunityArt'
import WhatsNew from './WhatsNew'
import MyFeedback from './MyFeedback'
// Change ID: LC-UI-COPY-v2
import { uiMessage } from '../lib/uiText'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Users, CalendarDays, MapPin, Download, RefreshCw, LogOut, QrCode, X, ChevronLeft, ChevronRight, UserRound, History, MessageSquare, Mail, Phone, Church, HandHeart, ShieldCheck, ChevronDown, Clock3 } from 'lucide-react'
import MemberAttendanceHistory from './MemberAttendanceHistory'
import { MemberProfileEditor } from './ProfileChanges'
import { supabase } from '../lib/supabase'
import { revealWorkspaceRegion } from '../lib/workspaceViewport'
import './MemberPortal.css'
import './ServiceCornerNotes.css'

type Profile={id:string;member_number:string;first_name:string;last_name:string;email:string|null;mobile:string|null;status:'active'|'inactive';qr_token:string|null;churches:string[];ministries:string[]}
type Service={id:string;name:string;starts_at:string;location:string|null;is_sunday_service:boolean;state:'upcoming'|'in-progress';available_until:string}
type Portal={profile:Profile;services:Service[];service_total:number;service_page:number;server_time:string}
const serviceDate=(value:string)=>new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value))
const calendarPart=(value:string,part:'month'|'day'|'weekday')=>new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',...(part==='month'?{month:'short'}:part==='day'?{day:'numeric'}:{weekday:'short'})}).format(new Date(value))

function renderMemberId(profile:Profile,qrImage:HTMLImageElement):HTMLCanvasElement {
 const canvas=document.createElement('canvas')
 canvas.width=1600
 const ctx=canvas.getContext('2d')
 if(!ctx)throw new Error('ID Drawing is Unavailable')
 // Wrap complete text, including individual words wider than the column.
 function wrap(text:string,width:number,size:number,weight=600):string[] {
  ctx!.font=weight+' '+size+'px system-ui, sans-serif'
  const lines:string[]=[];let line=''
  for(const word of text.split(/\s+/).filter(Boolean)){
   if(ctx!.measureText(word).width>width){
    if(line){lines.push(line);line=''}
    for(const char of Array.from(word)){
     if(line && ctx!.measureText(line+char).width>width){lines.push(line);line=''}
     line+=char
    }
   }else{
    const next=line?line+' '+word:word
    if(line && ctx!.measureText(next).width>width){lines.push(line);line=word}else line=next
   }
  }
  if(line)lines.push(line)
  return lines.length?lines:['']
 }
 const name=profile.first_name+' '+profile.last_name
 let nameSize=60,nameLines=wrap(name,710,nameSize,750)
 while(nameLines.length>2 && nameSize>40){nameSize-=2;nameLines=wrap(name,710,nameSize,750)}
 const churches=wrap(profile.churches.join(' • ')||'LifeCity',650,25,650)
 const ministries=wrap(profile.ministries.join(' • ')||'None',690,25,500)
 const numbers=wrap(profile.member_number,690,29,600)
 const nameTop=298
 const numberTop=nameTop+nameLines.length*(nameSize+10)+22
 const churchTop=numberTop+numbers.length*38+26
 const churchHeight=churches.length*35+34
 const ministryTop=churchTop+churchHeight+54
 const contentBottom=ministryTop+35+ministries.length*35
 canvas.height=Math.max(1000,contentBottom+140)
 const h=canvas.height
 // Resizing clears the context; set all paint state after choosing the height.
 const rounded=(x:number,y:number,w:number,height:number,r:number)=>{
  ctx.beginPath();ctx.roundRect(x,y,w,height,r)
 }
 const lines=(content:string[],x:number,y:number,size:number,lineHeight:number,color:string,weight=600)=>{
  ctx.fillStyle=color;ctx.font=weight+' '+size+'px system-ui, sans-serif';ctx.textBaseline='top'
  content.forEach((line,index)=>ctx.fillText(line,x,y+index*lineHeight))
 }
 const bg=ctx.createLinearGradient(0,0,1600,h)
 bg.addColorStop(0,'#effbf8');bg.addColorStop(.55,'#fbfdff');bg.addColorStop(1,'#f4f1ff')
 ctx.fillStyle=bg;ctx.fillRect(0,0,1600,h)
 rounded(32,30,1536,h-60,42);ctx.fillStyle='rgba(255,255,255,.78)';ctx.fill()
 const edge=ctx.createLinearGradient(32,30,1568,h-30)
 edge.addColorStop(0,'#9be3d7');edge.addColorStop(.42,'#b8a5ef');edge.addColorStop(.72,'#f3ca78');edge.addColorStop(1,'#8fddd1')
 ctx.strokeStyle=edge;ctx.lineWidth=3;ctx.stroke()
 ctx.save();rounded(32,30,1536,h-60,42);ctx.clip()
 ctx.strokeStyle='rgba(181,166,237,.3)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(1380,-82,250,0,Math.PI*2);ctx.stroke()
 ctx.strokeStyle='rgba(121,217,202,.13)';ctx.lineWidth=52;ctx.beginPath();ctx.arc(1380,-82,310,0,Math.PI*2);ctx.stroke();ctx.restore()
 const header=ctx.createLinearGradient(70,58,1530,216);header.addColorStop(0,'#0f837a');header.addColorStop(.55,'#1a9a8d');header.addColorStop(1,'#7764bb')
 rounded(70,58,1460,158,34);ctx.fillStyle=header;ctx.fill()
 lines(['LIFECITY CHURCH'],116,86,25,30,'rgba(255,255,255,.8)',700)
 lines(['MEMBER ID'],180,123,50,60,'#fff',800)
 ctx.strokeStyle='#fff';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.arc(140,142,9,0,Math.PI*2);ctx.stroke()
 ctx.beginPath();ctx.moveTo(118,169);ctx.bezierCurveTo(120,154,130,151,140,151);ctx.bezierCurveTo(150,151,160,154,162,169);ctx.stroke();ctx.lineCap='butt'
 lines(nameLines,100,nameTop,nameSize,nameSize+10,'#173f3b',750)
 lines(numbers,100,numberTop,29,38,'#64817d',600)
 rounded(100,churchTop,706,churchHeight,24);ctx.fillStyle='#e4f5f1';ctx.fill()
 lines(churches,128,churchTop+17,25,35,'#287166',650)
 lines(['MINISTRIES'],100,ministryTop,23,30,'#78908c',650)
 lines(ministries,100,ministryTop+37,25,35,'#365c57',500)
 const qrY=278
 rounded(910,qrY,520,590,34);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#cfeae5';ctx.lineWidth=3;ctx.stroke()
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#315854';ctx.font='800 25px system-ui, sans-serif'
 ctx.fillText('SCAN FOR ATTENDANCE',1170,qrY+62)
 ctx.drawImage(qrImage,970,qrY+103,400,400)
 ctx.fillStyle='#718985';ctx.font='600 20px system-ui, sans-serif'
 ctx.fillText('Private member token • Keep this ID safe',1170,qrY+548)
 ctx.textAlign='left'
 rounded(70,h-94,1460,48,22);ctx.fillStyle='rgba(225,244,240,.88)';ctx.fill()
 lines(['LifeCity Attendance Monitoring • Digital Member ID'],100,h-81,20,25,'#56736f',600)
 return canvas
}

export default function MemberPortal({audience='user',embedded=false,onRefreshAccess,onSignOut,signingOut=false,authError=''}:{audience?:ReleaseAudience;embedded?:boolean;onRefreshAccess:()=>void;onSignOut?:()=>void;signingOut?:boolean;authError?:string}) {
 const [data,setData]=useState<Portal|null>(null)
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [page,setPage]=useState(1)
 const [scheduleOpen,setScheduleOpen]=useState(false)
 const [revision,setRevision]=useState(0)
 const [qrOpen,setQrOpen]=useState(false)
 const [downloading,setDownloading]=useState(false)
 const [downloadError,setDownloadError]=useState('')
 const [notice,setNotice]=useState('')
 useNoticeToast(notice)
 const qrRef=useRef<HTMLDivElement>(null)
 const servicesRef=useRef<HTMLElement>(null)
 const profileRef=useRef<HTMLElement>(null),historyRef=useRef<HTMLDivElement>(null),feedbackRef=useRef<HTMLDivElement>(null)
 const qrButtonRef=useRef<HTMLButtonElement>(null)
 const modalRef=useRef<HTMLDialogElement>(null)
 const refreshing=useRef(false)
 const alive=useRef(true),downloadGeneration=useRef(0)
 const currentData=useRef<Portal|null>(null)
 currentData.current=data
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;downloadGeneration.current++}},[])

 useEffect(()=>{
  let active=true,inFlight=false
  async function load(initial=false) {
   if(inFlight)return
   inFlight=true;if(initial)setLoading(true)
   try {
    const {data:result,error:failure}=await supabase.rpc('lc_my_member_portal',{p_service_page:page})
    if(failure)throw failure
    if(!result?.profile?.id || !Array.isArray(result.services))throw new Error('Invalid Portal Response')
    if(active){
     if(currentData.current && (currentData.current.profile.id!==result.profile.id || currentData.current.profile.qr_token!==result.profile.qr_token || currentData.current.profile.status!==result.profile.status))setQrOpen(false)
     setData(result as Portal);setError('')
    }
   } catch(e){
    if(active){
     setData(null);setQrOpen(false)
     const failure=e as {code?:string;message?:string}
     setError(failure.code==='PGRST202'?'Your member space is being prepared. Please contact the Owner to install LC-P03A-v1.sql.':failure.code==='P0001'?failure.message||'Please refresh access.':'We could not load your member space. Try Refresh access.')
    }
   } finally {inFlight=false;if(active)setLoading(false)}
  }
  void load(true)
  const visible=()=>{if(document.visibilityState==='visible')void load()}
  const timer=window.setInterval(visible,30000)
  document.addEventListener('visibilitychange',visible)
  return ()=>{active=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',visible)}
 },[page,revision])
 useLayoutEffect(()=>{
  if(!qrOpen)return
  const oldOverflow=document.body.style.overflow
  const oldPadding=document.body.style.paddingRight
  const scrollbar=Math.max(0,innerWidth-document.documentElement.clientWidth)
  document.body.style.overflow='hidden'
  if(scrollbar)document.body.style.paddingRight=`${parseFloat(getComputedStyle(document.body).paddingRight)+scrollbar}px`
  const dialog=modalRef.current
  dialog?.showModal()
  dialog?.querySelector<HTMLButtonElement>('button')?.focus()
  return ()=>{dialog?.close();document.body.style.overflow=oldOverflow;document.body.style.paddingRight=oldPadding;qrButtonRef.current?.focus({preventScroll:true})}
 },[qrOpen])
 async function downloadQr(kind:'qr'|'id'='qr'){
  if(refreshing.current || !data?.profile.qr_token || data.profile.status!=='active')return
  const svg=qrRef.current?.querySelector('svg')
  if(!svg)return
  refreshing.current=true;setDownloading(true);setDownloadError('');setNotice('')
  const generation=downloadGeneration.current,profileId=data.profile.id,token=data.profile.qr_token
  let url=''
  try {
   // Recheck the signed-in member before producing an identifying download.
   const {data:latest,error:failure}=await supabase.rpc('lc_my_member_portal',{p_service_page:1})
   if(failure || !latest?.profile?.qr_token || latest.profile.status!=='active' || latest.profile.id!==profileId || latest.profile.qr_token!==token) {
    if(alive.current){setQrOpen(false);setData(null);setError('Your member connection could not be confirmed. Refresh access before using your QR.')}
    throw new Error('Your member connection changed. Refresh access before downloading.')
   }
   const exportProfile=latest.profile as Profile
   if(document.fonts)await document.fonts.ready
   const text=new XMLSerializer().serializeToString(svg)
   url=URL.createObjectURL(new Blob([text],{type:'image/svg+xml;charset=utf-8'}))
   const picture=new Image()
   await new Promise<void>((resolve,reject)=>{picture.onload=()=>resolve();picture.onerror=()=>reject(new Error('Image Failed'));picture.src=url})
   const canvas=kind==='id'?renderMemberId(exportProfile,picture):document.createElement('canvas')
   if(kind==='qr'){
    canvas.width=1024;canvas.height=1024
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas Unavailable')
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1024,1024);ctx.drawImage(picture,0,0,1024,1024)
   }
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Export Failed')),'image/png'))
   if(!alive.current||downloadGeneration.current!==generation||currentData.current?.profile.id!==profileId||currentData.current.profile.qr_token!==token||currentData.current.profile.status!=='active')return
   const output=URL.createObjectURL(blob),a=document.createElement('a')
   a.href=output;a.download=(kind==='id'?'LifeCity-Member-ID-':'LifeCity-QR-')+exportProfile.member_number.replace(/[^a-zA-Z0-9_-]/g,'')+'.png'
   document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(output),1000)
   setNotice(kind==='id'?'Your member ID download is ready.':'Your QR download is ready.')
  } catch(e) {if(alive.current)setDownloadError(e instanceof Error && e.message.startsWith('Your member connection')?e.message:'Could not prepare your download. Please try again.')}
  finally {if(url)URL.revokeObjectURL(url);refreshing.current=false;if(alive.current)setDownloading(false)}
 }
 function changePage(next:number){setPage(next);revealWorkspaceRegion(servicesRef.current,'start')}
 const profile=data?.profile
 const canUseQr=profile?.status==='active'&&!!profile.qr_token
 const pages=Math.max(1,Math.ceil((data?.service_total??0)/12))
 const schedulePending=!!data&&data.service_page!==page
 const visibleServices=data?.services.slice(0,scheduleOpen?12:3)??[]
 const Container=embedded?'div':'main'
 return <Container className={'lc-member-space lmp-workspace'+(embedded?' is-embedded':'')} data-change-id="LC-MEMBER-SPACE-v25">
  {!embedded && <header className="lmp-topbar"><div className="brand"><div className="brand-icon small"><Users size={20}/></div><span>LifeCity Attendance</span></div><button className="lmp-button lmp-signout" disabled={signingOut} onClick={onSignOut}><LogOut size={16}/>{signingOut?'Signing Out…':'Sign Out'}</button></header>}
  <div className="lmp-content">
   {authError && <p className="lmp-error" role="alert">{uiMessage(authError)}</p>}
   <BorderGlow as="section" className="lmp-hero" borderRadius={22} animated><div className="lmp-hero-copy"><p className="eyebrow">Member Space</p><h1>{profile?'Hi, '+profile.first_name+'.':'Your Member Space'}</h1><p>Your profile, attendance and upcoming services.</p><nav className="lmp-section-links" aria-label="Member Space Sections"><button type="button" disabled={!profile} onClick={()=>revealWorkspaceRegion(profileRef.current,'start')}><UserRound size={15}/>Profile</button><button type="button" disabled={!profile} onClick={()=>revealWorkspaceRegion(historyRef.current,'start')}><History size={15}/>Attendance</button><button type="button" disabled={!profile} onClick={()=>revealWorkspaceRegion(feedbackRef.current,'start')}><MessageSquare size={15}/>Feedback</button></nav></div><div className="lmp-hero-side"><CommunityArt compact/><button type="button" className="lmp-button lmp-refresh lc-refresh-icon" aria-label="Refresh Access" title="Refresh Member Space" aria-busy={loading} disabled={loading} onClick={()=>{setRevision(v=>v+1);onRefreshAccess()}}><RefreshCw size={17}/><span>{loading&&data?'Refreshing…':'Refresh'}</span></button></div></BorderGlow>
   {loading&&!data ? <div className="lmp-loading" role="status"><span className="lmp-loading-label"><RefreshCw size={18}/>Loading Member Space…</span><div className="lmp-skeleton"/><div className="lmp-skeleton"/></div> : error ? <div className="lmp-error" role="alert"><strong>Member Space Unavailable</strong><p>{uiMessage(error)}</p><button type="button" className="lmp-button" disabled={loading} onClick={()=>{setRevision(v=>v+1);onRefreshAccess()}}><RefreshCw size={16}/>Try Again</button></div> : profile && data && <>
    <section className="lmp-services lmp-upcoming" ref={servicesRef} aria-labelledby="lmp-services-title" aria-busy={loading}>
     <header className="lmp-section-head"><div className="lmp-section-title"><span className="lmp-section-icon"><CalendarDays size={21}/></span><div><p className="eyebrow">LifeCity Schedule</p><h2 id="lmp-services-title">Coming Up at LifeCity</h2><p>Current and upcoming services · Manila Time</p></div></div><div className="lmp-schedule-tools"><span className="lmp-service-total">{data.service_total} {data.service_total===1?'Service':'Services'}</span>{data.service_total>3&&<button type="button" className="lmp-button lmp-schedule-toggle" aria-expanded={scheduleOpen} aria-controls="lmp-schedule-list" disabled={loading} onClick={()=>{if(scheduleOpen&&page!==1)setPage(1);setScheduleOpen(!scheduleOpen)}}>{scheduleOpen?'Show Less':'View All Services'}<ChevronDown size={15}/></button>}</div></header>
     {schedulePending?<div className="lmp-service-loading" role="status"><RefreshCw size={17}/>Loading services…</div>:data.services.length===0 ? <div className="lmp-empty"><CalendarDays size={28}/><div><h3>No Services Scheduled</h3><p>Check here for the next service or ask the church team.</p></div></div> : <div id="lmp-schedule-list" className="lmp-service-grid" data-expanded={scheduleOpen||undefined}>{visibleServices.map(event=><article className={'lmp-service-card'+(event.state==='in-progress'?' is-current':'')} key={event.id}><div className="lmp-service-top"><time className="lmp-calendar" dateTime={event.starts_at}><span>{calendarPart(event.starts_at,'month')}</span><strong>{calendarPart(event.starts_at,'day')}</strong><small>{calendarPart(event.starts_at,'weekday')}</small></time><div className="lmp-service-copy"><div className="lmp-pills"><span className={'lmp-pill '+event.state}>{event.state==='in-progress'?'In Progress':'Upcoming'}</span>{event.is_sunday_service&&<span className="lmp-pill sunday">Sunday</span>}</div><h3>{event.name}</h3></div></div><div className="lmp-service-meta"><p><Clock3 size={14}/><time dateTime={event.starts_at}>{serviceDate(event.starts_at)}</time></p><p><MapPin size={14}/><span>{event.location||'Venue to Be Confirmed'}</span></p></div></article>)}</div>}
     {scheduleOpen&&data.service_total>12&&<nav className="lmp-pagination" aria-label="Service Pages"><span>{(data.service_page-1)*12+1}–{Math.min(data.service_page*12,data.service_total)} of {data.service_total}</span><div><button type="button" className="lmp-button" aria-label="Previous Services" disabled={loading||data.service_page===1} onClick={()=>changePage(data.service_page-1)}><ChevronLeft size={16}/></button><span>Page {data.service_page} of {pages}</span><button type="button" className="lmp-button" aria-label="Next Services" disabled={loading||data.service_page>=pages} onClick={()=>changePage(data.service_page+1)}><ChevronRight size={16}/></button></div></nav>}
    </section>
    <div className="lmp-grid">
     <section className="lmp-card lmp-profile-card" ref={profileRef} aria-labelledby="lmp-profile-title"><header className="lmp-profile-heading"><span className="lmp-avatar" aria-hidden="true">{profile.first_name[0]}{profile.last_name[0]}</span><div><p className="eyebrow">Directory Profile</p><h2 id="lmp-profile-title">{profile.first_name} {profile.last_name}</h2><span className="lmp-member-number">{profile.member_number}</span></div><span className={'lmp-pill lmp-profile-status '+profile.status}><i/>{profile.status==='active'?'Active':'Inactive'}</span></header>
      <dl className="lmp-contact-grid"><div><dt><Mail size={14}/>Email</dt><dd>{profile.email||'Not Provided'}</dd></div><div><dt><Phone size={14}/>Mobile</dt><dd>{profile.mobile||'Not Provided'}</dd></div></dl>
      <div className="lmp-affiliations"><section><h3><Church size={16}/>Churches</h3><div className="lmp-pills">{profile.churches.length?profile.churches.map(name=><span className="lmp-pill" key={name}>{name}</span>):<span className="lmp-unassigned">Not Assigned</span>}</div></section><section><h3><HandHeart size={16}/>Ministries</h3><div className="lmp-pills">{profile.ministries.length?profile.ministries.map(name=><span className="lmp-pill ministry" key={name}>{name}</span>):<span className="lmp-unassigned">Not Assigned</span>}</div></section></div>
      <div className="lmp-profile-action"><MemberProfileEditor key={profile.id} onProfileChanged={()=>{setRevision(v=>v+1);onRefreshAccess()}}/></div>
     </section>
     <section className="lmp-card lmp-qr-card" aria-labelledby="lmp-qr-card-title"><header className="lmp-qr-heading"><div><p className="eyebrow">Member Check-In</p><h2 id="lmp-qr-card-title">Your Attendance QR</h2></div><span className="lmp-qr-security"><ShieldCheck size={15}/>Private</span></header><div className="lmp-qr-body"><div className="lmp-qr-illustration" aria-hidden="true"><QrCode size={82} strokeWidth={1.4}/><span/><span/><span/><span/></div><p>Show your code to the check-in team when you attend a service.</p>{canUseQr?<button type="button" disabled={loading} ref={qrButtonRef} className="lmp-button lmp-primary lmp-qr-open" onClick={()=>{setDownloadError('');setNotice('');setQrOpen(true)}}><QrCode size={18}/>Show My QR</button>:<div className="lmp-qr-unavailable"><strong>QR Unavailable</strong><span>Ask the church team to review your member profile.</span></div>}</div><footer><ShieldCheck size={14}/><span>Keep your QR and Member ID private.</span></footer></section>
    </div>
    <div className="lmp-history-section" ref={historyRef}><MemberAttendanceHistory key={profile.id} memberId={profile.id}/></div>
    <div className="lmp-feedback-section" ref={feedbackRef}><MyFeedback key={profile.id}/></div>
   </>}
  </div>
  <div className="lmp-release-section"><WhatsNew audience={audience}/></div>
  {qrOpen&&canUseQr&&profile?.qr_token&&createPortal(<dialog ref={modalRef} className="lmp-qr-dialog" aria-labelledby="lmp-qr-title" onCancel={e=>{e.preventDefault();setQrOpen(false)}} onClick={e=>{if(e.target===e.currentTarget){const rect=e.currentTarget.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)setQrOpen(false)}}}><header className="lmp-qr-dialog-heading"><span className="lmp-qr-dialog-icon"><QrCode size={23}/></span><div><p className="eyebrow">Attendance QR</p><h2 id="lmp-qr-title">{profile.first_name} {profile.last_name}</h2><span>{profile.member_number}</span></div><button type="button" className="lmp-button lmp-close" aria-label="Close Attendance QR" onClick={()=>setQrOpen(false)}><X size={19}/></button></header><div className="lmp-qr-dialog-body"><div className="lmp-code" ref={qrRef}><QRCodeSVG value={'att:'+profile.qr_token} size={256} level="M" marginSize={4} bgColor="#ffffff" fgColor="#111111"/></div><p className="lmp-qr-instruction">Show this code to the check-in camera.</p><div className="lmp-qr-private"><ShieldCheck size={17}/><span>The QR contains a private token, not your personal details.</span></div><div className="lmp-download-actions"><button type="button" className="lmp-button lmp-primary" disabled={downloading} onClick={()=>void downloadQr('id')}><Download size={17}/>{downloading?'Preparing…':'Download Member ID'}</button><button type="button" className="lmp-button" disabled={downloading} onClick={()=>void downloadQr('qr')}><QrCode size={16}/>Download QR Only</button></div>{downloadError&&<p className="lmp-error" role="alert">{uiMessage(downloadError)}</p>}{notice&&<p className="lmp-qr-notice" role="status">{notice}</p>}</div><footer className="lmp-qr-dialog-footer"><ShieldCheck size={14}/>Keep your QR and downloaded ID private.</footer></dialog>,document.body)}
 </Container>
}
