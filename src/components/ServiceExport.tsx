// Change ID: LC-P08B-v1
import { useEffect, useRef, useState } from 'react'
import { Download, FileSearch, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { csvCell } from '../lib/memberCsv'
type ServiceRow={id:string;name:string;starts_at:string;ends_at:string|null;location:string|null;created_at:string;archived_at:string|null;is_sunday_service:boolean;is_public:boolean;admin_note:string|null;state:string;check_ins:number;unique_members:number}
function manila(value:string){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]))
 return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}
export function serviceCsv(rows:ServiceRow[],detailed:boolean,asOf:string){
 const headings=['Service Name','Starts At (Manila)','Service State','Archived','Location','Sunday Service','Check-Ins','Unique Members','Guest Preview']
 if(detailed)headings.push('Service ID','Starts At (UTC)','Ends At (UTC)','Created At (UTC)','Archived At (UTC)','Admin Note','Exported At (UTC)')
 const utc=(v:string|null)=>v?new Date(v).toISOString():''
 const lines=[headings,...rows.map(r=>{
  const row:unknown[]=[r.name,manila(r.starts_at),r.state,r.archived_at?'Yes':'No',r.location??'',r.is_sunday_service?'Yes':'No',r.check_ins,r.unique_members,r.is_public?'Yes':'No']
  if(detailed)row.push(r.id,utc(r.starts_at),utc(r.ends_at),utc(r.created_at),utc(r.archived_at),r.admin_note??'',utc(asOf))
  return row
 })]
 return '\uFEFF'+lines.map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n'
}
export default function ServiceExport({archive,month,year,sort,search='',disabled=false}:{archive:'all'|'active'|'archived';month:string;year:string;sort:'recent'|'oldest';search?:string;disabled?:boolean}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
 const panelRef=useRef<HTMLDetailsElement>(null),summaryRef=useRef<HTMLElement>(null)
 const alive=useRef(true),lock=useRef(false)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 async function download(detailed:boolean){
  if(lock.current||disabled)return
  lock.current=true;setBusy(true);setMessage('');setError('')
  try{
   const {data,error:failure}=await supabase.rpc('lc_export_services_v2',{p_archive:archive,p_month:month?Number(month):null,p_year:year?Number(year):null,p_sort:sort,p_detailed:detailed,p_search:search})
   if(failure)throw failure;if(!alive.current)return
   if(!data||!Array.isArray(data.rows)||typeof data.as_of!=='string')throw new Error('Invalid service export response')
   if(!data.rows.length){setMessage('No services match these filters.');return}
   const content=serviceCsv(data.rows as ServiceRow[],detailed,data.as_of)
   const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8;'}))
   const link=document.createElement('a');link.href=url;link.download=`LifeCity-Services-${detailed?'Detailed':'Quick'}-${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(link)
   try{link.click()}finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30000)}
   setMessage(`CSV prepared with ${data.rows.length.toLocaleString()} matching services. Your browser handles the download.`)
  }catch(failure){if(alive.current)setError((failure as {code?:string}).code==='P0001'?(failure as {message:string}).message:'Could not export services. Confirm LC-P08B-v1.sql is installed and your admin access is active, then try again.')}
  finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 return <>
  <style>{`
    body .lc-service-export-v2 {margin:24px 24px 24px;border:1px solid #d5e8e2;border-radius:20px;background:linear-gradient(115deg,#effaf6,#f9f7ff);color:#315b53;overflow:hidden;}
    body .lc-service-export-v2 > summary {display:flex;align-items:center;gap:10px;min-height:52px;padding:16px 22px;cursor:pointer;list-style:none;font-size:14px;font-weight:650;}
    body .lc-service-export-v2 > summary::-webkit-details-marker {display:none;}
    body .lc-service-export-v2 > summary::after {content:'+';margin-left:auto;font-size:21px;font-weight:400;}
    body .lc-service-export-v2 > summary small {font-size:12px;font-weight:400;color:#789389;}
    body .lc-service-export-v2[open] > summary {display:none;}
    body .lc-service-export-v2 .lcse-body {padding:24px;}
    body .lc-service-export-v2 .lcse-heading {display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:22px;}
    body .lc-service-export-v2 .lcse-kicker {margin:0 0 7px;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#2c8a7e;}
    body .lc-service-export-v2 h3 {margin:0 0 7px;font-size:23px;line-height:1.3;color:#315b53;letter-spacing:-.025em;}
    body .lc-service-export-v2 .lcse-subtitle {margin:0;font-size:13px;line-height:1.6;color:#76918a;}
    body .lc-service-export-v2 .lcse-close {display:grid;place-items:center;flex:0 0 38px;height:38px;padding:0;border:1px solid #d3e7e0;border-radius:12px;background:white;color:#59877d;cursor:pointer;}
    body .lc-service-export-v2 .lcse-options {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;}
    body .lc-service-export-v2 .lcse-choice {display:flex;align-items:flex-start;gap:16px;width:100%;min-width:0;min-height:126px;padding:23px;border:1px solid #c9e5dc;border-radius:17px;background:white;color:#207f72;box-shadow:0 6px 0 #dcece6;text-align:left;font:inherit;cursor:pointer;transition:transform .2s ease,box-shadow .2s ease;}
    body .lc-service-export-v2 .lcse-choice > svg {flex-shrink:0;margin-top:3px;}
    body .lc-service-export-v2 .lcse-choice > span {display:grid;gap:9px;min-width:0;}
    body .lc-service-export-v2 .lcse-choice strong {font-size:19px;line-height:1.3;}
    body .lc-service-export-v2 .lcse-choice small {font-size:13px;line-height:1.6;color:#789087;font-weight:400;}
    body .lc-service-export-v2 .lcse-detailed {border-color:#e0d5f5;color:#8064b1;}
    body .lc-service-export-v2 .lcse-hint {margin:24px 0 0;font-size:12px;color:#82918b;line-height:1.7;}
    body .lc-service-export-v2 .lcse-message {margin:14px 0 0;font-size:13px;line-height:1.6;color:#367b66;}
    body .lc-service-export-v2 .lcse-error {color:#ad4e4e;}
    body .lc-service-export-v2 button:disabled {opacity:.55;cursor:not-allowed;transform:none;}
    body .lc-service-export-v2 :is(button,summary):focus-visible {outline:2px solid #388c7c;outline-offset:3px;}
    @media(hover:hover) and (pointer:fine) {
      body .lc-service-export-v2 .lcse-choice:hover:not(:disabled) {transform:translateY(-3px);box-shadow:0 9px 0 #dcece6;}
      body .lc-service-export-v2 .lcse-close:hover {background:#edf7f2;}
    }
    @media(max-width:700px) {
      body .lc-service-export-v2 {margin:20px 16px 20px;}
      body .lc-service-export-v2 .lcse-body {padding:18px;}
      body .lc-service-export-v2 .lcse-options {grid-template-columns:minmax(0,1fr);gap:16px;}
      body .lc-service-export-v2 .lcse-choice {padding:18px;min-height:110px;}
      body .lc-service-export-v2 > summary {flex-wrap:wrap;padding:16px;}
      body .lc-service-export-v2 > summary small {display:none;}
      body .lc-service-export-v2 .lcse-close {flex-basis:44px;height:44px;}
    }
    @media(prefers-reduced-motion:reduce) {
      body .lc-service-export-v2 .lcse-choice {transition:none;}
      body .lc-service-export-v2 .lcse-choice:hover:not(:disabled) {transform:none;}
    }
  `}</style>
  <details className="lc-service-export-v2" ref={panelRef}>
    <summary ref={summaryRef}><Download size={17}/><span>Export Services</span><small>Current filters · All matching services</small></summary>
    <div className="lcse-body">
      <header className="lcse-heading">
        <div><p className="lcse-kicker">CSV Export Center</p><h3>Your Services, Ready to Share</h3><p className="lcse-subtitle">All matching services · All pages · Current filters and sort order</p></div>
        <button type="button" className="lcse-close" aria-label="Close service export panel" onClick={()=>{if(panelRef.current)panelRef.current.open=false;summaryRef.current?.focus()}}><X size={19}/></button>
      </header>
      <div className="lcse-options">
        <button type="button" className="lcse-choice" disabled={busy||disabled} onClick={()=>void download(false)}><Download size={25}/><span><strong>Quick CSV</strong><small>9 core columns · Service name, date, status, location, service flags, and attendance totals.</small></span></button>
        <button type="button" className="lcse-choice lcse-detailed" disabled={busy||disabled} onClick={()=>void download(true)}><FileSearch size={25}/><span><strong>Detailed CSV</strong><small>16 reporting fields · Everything in Quick CSV, plus service ID, UTC timestamps, and private admin notes.</small></span></button>
      </div>
      <p className="lcse-hint">Includes upcoming and archived services when they match your filters. For historical check-in snapshots, use Records. Up to 10,000 services per export.</p>
      {busy&&<p className="lcse-message" role="status">Preparing your service export…</p>}
      {message&&<p className="lcse-message" role="status">{message}</p>}
      {error&&<p className="lcse-message lcse-error" role="alert">{error}</p>}
    </div>
  </details>
 </>
}
