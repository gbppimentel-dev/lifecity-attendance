// Change ID: LC-UI-COPY-v2
import { uiMessage } from '../lib/uiText'
import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Search, RefreshCw, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
type Entry={id:string;event_id:string;checked_in_at:string;service_name:string;service_date:string|null;service_location:string|null;archived:boolean}
type History={member_id:string;total:number;services:number;latest:string|null;page:number;page_size:number;rows:Entry[]}
function time(value:string){return new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(new Date(value))}
function manilaDay(){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 return ['year','month','day'].map(k=>parts.find(p=>p.type===k)?.value).join('-')
}
export default function MemberAttendanceHistory({memberId}:{memberId:string}){
 const [search,setSearch]=useState('')
 const [query,setQuery]=useState('')
 const [range,setRange]=useState('all')
 const [start,setStart]=useState('')
 const [end,setEnd]=useState('')
 const [order,setOrder]=useState('newest')
 const [page,setPage]=useState(1)
 const [revision,setRevision]=useState(0)
 const [data,setData]=useState<History|null>(null)
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const section=useRef<HTMLElement>(null)
 const day=manilaDay()
 const from=range==='month'?day.slice(0,7)+'-01':range==='today'?day:range==='custom'?start:''
 const to=range==='month'||range==='today'?day:range==='custom'?end:''
 const invalid=!!from&&!!to&&from>to
 const searching=search.trim()!==query
 useEffect(()=>{
  const timer=window.setTimeout(()=>{setQuery(search.trim());setPage(1)},300)
  return()=>window.clearTimeout(timer)
 },[search])
 useEffect(()=>{
  let active=true
  if(invalid){setData(null);setLoading(false);setError('Start date must be on or before end date.');return}
  setLoading(true);setError('')
  void(async()=>{
   try{
    const {data:result,error:failure}=await supabase.rpc('lc_my_attendance_history',{p_search:query,p_start:from||null,p_end:to||null,p_page:page,p_order:order})
    if(failure)throw failure
    if(result?.member_id!==memberId)throw new Error('Member Connection Changed')
    if(active)setData(result as History)
   }catch(e){
    if(active){
     setData(null)
     const code=(e as {code?:string}).code
     setError(code==='PGRST202'?'Attendance history is not installed yet. Ask the Owner to run LC-P03D-v1.sql.':'Could not load your attendance. Refresh access if your account or member connection changed.')
    }
   }finally{if(active)setLoading(false)}
  })()
  return()=>{active=false}
 },[memberId,query,from,to,page,order,revision,invalid])
 const filtered=!!search||range!=='all'||order!=='newest'
 function clear(){setSearch('');setQuery('');setRange('all');setStart('');setEnd('');setOrder('newest');setPage(1)}
 function changePage(next:number){setPage(next);section.current?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
 const busy=loading||searching
 const pages=Math.max(1,Math.ceil((data?.total||0)/20))
 return <section className="lmh-panel" ref={section} data-change-id="LC-UI-COPY-v2" aria-labelledby="lmh-title" aria-busy={busy}>
  <header className="lmh-heading"><div><p className="eyebrow">Your Check-In Journey</p><h2 id="lmh-title">My Attendance History</h2><p>Saved check-ins, including completed and archived services. All times in Manila.</p></div><button className="lmh-button" disabled={busy} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={15}/>Refresh</button></header>
  <div className="lmh-filters">
   <label className="lmh-search-label"><span>Find a Service</span><div className="lmh-search"><Search size={16}/><input type="search" value={search} maxLength={150} placeholder="Search Service Name" onChange={e=>{setSearch(e.target.value);setPage(1)}}/></div></label>
   <label><span>Check-In Dates</span><select value={range} onChange={e=>{setRange(e.target.value);setPage(1)}}><option value="all">All Time</option><option value="today">Today</option><option value="month">This Month</option><option value="custom">Custom Range</option></select></label>
   <label><span>Order</span><select value={order} onChange={e=>{setOrder(e.target.value);setPage(1)}}><option value="newest">Newest First</option><option value="oldest">Oldest First</option></select></label>
   {range==='custom'&&<div className="lmh-dates"><label>From<input type="date" value={start} max={end||undefined} onChange={e=>{setStart(e.target.value);setPage(1)}}/></label><label>To<input type="date" value={end} min={start||undefined} onChange={e=>{setEnd(e.target.value);setPage(1)}}/></label></div>}
   <div className="lmh-filter-footer"><span>{range==='custom'?'Dates filter check-in time. Leave either end blank for an open range.':'Search and dates work together.'}</span><button className="lmh-button" disabled={!filtered} onClick={clear}>Clear All</button></div>
  </div>
  {error&&<p className="lmh-error" role="alert">{uiMessage(error)}</p>}
  {busy?<div className="lmh-loading" role="status">Loading Your Check-Ins…<div/><div/></div>:!error&&data&&<>
   <div className="lmh-summary"><div><strong>{data.total}</strong><span>Matching Check-Ins</span></div><div><strong>{data.services}</strong><span>Services Attended</span></div><div><strong className="lmh-latest">{data.latest?time(data.latest):'—'}</strong><span>Latest Matching Check-In</span></div></div>
   {!data.rows.length?<div className="lmh-empty"><CalendarDays size={28}/><h3>{filtered?'No Matching Check-Ins':'Your Attendance Story Starts Here'}</h3><p>{filtered?'Try another service name or clear your filters.':'Your saved check-ins will appear here after the church team scans your member QR.'}</p>{filtered&&<button className="lmh-button" onClick={clear}>Clear All</button>}</div>:<div className="lmh-table-wrap"><table className="lmh-table"><thead><tr><th>Service</th><th>Service Date</th><th>Checked in</th></tr></thead><tbody>{data.rows.map(r=><tr key={r.id}><td data-label="Service"><div><strong>{r.service_name}</strong>{r.archived&&<span className="lmh-archived">Archived Service</span>}{r.service_location&&<small>{r.service_location}</small>}</div></td><td data-label="Service Date">{r.service_date?time(r.service_date):'Not Recorded'}</td><td data-label="Checked in">{time(r.checked_in_at)}</td></tr>)}</tbody></table></div>}
   <footer className="lmh-pagination"><span>{data.total?((data.page-1)*20+1)+'–'+Math.min(data.page*20,data.total)+' of '+data.total:'0 Check-Ins'} · 20 Per Page</span><nav aria-label="Attendance History Pages"><button className="lmh-button" aria-label="First Page" disabled={data.page===1} onClick={()=>changePage(1)}><ChevronsLeft size={16}/></button><button className="lmh-button" aria-label="Previous Page" disabled={data.page===1} onClick={()=>changePage(data.page-1)}><ChevronLeft size={16}/></button><span>{data.page} / {pages}</span><button className="lmh-button" aria-label="Next Page" disabled={data.page>=pages} onClick={()=>changePage(data.page+1)}><ChevronRight size={16}/></button><button className="lmh-button" aria-label="Last Page" disabled={data.page>=pages} onClick={()=>changePage(pages)}><ChevronsRight size={16}/></button></nav></footer>
  </>}
  <p className="lmh-note">Service details use the saved attendance record. Archived labels reflect the service’s current state. Contact the church team if a check-in needs correction.</p>
 </section>
}
