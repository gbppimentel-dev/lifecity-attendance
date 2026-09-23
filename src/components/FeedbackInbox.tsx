import {ResponsiveSelect} from './CompactMobile'
import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eye, EyeOff, MessageSquare, RefreshCw, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { feedbackCategories, feedbackError } from './FeedbackWidget'
type Identity={name:string;email:string|null}
type Feedback={id:string;category:string;subject:string;message:string;anonymous:boolean;identity:Identity|null;status:string;page:string;created_at:string}
type Result={rows:Feedback[];total:number;page:number;page_size:number}
const statuses=[['new','New'],['reviewing','In Progress'],['resolved','Completed'],['closed','Considered']] as const
export default function FeedbackInbox(){
 const [status,setStatus]=useState('all'),[category,setCategory]=useState('all'),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1),[revision,setRevision]=useState(0)
 const [data,setData]=useState<Result|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState<string|null>(null)
 const [identities,setIdentities]=useState<Record<string,Identity>>({}),[expanded,setExpanded]=useState<string|null>(null)
 const sequence=useRef(0),action=useRef(false),alive=useRef(true)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;sequence.current++}},[])
 useEffect(()=>{const timer=window.setTimeout(()=>{setQuery(search.trim());setPage(1)},250);return()=>clearTimeout(timer)},[search])
 useEffect(()=>{const request=++sequence.current;setLoading(true);setError('');setIdentities({});setExpanded(null)
  void (async()=>{try{const {data:next,error:failure}=await supabase.rpc('lc_feedback_page',{p_status:status,p_category:category,p_query:query,p_page:page})
   if(failure)throw failure
   if(!next||!Array.isArray(next.rows))throw Error('Invalid response')
   if(alive.current&&sequence.current===request)setData(next as Result)
  }catch(failure){if(alive.current&&sequence.current===request){setError(feedbackError(failure));setData(null)}}finally{if(alive.current&&sequence.current===request)setLoading(false)}})()
 },[status,category,query,page,revision])
 const filtering=search.trim()!==query,blocked=loading||filtering||!!busy
 async function reveal(row:Feedback){
  if(identities[row.id]){setIdentities(old=>{const copy={...old};delete copy[row.id];return copy});return}
  if(action.current||blocked)return;action.current=true;setBusy(row.id);setNotice('');const request=sequence.current
  try{const {data:identity,error:failure}=await supabase.rpc('lc_feedback_identity',{p_id:row.id});if(failure)throw failure
   if(alive.current&&sequence.current===request)setIdentities(old=>({...old,[row.id]:identity as Identity}))
  }catch(failure){if(alive.current&&sequence.current===request)setNotice(feedbackError(failure))}finally{action.current=false;if(alive.current)setBusy(null)}
 }
 async function changeStatus(row:Feedback,next:string){
  if(action.current||blocked)return;action.current=true;setBusy(row.id);setNotice('');const request=sequence.current
  try{const {error:failure}=await supabase.rpc('lc_feedback_set_status',{p_id:row.id,p_status:next});if(failure)throw failure
   if(alive.current&&sequence.current===request){setNotice(next==='resolved'?'Ticket completed. The sender will see an update on their member page.':'Ticket status updated. The sender can track this on their member page.');setRevision(v=>v+1)}
  }catch(failure){if(alive.current&&sequence.current===request)setNotice(feedbackError(failure))}finally{action.current=false;if(alive.current)setBusy(null)}
 }
 const current=data?.page??1,pages=Math.max(1,Math.ceil((data?.total??0)/20))
 return <section className="lcf-inbox" aria-labelledby="lcf-inbox-title"><header className="lcf-heading"><div><p className="eyebrow">Owner Workspace · Private Inbox</p><h1 id="lcf-inbox-title">App Feedback Tickets</h1><p>Review, work on, and complete app feedback. Status changes notify the sender in their member space.</p></div><button type="button" className="lcf-icon lc-refresh-icon" title="Refresh Feedback" aria-label="Refresh Feedback" aria-busy={loading} disabled={blocked} onClick={()=>{setNotice('');setRevision(v=>v+1)}}><RefreshCw size={18}/></button></header>
 <div className="lcf-filters"><label>Status<ResponsiveSelect value={status} disabled={!!busy} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="all">All Statuses</option>{statuses.map(([key,label])=><option key={key} value={key}>{label}</option>)}</ResponsiveSelect></label><label>Category<ResponsiveSelect value={category} disabled={!!busy} onChange={e=>{setCategory(e.target.value);setPage(1)}}><option value="all">All Categories</option>{feedbackCategories.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</ResponsiveSelect></label><label className="lcf-search-label">Search<div className="lcf-search"><Search size={17}/><input type="search" maxLength={200} value={search} disabled={!!busy} onChange={e=>setSearch(e.target.value)} placeholder="Subject or message…"/></div></label></div>
 {notice&&<p className="lcf-notice-text" role="status">{notice}</p>}
 {error?<p className="lcf-error" role="alert">{error}</p>:loading||filtering?<p className="lcf-empty" role="status">Loading Feedback…</p>:!data?.rows.length?<div className="lcf-empty"><MessageSquare size={28}/><p>No Feedback Matches This View.</p></div>:<div className="lcf-feedback-list">{data.rows.map(row=>{
  const identity=row.anonymous?identities[row.id]:row.identity
  return <article key={row.id} className={"lcf-feedback-card lcf-ticket-card "+row.status}><div className="lcf-feedback-meta"><span className={"lcf-ticket-status "+row.status}>{statuses.find(([key])=>key===row.status)?.[1]??row.status}</span><span className="lcf-ticket-number">#{row.id.slice(0,8).toUpperCase()}</span><span className="lcf-tag">{feedbackCategories.find(c=>c.value===row.category)?.label??row.category}</span><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString()}</time></div>
  <button type="button" className="lcf-subject" aria-expanded={expanded===row.id} onClick={()=>setExpanded(expanded===row.id?null:row.id)}>{row.subject}<ChevronRight size={18}/></button>
  <div className="lcf-sender"><span>{identity?<><strong>{identity.name}</strong>{identity.email&&<small>{identity.email}</small>}</>:<strong title="Sender requested identity masking">* Identity Hidden</strong>}</span>{row.anonymous&&<button type="button" className="lcf-icon" disabled={blocked} aria-label={identity?'Hide Sender Identity':'Reveal Sender Identity'} title={identity?'Hide Sender Identity':'Reveal Sender Identity'} aria-pressed={!!identity} onClick={()=>void reveal(row)}>{identity?<EyeOff size={17}/>:<Eye size={17}/>}</button>}</div>
  {expanded===row.id&&<div className="lcf-detail"><p>{row.message}</p>{row.page&&<small>Submitted From: {row.page}</small>}{row.anonymous&&<small>* The sender requested masking. The form explains that the Owner can reveal their identity.</small>}</div>}
  <div className="lcf-ticket-controls">{row.status!=='resolved'&&<button type="button" className="lcf-ticket-action" disabled={blocked} onClick={()=>void changeStatus(row,'resolved')}><CheckCircle2 size={16}/>Mark Complete</button>}<label className="lcf-status">Status<ResponsiveSelect value={row.status} disabled={blocked} onChange={e=>void changeStatus(row,e.target.value)}>{statuses.map(([key,label])=><option key={key} value={key}>{label}</option>)}</ResponsiveSelect></label></div>
  </article>
 })}</div>}
 <footer className="lcf-pagination"><span>{data?.total??0} Reports · Page {current} of {pages}</span><nav aria-label="Feedback Pages">{[{label:'First Page',icon:ChevronsLeft,n:1,off:current===1},{label:'Previous Page',icon:ChevronLeft,n:current-1,off:current===1},{label:'Next Page',icon:ChevronRight,n:current+1,off:current>=pages},{label:'Last Page',icon:ChevronsRight,n:pages,off:current>=pages}].map(({label,icon:Icon,n,off})=><button type="button" className="lcf-icon" key={label} title={label} aria-label={label} disabled={blocked||!!error||off} onClick={()=>setPage(n)}><Icon size={17}/></button>)}</nav></footer>
 </section>
}
