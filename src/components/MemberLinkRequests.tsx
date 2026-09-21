// Change ID: LC-P08I-v1
// Change ID: LC-UI-COPY-v2
import { uiMessage, uiStatus } from '../lib/uiText'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { RefreshCw, Search, Link2, Check, X, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react'
import { supabase } from '../lib/supabase'

type RequestRow = {
 id:string; user_id:string; full_name:string; member_number:string; contact:string; church:string;
 status:'pending'|'approved'|'declined'|'cancelled'; review_note:string; created_at:string; updated_at:string;
 email?:string; account_status?:string; account_updated_at?:string; linked_member_id?:string|null;
}
type Candidate = {id:string;first_name:string;last_name:string;member_number:string;email:string|null;mobile:string|null;status:string;updated_at:string;already_linked:boolean}
const dateLabel=(value:string)=>new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(new Date(value))
function message(error:unknown) {
 const e=error as {code?:string;message?:string}
 if(e.code==='PGRST202') return 'Member requests are not installed yet. Ask the Owner to run LC-P02C-v1.sql.'
 return e.code==='P0001' ? e.message || 'Refresh and try again.' : 'Unable to complete this action. Refresh to check the latest status before trying again.'
}
export default function MemberLinkRequests({owner=false,linked=false,onChanged}:{owner?:boolean;linked?:boolean;onChanged:()=>void}) {
 const [rows,setRows]=useState<RequestRow[]>([])
 const [status,setStatus]=useState('pending')
 const [requestSearch,setRequestSearch]=useState('')
 const [requestQuery,setRequestQuery]=useState('')
 const searching=owner && requestSearch.trim()!==requestQuery
 useEffect(()=>{if(!owner)return;const timer=window.setTimeout(()=>setRequestQuery(requestSearch.trim()),300);return()=>window.clearTimeout(timer)},[owner,requestSearch])
 const [page,setPage]=useState(1)
 const [total,setTotal]=useState(0)
 const [pendingCount,setPendingCount]=useState(0)
 const [actualPage,setActualPage]=useState(1)
 const [loading,setLoading]=useState(true)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [revision,setRevision]=useState(0)
 const [review,setReview]=useState<RequestRow|null>(null)
 const [cancel,setCancel]=useState<string|null>(null)
 const [form,setForm]=useState({name:'',number:'',contact:'',church:''})
 const writeLock=useRef(false)
 const heading=useRef<HTMLElement>(null)
 useEffect(()=>{
  let active=true
  setLoading(true);setError('');setReview(null);setCancel(null)
  void (async()=>{
   try {
    const {data,error:failure}=owner
     ? await supabase.rpc('lc_owner_member_requests_search',{p_status:status,p_page:page,p_search:requestQuery})
     : await supabase.rpc('lc_my_member_requests')
    if(failure) throw failure
    if(active) {
     setRows(owner?data.rows:data);setTotal(owner?data.total:data.length)
     setPendingCount(owner?data.pending:0);setActualPage(owner?data.page:1)
    }
   } catch(e){if(active){setError(owner ? 'Could not load member requests. Refresh and try again.' : message(e));setRows([])}}
   finally {if(active)setLoading(false)}
  })()
  return ()=>{active=false}
 },[owner,status,page,revision,linked,requestQuery])
 async function mutate(action:()=>PromiseLike<{error:unknown}>,success:string) {
  if(writeLock.current)return
  writeLock.current=true;setSaving(true);setError('');setNotice('')
  try {
   const {error:failure}=await action()
   if(failure)throw failure
   setNotice(success);setRevision(v=>v+1);onChanged()
  } catch(e){setError(message(e));setCancel(null)}
  finally {writeLock.current=false;setSaving(false)}
 }
 function submit(e:FormEvent) {
  e.preventDefault()
  void mutate(()=>supabase.rpc('lc_submit_member_request',{p_full_name:form.name.trim(),p_member_number:form.number.trim(),p_contact:form.contact.trim(),p_church:form.church.trim()}),'Request sent. Your church team will review the details.')
 }
 const pending=rows.find(r=>r.status==='pending')
 const last=rows[0]
 const pages=Math.max(1,Math.ceil(total/25))
 function turn(next:number){setPage(next);heading.current?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
 return <section className={'lcr-panel'+(owner?' lcr-owner':'')} ref={heading} data-change-id="LC-UI-COPY-v2">
  <header className="lcr-heading"><div><p className="eyebrow">{owner?'Verified Connections':'Your Existing Church Profile'}</p><h2>{owner?'Member Link Requests':'Connect Your Member Profile'}</h2><p>{owner?'Review the submitted details before connecting an account.': 'Already registered? Ask us to connect your login to your existing member record.'}</p></div><button type="button" className="lcr-button lc-refresh-icon" aria-label="Refresh member link requests" title="Refresh member link requests" aria-busy={loading} disabled={loading||saving} onClick={()=>{setRevision(v=>v+1);onChanged()}}><RefreshCw size={17} aria-hidden="true"/></button></header>
  {owner && <div className="lcr-toolbar"><label>Requests<select value={status} disabled={saving} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="pending">Pending Review</option><option value="approved">Approved</option><option value="declined">Declined</option><option value="cancelled">Cancelled</option><option value="all">All Requests</option></select></label><span aria-live="polite">{loading||searching ? 'Updating…' : `${pendingCount} Pending · ${total} Matching`}</span></div>}
  {owner && <div className="lcq-search-row"><label className="lcq-search"><Search size={17} aria-hidden="true"/><input type="search" aria-label="Search Member Link Requests" placeholder="Name, Email, or Member ID" disabled={saving} value={requestSearch} onChange={e=>{setRequestSearch(e.target.value);setPage(1);setReview(null);setCancel(null)}}/></label>{requestSearch && <button type="button" className="lcr-button" disabled={saving} onClick={()=>{setRequestSearch('');setRequestQuery('');setPage(1);setReview(null)}}>Clear Search</button>}</div>}
  {notice && <p className="lcr-notice" role="status">{notice}</p>}
  {error && <p className="lcr-error" role="alert">{uiMessage(error)}</p>}
  {loading || searching ? <p className="lcr-empty" role="status">Loading Requests…</p> : !error && (owner ? <>
   {rows.length===0 && <p className="lcr-empty">{requestQuery ? 'No requests match this search. Try another name, email, or member ID.' : `No ${status==='all'?'':status+' '}requests to show.`}</p>}
   {rows.map(r=><article className="lcr-request" key={r.id}>
    <div className="lcr-row-title"><div><strong>{r.full_name}</strong><span>{r.email}</span></div><span className={'lcr-status '+r.status}>{r.status==='pending'?'Pending Review':uiStatus(r.status)}</span></div>
    <dl className="lcr-details"><div><dt>Member Number Supplied</dt><dd>{r.member_number||'Not Supplied'}</dd></div><div><dt>Contact Supplied</dt><dd>{r.contact||'Not Supplied'}</dd></div><div><dt>Church Supplied</dt><dd>{r.church||'Not Supplied'}</dd></div><div><dt>Submitted · Manila</dt><dd>{dateLabel(r.created_at)}</dd></div></dl>
    {r.review_note && <p className="lcr-review-note">Message to Applicant: {r.review_note}</p>}
    {r.status==='pending' && <>{r.linked_member_id && <p className="lcr-review-note">This account is already linked. Review and decline this outstanding request if it is no longer needed.</p>}{r.account_status==='suspended' && <p className="lcr-review-note">Access is paused. Approval requires an active account.</p>}
    {review?.id===r.id ? <RequestReview request={r} onCancel={()=>setReview(null)} onBusy={setSaving} onDone={()=>{setReview(null);setRevision(v=>v+1);onChanged();setNotice('Request reviewed successfully.')}}/> : <button className="lcr-button" disabled={saving} onClick={()=>setReview(r)}><Link2 size={15}/>Review Request</button>}</>}
   </article>)}
   <footer className="lcr-pagination"><span>Page {actualPage} of {pages} · 25 Per Page</span><div><button type="button" className="lcr-button lc-page-icon" aria-label="First page" title="First page" disabled={saving||loading||searching||actualPage===1} onClick={()=>turn(1)}><ChevronsLeft size={17} aria-hidden="true"/></button><button type="button" className="lcr-button lc-page-icon" aria-label="Previous page" title="Previous page" disabled={saving||loading||searching||actualPage===1} onClick={()=>turn(actualPage-1)}><ChevronLeft size={17} aria-hidden="true"/></button><button type="button" className="lcr-button lc-page-icon" aria-label="Next page" title="Next page" disabled={saving||loading||searching||actualPage>=pages} onClick={()=>turn(actualPage+1)}><ChevronRight size={17} aria-hidden="true"/></button><button type="button" className="lcr-button lc-page-icon" aria-label="Last page" title="Last page" disabled={saving||loading||searching||actualPage>=pages} onClick={()=>turn(pages)}><ChevronsRight size={17} aria-hidden="true"/></button></div></footer>
  </> : <>
   {last && <div className="lcr-request"><span className={'lcr-status '+last.status}>{last.status==='pending'?'Pending Review':uiStatus(last.status)}</span><p><strong>{last.full_name}</strong>{last.member_number?' · '+last.member_number:''}</p><p className="lcr-meta">{dateLabel(last.created_at)} · Manila</p>
    {last.review_note && <p className="lcr-review-note">{last.review_note}</p>}
    {last.status==='approved' && <p>Your request was approved. Refresh access to see your current profile connection.</p>}
    {pending && <><p>Your details are waiting for review. No new member record has been created.</p>{cancel===pending.id ? <div className="lcr-actions"><span>Cancel This Request?</span><button className="lcr-button" disabled={saving} onClick={()=>setCancel(null)}>Keep Request</button><button className="lcr-button" disabled={saving} onClick={()=>void mutate(()=>supabase.rpc('lc_cancel_member_request',{p_id:pending.id,p_expected_updated_at:pending.updated_at}),'Request cancelled.')}>Confirm Cancellation</button></div> : <button className="lcr-button" disabled={saving} onClick={()=>setCancel(pending.id)}>Cancel Request</button>}</>}
   </div>}
   {!linked && !pending && <form className="lcr-form" onSubmit={submit}>
    <label><span className="lc-field-caption">Full Name on Your Member Record <span aria-hidden="true">*</span></span><input required minLength={3} maxLength={150} value={form.name} disabled={saving} onChange={e=>setForm({...form,name:e.target.value})} autoComplete="name" placeholder="Your Registered First and Last Name"/></label>
    <label>Member Number <small>Optional</small><input maxLength={80} value={form.number} disabled={saving} onChange={e=>setForm({...form,number:e.target.value})} placeholder="As Printed on Your Member ID"/></label>
    <label>Registered Email or Mobile <small>Optional</small><input maxLength={150} value={form.contact} disabled={saving} onChange={e=>setForm({...form,contact:e.target.value})} placeholder="Helps the Team Verify Your Record"/></label>
    <label>Church <small>Optional</small><input maxLength={150} value={form.church} disabled={saving} onChange={e=>setForm({...form,church:e.target.value})} placeholder="e.g. LifeCity - Main"/></label>
    <p className="lcr-meta">Only the reviewing team sees these details. You will not be connected until your identity is verified. Linking does not grant admin access.</p>
    <button className="lcr-button lcr-primary" disabled={saving}>{saving?'Sending…':'Send Link Request'}<Link2 size={16}/></button>
   </form>}
   {linked && !pending && <p className="lcr-meta">Your account already has a member connection. Contact the Owner if it needs correction.</p>}
  </>)}
 </section>
}

function RequestReview({request:r,onCancel,onDone,onBusy}:{request:RequestRow;onCancel:()=>void;onDone:()=>void;onBusy:(v:boolean)=>void}) {
 const [search,setSearch]=useState('')
 const [rows,setRows]=useState<Candidate[]>([])
 const [page,setPage]=useState(1)
 const [total,setTotal]=useState(0)
 const [actualPage,setActualPage]=useState(1)
 const [loading,setLoading]=useState(false)
 const [candidate,setCandidate]=useState<Candidate|null>(null)
 const [note,setNote]=useState('')
 const [decision,setDecision]=useState<'approved'|'declined'|null>(null)
 const [verified,setVerified]=useState(false)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const lock=useRef(false)
 useEffect(()=>{
  let active=true
  setRows([]);setCandidate(null);setVerified(false);setDecision(null);setError('')
  if(search.trim().length<2){setLoading(false);setTotal(0);return}
  setLoading(true)
  const timer=window.setTimeout(()=>void(async()=>{
   try {
    const {data,error:failure}=await supabase.rpc('lc_owner_member_candidates',{p_search:search.trim(),p_page:page})
    if(failure)throw failure
    if(active){setRows(data.rows);setTotal(data.total);setActualPage(data.page)}
   } catch(e){if(active)setError(message(e))}
   finally {if(active)setLoading(false)}
  })(),300)
  return ()=>{active=false;window.clearTimeout(timer)}
 },[search,page])
 async function decide() {
  if(lock.current || !decision || (decision==='approved'&&(!candidate||!verified)))return
  lock.current=true;setSaving(true);onBusy(true);setError('')
  try {
   const {error:failure}=await supabase.rpc('lc_review_member_request',{p_id:r.id,p_decision:decision,p_expected_updated_at:r.updated_at,p_expected_account_updated_at:r.account_updated_at,p_member_id:decision==='approved'?candidate?.id:null,p_expected_member_updated_at:decision==='approved'?candidate?.updated_at:null,p_note:note.trim()})
   if(failure)throw failure
   onDone()
  } catch(e){setError(message(e));setDecision(null)}
  finally {lock.current=false;setSaving(false);onBusy(false)}
 }
 return <div className="lcr-review">
  <p className="lcr-meta">Submitted information is a claim, not proof of identity. Verify with the person or registration team before approving.</p>
  <label>Find the Existing Member<input type="search" disabled={saving} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);setCandidate(null);setVerified(false);setDecision(null)}} placeholder="Member Number, Name, Email or Mobile"/></label>
  {loading ? <p role="status">Searching…</p> : <div className="lcr-candidates">{rows.map(m=><button type="button" key={m.id} disabled={saving||m.already_linked||r.account_status!=='active'||!!r.linked_member_id} className={'lcr-candidate'+(candidate?.id===m.id?' selected':'')} onClick={()=>{setCandidate(m);setVerified(false);setDecision(null)}}><strong>{m.first_name} {m.last_name}</strong><span>{m.member_number} · {uiStatus(m.status)}{m.already_linked?' · Already Linked':''}</span><span>{m.email||'No Email'} · {m.mobile||'No Mobile'}</span></button>)}{search.trim().length>=2 && !rows.length && <p>No matching member. Refine the search or decline with a helpful message.</p>}</div>}
  {total>25 && <div className="lcr-actions"><button className="lcr-button" disabled={saving||loading||actualPage===1} onClick={()=>setPage(actualPage-1)}>Previous Matches</button><span>{actualPage} / {Math.ceil(total/25)}</span><button className="lcr-button" disabled={saving||loading||actualPage>=Math.ceil(total/25)} onClick={()=>setPage(actualPage+1)}>Next Matches</button></div>}
  {candidate && <><div className="lcr-compare"><div><small>Login Account</small><strong>{r.email}</strong><span>Requested: {r.full_name}</span></div><div><small>Member to Connect</small><strong>{candidate.first_name} {candidate.last_name}</strong><span>{candidate.member_number}</span></div></div><label className="lcr-check"><input type="checkbox" checked={verified} disabled={saving} onChange={e=>{setVerified(e.target.checked);setDecision(null)}}/>I Verified This Person Owns the Selected Member Profile.</label></>}
  <label>Message to Applicant <small>{decision==='declined'?'Required for Decline':'Required If Declining; Optional for Approval'}</small><textarea value={note} maxLength={500} disabled={saving} onChange={e=>setNote(e.target.value)} placeholder="A short explanation or next step. Visible to the applicant."/></label>
  {error && <p className="lcr-error" role="alert">{uiMessage(error)}</p>}
  {decision ? <div className="lcr-confirm"><strong>{decision==='approved'?'Approve and Connect This Member?':'Decline This Request?'}</strong><p>{decision==='approved'?'This connects the two identities shown above. Role, contact details and attendance stay unchanged.':'The applicant will see your message and can submit corrected details.'}</p><div className="lcr-actions"><button className="lcr-button" disabled={saving} onClick={()=>setDecision(null)}>Back</button><button className="lcr-button lcr-primary" disabled={saving||(decision==='declined'&&note.trim().length<3)} onClick={()=>void decide()}>{saving?'Saving…':'Confirm '+(decision==='approved'?'approval':'decline')}</button></div></div> :
  <div className="lcr-actions"><button className="lcr-button" disabled={saving} onClick={onCancel}><X size={14}/>Close Review</button><button className="lcr-button" disabled={saving||note.trim().length<3} onClick={()=>setDecision('declined')}>Decline</button><button className="lcr-button lcr-primary" disabled={saving||!candidate||!verified} onClick={()=>setDecision('approved')}><Check size={15}/>Approve Link</button></div>}
 </div>
}
