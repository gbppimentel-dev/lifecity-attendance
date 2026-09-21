import { useEffect, useRef, useState } from 'react'
import { Bell, Check, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { feedbackError } from './FeedbackWidget'
type Ticket={id:string;subject:string;status:string;updated_at:string;status_revision:number;unread:boolean}
type Result={rows:Ticket[];total:number;unread:number;page:number}
const labels:Record<string,string>={new:'New',reviewing:'In Progress',resolved:'Completed',closed:'Considered'}
export default function MyFeedback(){
 const section=useRef<HTMLElement>(null),scrollPending=useRef(false)
 const [data,setData]=useState<Result|null>(null),[page,setPage]=useState(1),[revision,setRevision]=useState(0),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState<string|null>(null)
 useEffect(()=>{
  let active=true,inFlight=false
  async function load(){if(inFlight)return;inFlight=true;setLoading(true)
   try{const {data:next,error:failure}=await supabase.rpc('lc_my_feedback',{p_page:page});if(failure)throw failure;if(active){setData(next as Result);setError('')}}
   catch(e){if(active)setError(feedbackError(e))}finally{inFlight=false;if(active)setLoading(false)}
  }
  void load();const refresh=()=>{if(document.visibilityState==='visible')void load()}
  const timer=window.setInterval(refresh,30000);window.addEventListener('focus',refresh);window.addEventListener('lc-feedback-sent',refresh)
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('lc-feedback-sent',refresh)}
 },[page,revision])
 async function read(row:Ticket){setBusy(row.id);setError('');try{const {error:failure}=await supabase.rpc('lc_read_feedback',{p_id:row.id,p_revision:row.status_revision});if(failure)throw failure;setRevision(v=>v+1)}catch(e){setError(feedbackError(e))}finally{setBusy(null)}}
 const current=data?.page??1,pages=Math.max(1,Math.ceil((data?.total??0)/10))
 function go(next:number){scrollPending.current=true;setPage(next)}
 useEffect(()=>{if(!loading&&scrollPending.current){scrollPending.current=false;section.current?.scrollIntoView({block:"start",behavior:"auto"})}},[loading,data,error])
 return <section ref={section} className="lc-my-feedback" aria-label="My App Feedback"><header><div><p className="eyebrow">LifeCity Attendance · Your Tickets</p><h2><Bell size={21}/>My App Feedback</h2><p role="status">{data?.unread?`${data.unread} unread ticket ${data.unread===1?'update':'updates'}`:'Track your suggestions and bug reports here.'}</p></div><button className="lcf-icon" aria-label="Refresh My Feedback" disabled={loading||!!busy} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={17}/></button></header>
 {error&&<p className="lcf-error" role="alert">{error}</p>}
 {!data&&loading&&<p>Loading Your Tickets…</p>}
 {data?.rows.length===0&&<p className="lc-release-stage">An idea or a bug? Use the feedback icon to send your first ticket.</p>}
 <div className="lc-my-ticket-list" aria-busy={loading}>{data?.rows.map(row=><article key={row.id} className={row.unread?'is-unread':''}><div className="lcf-feedback-meta"><span className={'lcf-ticket-status '+row.status}>{labels[row.status]??row.status}</span><small>#{row.id.slice(0,8).toUpperCase()}</small></div><h3>{row.subject}</h3><p>{row.status==='resolved'?'Your request has been implemented. Check the What’s New section for completed requests and app updates.':row.status==='reviewing'?'Your feedback is being reviewed and worked on.':row.status==='closed'?'Your idea has been considered and saved for possible future improvements.': 'Your feedback is in the queue.'}</p><div className="lc-ticket-bottom"><time dateTime={row.updated_at}>{new Date(row.updated_at).toLocaleString()}</time>{row.unread&&<button className="lcf-ticket-action" disabled={loading||!!busy||!!error} onClick={()=>void read(row)}><Check size={15}/>{busy===row.id?'Saving…':'Mark as Read'}</button>}{!row.unread&&<span className="lc-ticket-read"><Check size={15}/>Up to Date</span>}</div></article>)}</div>
 <footer className="lcf-pagination"><span>{data?.total??0} Tickets · {current} / {pages}</span><nav aria-label="My Feedback Pages">{[{label:'First Page',Icon:ChevronsLeft,n:1,off:current===1},{label:'Previous Page',Icon:ChevronLeft,n:current-1,off:current===1},{label:'Next Page',Icon:ChevronRight,n:current+1,off:current>=pages},{label:'Last Page',Icon:ChevronsRight,n:pages,off:current>=pages}].map(({label,Icon,n,off})=><button key={label} className="lcf-icon" aria-label={label} title={label} disabled={loading||!!busy||!!error||!data||off} onClick={()=>go(n)}><Icon size={17}/></button>)}</nav></footer>
 </section>
}
