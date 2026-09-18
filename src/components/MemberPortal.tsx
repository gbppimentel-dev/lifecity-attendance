// Change ID: LC-UI-COPY-v2
import { uiMessage } from '../lib/uiText'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Users, CalendarDays, MapPin, Download, RefreshCw, LogOut, QrCode, X, ChevronLeft, ChevronRight } from 'lucide-react'
import MemberAttendanceHistory from './MemberAttendanceHistory'
import { MemberProfileEditor } from './ProfileChanges'
import { supabase } from '../lib/supabase'

type Profile={id:string;member_number:string;first_name:string;last_name:string;email:string|null;mobile:string|null;status:'active'|'inactive';qr_token:string|null;churches:string[];ministries:string[]}
type Service={id:string;name:string;starts_at:string;location:string|null;is_sunday_service:boolean;state:'upcoming'|'in-progress';available_until:string}
type Portal={profile:Profile;services:Service[];service_total:number;service_page:number;server_time:string}
const serviceDate=(value:string)=>new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value))

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

export default function MemberPortal({embedded=false,onRefreshAccess,onSignOut,signingOut=false,authError=''}:{embedded?:boolean;onRefreshAccess:()=>void;onSignOut?:()=>void;signingOut?:boolean;authError?:string}) {
 const [data,setData]=useState<Portal|null>(null)
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [page,setPage]=useState(1)
 const [revision,setRevision]=useState(0)
 const [qrOpen,setQrOpen]=useState(false)
 const [downloading,setDownloading]=useState(false)
 const [downloadError,setDownloadError]=useState('')
 const [notice,setNotice]=useState('')
 const qrRef=useRef<HTMLDivElement>(null)
 const servicesRef=useRef<HTMLElement>(null)
 const qrButtonRef=useRef<HTMLButtonElement>(null)
 const modalRef=useRef<HTMLDivElement>(null)
 const refreshing=useRef(false)
 const currentData=useRef<Portal|null>(null)
 currentData.current=data

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
     if(currentData.current && (currentData.current.profile.id!==result.profile.id || currentData.current.profile.qr_token!==result.profile.qr_token))setQrOpen(false)
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
 useEffect(()=>{
  if(!qrOpen)return
  const oldOverflow=document.body.style.overflow
  document.body.style.overflow='hidden'
  const dialog=modalRef.current
  dialog?.querySelector<HTMLButtonElement>('button')?.focus()
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){setQrOpen(false);return}
   if(e.key==='Tab'){
    const items=dialog?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    if(!items?.length)return
    const first=items[0],last=items[items.length-1]
    if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus()}
   }
  }
  document.addEventListener('keydown',key)
  return ()=>{document.body.style.overflow=oldOverflow;document.removeEventListener('keydown',key);qrButtonRef.current?.focus()}
 },[qrOpen])
 async function downloadQr(kind:'qr'|'id'='qr'){
  if(refreshing.current || !data?.profile.qr_token)return
  const svg=qrRef.current?.querySelector('svg')
  if(!svg)return
  refreshing.current=true;setDownloading(true);setDownloadError('');setNotice('')
  let url=''
  try {
   // Recheck the signed-in member before producing an identifying download.
   const {data:latest,error:failure}=await supabase.rpc('lc_my_member_portal',{p_service_page:1})
   if(failure || !latest?.profile?.qr_token || latest.profile.id!==data.profile.id || latest.profile.qr_token!==data.profile.qr_token) {
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
   const output=URL.createObjectURL(blob),a=document.createElement('a')
   a.href=output;a.download=(kind==='id'?'LifeCity-Member-ID-':'LifeCity-QR-')+exportProfile.member_number.replace(/[^a-zA-Z0-9_-]/g,'')+'.png'
   document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(output),1000)
   setNotice(kind==='id'?'Your member ID download is ready.':'Your QR download is ready.')
  } catch(e) {setDownloadError(e instanceof Error && e.message.startsWith('Your member connection')?e.message:'Could not prepare your download. Please try again.')}
  finally {if(url)URL.revokeObjectURL(url);refreshing.current=false;setDownloading(false)}
 }
 function changePage(next:number){setPage(next);servicesRef.current?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
 const profile=data?.profile
 const pages=Math.max(1,Math.ceil((data?.service_total??0)/12))
 const Container=embedded?'div':'main'
 return <Container className={'lc-member-space'+(embedded?' is-embedded':'')} data-change-id="LC-UI-COPY-v2">
  {!embedded && <header className="lmp-topbar"><div className="brand"><div className="brand-icon small"><Users size={20}/></div><span>LifeCity Attendance</span></div><button className="lmp-button lmp-signout" disabled={signingOut} onClick={onSignOut}><LogOut size={16}/>{signingOut?'Signing Out…':'Sign Out'}</button></header>}
  <div className="lmp-content">
   {authError && <p className="lmp-error" role="alert">{uiMessage(authError)}</p>}
   <section className="lmp-hero"><div><p className="eyebrow">Your LifeCity Space</p><h1>{profile?'Hi, '+profile.first_name+'.':'Welcome to Your Member Space.'}</h1><p>Your profile, your attendance QR, and what’s coming up at church.</p></div><button className="lmp-button" disabled={loading} onClick={()=>{setRevision(v=>v+1);onRefreshAccess()}}><RefreshCw size={16}/>Refresh Access</button></section>
   {loading ? <div className="lmp-loading" role="status">Opening Your Member Profile…<div className="lmp-skeleton"/><div className="lmp-skeleton"/></div> : error ? <div className="lmp-error" role="alert">{uiMessage(error)}</div> : profile && data && <>
    <div className="lmp-grid">
     <section className="lmp-card"><div className="lmp-profile-heading"><p className="eyebrow">Your Directory Profile</p><div className="lmp-name-line"><h2>{profile.first_name} {profile.last_name}</h2><span className={'lmp-pill '+profile.status}>{profile.status === 'active' ? 'Active' : 'Inactive'}</span></div></div>
      <dl className="lmp-profile"><div><dt>Member Number</dt><dd>{profile.member_number}</dd></div><div><dt>Email</dt><dd>{profile.email||'Not Provided'}</dd></div><div><dt>Mobile</dt><dd>{profile.mobile||'Not Provided'}</dd></div><div><dt>Churches</dt><dd className="lmp-pills">{profile.churches.length?profile.churches.map(n=><span className="lmp-pill" key={n}>{n}</span>):'Not Assigned'}</dd></div><div><dt>Ministries</dt><dd className="lmp-pills">{profile.ministries.length?profile.ministries.map(n=><span className="lmp-pill ministry" key={n}>{n}</span>):<span className="lmp-pill">None</span>}</dd></div></dl>
      <MemberProfileEditor onProfileChanged={()=>{setRevision(v=>v+1);onRefreshAccess()}}/>
     </section>
     <section className="lmp-card lmp-qr-card"><span className="lmp-qr-mark"><QrCode size={34}/></span><p className="eyebrow">Ready When You Arrive</p><h2>Your Attendance QR</h2><p>Show your personal code to the check-in team when you attend a service.</p>
      {profile.qr_token ? <button ref={qrButtonRef} className="lmp-button lmp-primary" onClick={()=>{setDownloadError('');setNotice('');setQrOpen(true)}}><QrCode size={18}/>Show My QR</button> : <p className="lmp-help">Your directory profile is inactive. Ask the registration team to review it before using an attendance QR.</p>}
      <small>View your code or download your Member ID. Keep both private.</small>
     </section>
    </div>
    <MemberAttendanceHistory key={profile.id} memberId={profile.id}/>
    <section className="lmp-services" ref={servicesRef}><div className="lmp-section-head"><div><p className="eyebrow">Gather with Us</p><h2>Coming Up at LifeCity</h2><p>Current and upcoming services · times in Manila</p></div><span className="lmp-pill">{data.service_total} Services</span></div>
     {data.services.length===0 ? <div className="lmp-card lmp-empty"><CalendarDays size={28}/><h3>No services scheduled yet</h3><p>Check back here for the next gathering.</p></div> : <div className="lmp-service-grid lmp-balanced-services" data-count={data.services.length}>{data.services.map(event=><article className="lmp-service-card" key={event.id}><div className="lmp-pills"><span className={'lmp-pill '+event.state}>{event.state==='in-progress'?'In Progress':'Upcoming'}</span>{event.is_sunday_service && <span className="lmp-pill ministry">Sunday Service</span>}</div><h3>{event.name}</h3><p><CalendarDays size={16}/><span>{serviceDate(event.starts_at)}</span></p><p><MapPin size={16}/><span>{event.location||'Ask the church team for the venue'}</span></p></article>)}</div>}
     {data.service_total>12 && <nav className="lmp-pagination" aria-label="Service Pages"><button className="lmp-button" disabled={data.service_page===1} onClick={()=>changePage(data.service_page-1)}><ChevronLeft size={16}/>Previous</button><span>{data.service_page} / {pages}</span><button className="lmp-button" disabled={data.service_page>=pages} onClick={()=>changePage(data.service_page+1)}>Next<ChevronRight size={16}/></button></nav>}
    </section>
   </>}
  </div>
  {qrOpen && profile?.qr_token && createPortal(<div className="lmp-overlay" onClick={e=>{if(e.target===e.currentTarget)setQrOpen(false)}}><div className="lmp-dialog" role="dialog" aria-modal="true" aria-labelledby="lmp-qr-title" ref={modalRef}><button className="lmp-close lmp-button" aria-label="Close Attendance QR" onClick={()=>setQrOpen(false)}><X size={18}/></button><p className="eyebrow">Your Personal Check-In</p><h2 id="lmp-qr-title">Scan. Smile. You’re Here.</h2><p>{profile.first_name} {profile.last_name}</p><div className="lmp-code" ref={qrRef}><QRCodeSVG value={'att:'+profile.qr_token} size={240} level="M" marginSize={4} bgColor="#ffffff" fgColor="#123b32"/></div><p className="lmp-member-number">{profile.member_number}</p><div className="lmp-download-actions"><button className="lmp-button lmp-primary" disabled={downloading} onClick={()=>void downloadQr('id')}><Download size={17}/>{downloading?'Preparing…':'Download Member ID'}</button><button className="lmp-button" disabled={downloading} onClick={()=>void downloadQr('qr')}><Download size={16}/>Download QR Only</button></div>{downloadError && <p className="lmp-error" role="alert">{uiMessage(downloadError)}</p>}{notice && <p role="status">{notice}</p>}<small>Private member QR · Keep it safe</small></div></div>,document.body)}
 </Container>
}
