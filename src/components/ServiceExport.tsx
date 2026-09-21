// Change ID: LC-P08B-v1
import { useEffect, useRef, useState } from 'react'
import ExportPanel from './ExportPanel'
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
 return <ExportPanel label="Export Services" title="Your Services, Ready to Share"
  subtitle="All matching services · All pages · Current filters and sort order"
  quick="9 core columns · Service name, date, status, location, service flags, and attendance totals."
  detailed="16 reporting fields · Everything in Quick CSV, plus service ID, UTC timestamps, and private admin notes."
  hint="Includes upcoming and archived services when they match your filters. For historical check-in snapshots, use Records. Up to 10,000 services per export."
  disabled={busy||disabled} onQuick={()=>void download(false)} onDetailed={()=>void download(true)}>
  {busy&&<p className="lcse-message" role="status">Preparing your service export…</p>}
  {message&&<p className="lcse-message" role="status">{message}</p>}
  {error&&<p className="lcse-message lcse-error" role="alert">{error}</p>}
 </ExportPanel>
}
