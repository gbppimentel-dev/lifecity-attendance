// Change ID: LC-P08I-v1
// Change ID: LC-UI-COPY-v2
import { uiMessage, uiStatus } from '../lib/uiText'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Pencil, Search, RefreshCw, Check, X, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
type Values={first_name:string;last_name:string;email:string;churches:string[];ministries:string[]}
type Named={id:string;name:string}
type Catalog={churches:Named[];ministries:Named[]}
type RequestRow={id:string;member_id:string;base:Values;requested:Values;current_values?:Values|null;status:string;review_note:string;updated_at:string;created_at:string;account_email?:string;account_status?:string;linked_member_id?:string|null}
type Editor=Catalog & {member_id:string;values:Values;mobile:string;requests:RequestRow[]}
const fields=['first_name','last_name','email','churches','ministries'] as const
const labels:Record<keyof Values,string>={first_name:'First Name',last_name:'Last Name',email:'Profile Email',churches:'Churches',ministries:'Ministries'}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
function failureMessage(error:unknown){
 const e=error as {code?:string;message?:string}
 return e.code==='P0001'?e.message||'Please refresh and try again.':e.code==='PGRST202'?'Run LC-P03B-v1.sql to enable profile updates.':'Could not confirm this action. Refresh to check the current state before trying again.'
}
function display(v:Values,key:keyof Values,catalog:Catalog){
 const value=v[key]
 if(!Array.isArray(value))return value||'Not Provided'
 return value.length?value.map(id=>catalog[key as 'churches'|'ministries'].find(n=>n.id===id)?.name||'Removed Selection').join(', '):'None'
}
function Comparison({base,current,requested,catalog}:{base:Values;current?:Values|null;requested:Values;catalog:Catalog}){
 return <div className="lpe-comparison">{fields.filter(k=>!equal(base[k],requested[k])).map(k=><div className="lpe-change" key={k}><strong>{labels[k]}</strong><div><small>{current?'Current':'Before Request'}</small><span>{display(current||base,k,catalog)}</span></div><div><small>Requested</small><span>{display(requested,k,catalog)}</span></div>{current&&!equal(current[k],base[k])&&<p className="lpe-conflict">Changed since submission. Ask for a fresh request before approving.</p>}</div>)}</div>
}
function Picker({title,items,selected,disabled,onChange}:{title:string;items:Named[];selected:string[];disabled:boolean;onChange:(ids:string[])=>void}){
 const [query,setQuery]=useState('')
 const visible=items.filter(item=>item.name.toLowerCase().includes(query.toLowerCase()))
 return <fieldset className="lpe-picker"><legend>{title} <small>{selected.length} Selected</small></legend><input aria-label={'Search '+title} type="search" value={query} disabled={disabled} onChange={e=>setQuery(e.target.value)} placeholder={'Find '+title}/><div>{visible.map(n=><label key={n.id}><input type="checkbox" checked={selected.includes(n.id)} disabled={disabled} onChange={e=>onChange((e.target.checked?[...selected,n.id]:selected.filter(id=>id!==n.id)).sort())}/>{n.name}</label>)}{!visible.length&&<p>No matches.</p>}</div></fieldset>
}
export function MemberProfileEditor({onProfileChanged}:{onProfileChanged:()=>void}){
 const [open,setOpen]=useState(false)
 return <div className="lpe-member"><button className="lpe-button" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>{open?<X size={15}/>:<Pencil size={15}/>} {open?'Close Profile Editor':'Edit Profile & Requests'}</button>{open&&<EditorBody onProfileChanged={onProfileChanged}/>}</div>
}
function EditorBody({onProfileChanged}:{onProfileChanged:()=>void}){
 const [data,setData]=useState<Editor|null>(null)
 const [draft,setDraft]=useState<Values|null>(null)
 const [mobile,setMobile]=useState('')
 const [loading,setLoading]=useState(true)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [revision,setRevision]=useState(0)
 const [confirm,setConfirm]=useState<'request'|'mobile'|string|null>(null)
 const lock=useRef(false)
 const mounted=useRef(true)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 useEffect(()=>{
  let active=true;setLoading(true);setError('');setConfirm(null)
  void(async()=>{try{
   const {data:result,error:failure}=await supabase.rpc('lc_profile_editor')
   if(failure)throw failure
   if(active){setData(result);setDraft(result.values);setMobile(result.mobile)}
  }catch(e){if(active){setData(null);setError('Could not load profile requests. Refresh and try again.')}}finally{if(active)setLoading(false)}})()
  return()=>{active=false}
 },[revision])
 async function apply(kind:string){
  if(lock.current||!data||!draft)return
  lock.current=true;setSaving(true);setError('');setNotice('')
  try{
   let result
   if(kind==='mobile') result=await supabase.rpc('lc_update_my_mobile',{p_member_id:data.member_id,p_expected_mobile:data.mobile,p_mobile:mobile.trim()})
   else if(kind==='request') result=await supabase.rpc('lc_request_profile_changes',{p_member_id:data.member_id,p_expected:data.values,p_requested:draft})
   else {
    const request=data.requests.find(r=>r.id===kind);if(!request)throw new Error('Request Missing')
    result=await supabase.rpc('lc_cancel_profile_request',{p_id:kind,p_expected_updated_at:request.updated_at})
   }
   if(result.error)throw result.error
   if(mounted.current){setNotice(kind==='mobile'?'Mobile number saved.':kind==='request'?'Profile request sent for review.':'Request cancelled.');setRevision(v=>v+1);if(kind==='mobile')onProfileChanged()}
  }catch(e){if(mounted.current){setError(failureMessage(e));setConfirm(null)}}
  finally{lock.current=false;if(mounted.current)setSaving(false)}
 }
 function review(e:FormEvent){e.preventDefault();setConfirm('request')}
 const pending=data?.requests.find(r=>r.status==='pending')
 const changed=!!data&&!!draft&&fields.some(k=>!equal(data.values[k],draft[k]))
 return <section className="lpe-editor" aria-label="Edit Your Profile">
  <div className="lpe-heading"><div><h3>Keep Your Profile Up to Date</h3><p>Mobile changes save directly. Other changes go to the Owner for approval.</p></div><button className="lpe-button lc-refresh-icon" aria-label="Reload profile editor" title="Reload profile editor" aria-busy={loading} disabled={saving||loading} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={17} aria-hidden="true"/></button></div>
  {notice&&<p className="lpe-notice" role="status">{notice}</p>}{error&&<p className="lpe-error" role="alert">{uiMessage(error)}</p>}
  {loading?<p role="status">Loading Your Current Details…</p>:data&&draft&&<>
   <div className="lpe-mobile"><label>Mobile Number <small>Optional · Saves Directly</small><input type="tel" autoComplete="tel" maxLength={30} value={mobile} disabled={saving} onChange={e=>{setMobile(e.target.value);setConfirm(null)}} placeholder="e.g. 09171234567"/></label><button className="lpe-button" disabled={saving||mobile.trim()===data.mobile} onClick={()=>setConfirm('mobile')}>Review Mobile Change</button></div>
   {confirm==='mobile'&&<div className="lpe-confirm"><strong>{mobile.trim()?'Save Your Mobile Number?':'Remove Your Mobile Number?'}</strong><p>{data.mobile||'Not Provided'} → {mobile.trim()||'Not Provided'}</p><div className="lpe-actions"><button className="lpe-button" disabled={saving} onClick={()=>setConfirm(null)}>Cancel</button><button className="lpe-button lpe-primary" disabled={saving} onClick={()=>void apply('mobile')}>{saving?'Saving…':'Confirm Save'}</button></div></div>}
   {data.requests.length>0&&<div className="lpe-history"><h4>Your Recent Requests</h4>{data.requests.map(r=><div className="lpe-history-item" key={r.id}><div className="lpe-heading"><span className={'lpe-badge '+r.status}>{r.status==='pending'?'Pending Review':uiStatus(r.status)}</span><small>{new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium'}).format(new Date(r.created_at))}</small></div>
    <Comparison base={r.base} requested={r.requested} catalog={data}/>{r.review_note&&<p className="lpe-note">{r.review_note}</p>}
    {r.status==='pending'&&(confirm===r.id?<div className="lpe-actions"><strong>Cancel This Request?</strong><button className="lpe-button" disabled={saving} onClick={()=>setConfirm(null)}>Keep Request</button><button className="lpe-button" disabled={saving} onClick={()=>void apply(r.id)}>Confirm Cancellation</button></div>:<button className="lpe-button" disabled={saving} onClick={()=>setConfirm(r.id)}>Cancel Request</button>)}
   </div>)}</div>}
   {pending?<p className="lpe-note">You have a pending request. Wait for a decision or cancel it before submitting another.</p>:<form className="lpe-form" onSubmit={review}>
    <h4>Request Profile Changes</h4><p className="lpe-help">Your profile email is separate from your sign-in email. Changing it here will not change how you log in.</p>
    <div className="lpe-fields">{(['first_name','last_name','email'] as const).map(k=><label key={k}>{labels[k]}{k==='email'?<small>Optional</small>:<span className="lpe-required" aria-hidden="true">*</span>}<input type={k==='email'?'email':'text'} required={k!=='email'} maxLength={k==='email'?254:100} disabled={saving} value={draft[k]} onChange={e=>{setDraft({...draft,[k]:e.target.value});setConfirm(null)}}/></label>)}</div>
    <Picker title="Churches" items={data.churches} selected={draft.churches} disabled={saving} onChange={ids=>{setDraft({...draft,churches:ids});setConfirm(null)}}/><p className="lpe-help">Select at least one Church.</p>
    <Picker title="Ministries" items={data.ministries} selected={draft.ministries} disabled={saving} onChange={ids=>{setDraft({...draft,ministries:ids});setConfirm(null)}}/>
    <p className="lpe-help">Member number, active status, permissions and admin notes are managed by your church team.</p>
    {confirm==='request'?<div className="lpe-confirm"><h4>Review Your Request</h4><Comparison base={data.values} requested={draft} catalog={data}/><div className="lpe-actions"><button type="button" className="lpe-button" disabled={saving} onClick={()=>setConfirm(null)}>Back</button><button type="button" className="lpe-button lpe-primary" disabled={saving||!changed||draft.churches.length===0} onClick={()=>void apply('request')}>{saving?'Sending…':'Send for Approval'}</button></div></div>:<button className="lpe-button lpe-primary" disabled={saving||!changed||draft.churches.length===0}>Review Changes</button>}
   </form>}
  </>}
 </section>
}

export function OwnerProfileRequests(){
 const [status,setStatus]=useState('pending')
 const [requestSearch,setRequestSearch]=useState('')
 const [requestQuery,setRequestQuery]=useState('')
 const searching=requestSearch.trim()!==requestQuery
 useEffect(()=>{const timer=window.setTimeout(()=>setRequestQuery(requestSearch.trim()),300);return()=>window.clearTimeout(timer)},[requestSearch])
 const [page,setPage]=useState(1)
 const [data,setData]=useState<(Catalog & {rows:RequestRow[];total:number;page:number})|null>(null)
 const [loading,setLoading]=useState(true)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [revision,setRevision]=useState(0)
 const section=useRef<HTMLElement>(null)
 useEffect(()=>{
  let active=true;setLoading(true);setError('')
  void(async()=>{try{
   const {data:result,error:failure}=await supabase.rpc('lc_owner_profile_requests_search',{p_status:status,p_page:page,p_search:requestQuery})
   if(failure)throw failure
   if(active)setData(result)
  }catch(e){if(active){setData(null);setError('Could not load profile requests. Refresh and try again.')}}finally{if(active)setLoading(false)}})()
  return()=>{active=false}
 },[status,page,revision,requestQuery])
 const pages=Math.max(1,Math.ceil((data?.total||0)/20))
 function turn(n:number){setPage(n);section.current?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
 return <section className="lpe-owner-panel" ref={section} data-change-id="LC-UI-COPY-v2">
  <style>{`
    body .lpe-owner-panel .lcq-search-row {padding:0;margin:16px 0 20px;gap:10px;}
    body .lpe-owner-panel .lcq-search-row > label.lcq-search {
      display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:10px;
      flex:1 1 240px;min-width:0;min-height:46px;margin:0;padding:0 14px;
      border:1px solid #d7e7e1;border-radius:12px;background:#fff;color:#718985;
    }
    body .lpe-owner-panel .lcq-search-row > label.lcq-search > svg {
      position:static;flex:0 0 17px;width:17px;height:17px;margin:0;transform:none;
    }
    body .lpe-owner-panel .lcq-search-row > label.lcq-search > input {
      flex:1 1 0%;width:0;min-width:0;min-height:46px;margin:0;padding:11px 0;
      border:0;border-radius:0;background:transparent;box-shadow:none;
      color:#315b53;font:inherit;font-size:14px;font-weight:400;line-height:1.5;
    }
    body .lpe-owner-panel .lcq-search-row > label.lcq-search > input::placeholder {color:#879b93;font-weight:400;opacity:1;}
    body .lpe-owner-panel .lcq-search-row > label.lcq-search:focus-within {outline:2px solid #78a991;outline-offset:3px;}
    body .lpe-owner-panel .lcq-search-row > label.lcq-search > input:focus {outline:none;box-shadow:none;}
    body .lpe-owner-panel .lpe-pagination > div {display:flex;align-items:center;gap:8px;}
    body .lpe-owner-panel .lpe-pagination > div > button {display:inline-flex;align-items:center;justify-content:center;width:40px;min-width:40px;height:40px;padding:0;border-radius:10px;}
    body .lpe-owner-panel .lpe-pagination > div > button > svg {flex-shrink:0;}
    @media(max-width:700px) {
      body .lpe-owner-panel .lcq-search-row > label.lcq-search > input {font-size:16px;}
      body .lpe-owner-panel .lpe-pagination > div > button {width:44px;min-width:44px;height:44px;}
    }
  `}</style>
  <header className="lpe-heading"><div><p className="eyebrow">Member Details · Owner Review</p><h2>Profile Change Requests</h2><p>Approve verified changes to an existing member profile.</p></div><button className="lpe-button lc-refresh-icon" aria-label="Refresh profile change requests" title="Refresh profile change requests" aria-busy={loading} disabled={saving||loading} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={17} aria-hidden="true"/></button></header>
  <div className="lpe-toolbar"><label>Request Status<select disabled={saving} value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}>{['pending','approved','declined','cancelled','all'].map(v=><option key={v} value={v}>{v==='pending'?'Pending Review':v==='all'?'All Requests':v[0].toUpperCase()+v.slice(1)}</option>)}</select></label><span>{loading||searching?'Loading…':(data?.total||0)+' Requests'}</span></div>
  <div className="lcq-search-row"><label className="lcq-search"><Search size={17} aria-hidden="true"/><input type="search" aria-label="Search Profile Change Requests" placeholder="Name, Email, or Member ID" disabled={saving} value={requestSearch} onChange={e=>{setRequestSearch(e.target.value);setPage(1)}}/></label>{requestSearch && <button type="button" className="lpe-button" disabled={saving} onClick={()=>{setRequestSearch('');setRequestQuery('');setPage(1)}}>Clear Search</button>}</div>
  {error&&<p className="lpe-error" role="alert">{uiMessage(error)}</p>}{notice&&<p className="lpe-notice" role="status">{notice}</p>}
  {loading||searching?<p className="lpe-help" role="status">Loading Profile Requests…</p>:data&&<>
   {data.rows.length===0&&<p className="lpe-empty">{requestQuery ? 'No profile requests match this search. Try another name, email, or member ID.' : `No ${status==='all'?'':status+' '}profile requests.`}</p>}
   {data.rows.map(r=><OwnerRequestRow key={r.id+':'+r.updated_at} request={r} catalog={data} busy={saving} onBusy={setSaving} onDone={()=>{setNotice('Profile request reviewed.');setRevision(v=>v+1)}}/>)}
   <nav className="lpe-pagination" aria-label="Profile Request Pages"><span>{data.page} / {pages} · 20 Per Page</span><div>{[{label:'First page',icon:ChevronsLeft,n:1,off:data.page===1},{label:'Previous page',icon:ChevronLeft,n:data.page-1,off:data.page===1},{label:'Next page',icon:ChevronRight,n:data.page+1,off:data.page>=pages},{label:'Last page',icon:ChevronsRight,n:pages,off:data.page>=pages}].map(x=><button type="button" key={x.label} className="lpe-button" aria-label={x.label} title={x.label} disabled={saving||x.off} onClick={()=>turn(x.n)}><x.icon size={18} aria-hidden="true"/></button>)}</div></nav>
  </>}
 </section>
}
function OwnerRequestRow({request:r,catalog,busy,onBusy,onDone}:{request:RequestRow;catalog:Catalog;busy:boolean;onBusy:(value:boolean)=>void;onDone:()=>void}){
 const [note,setNote]=useState('')
 const [decision,setDecision]=useState<'approved'|'declined'|null>(null)
 const [error,setError]=useState('')
 const lock=useRef(false)
 const conflict=!r.current_values||fields.some(k=>!equal(r.base[k],r.requested[k])&&!equal(r.current_values?.[k],r.base[k]))
 const blocked=conflict||r.account_status!=='active'||r.linked_member_id!==r.member_id
 async function apply(){
  if(lock.current||!decision)return
  lock.current=true;onBusy(true);setError('')
  try{
   const {error:failure}=await supabase.rpc('lc_review_profile_request',{p_id:r.id,p_decision:decision,p_expected_updated_at:r.updated_at,p_note:note.trim()})
   if(failure)throw failure
   onDone()
  }catch(e){setError(failureMessage(e));setDecision(null)}
  finally{lock.current=false;onBusy(false)}
 }
 return <article className="lpe-review-card"><header className="lpe-heading"><div><strong>{r.base.first_name} {r.base.last_name}</strong><p>{r.account_email}</p></div><span className={'lpe-badge '+r.status}>{r.status==='pending'?'Pending Review':uiStatus(r.status)}</span></header>
  <Comparison base={r.base} current={r.status==='pending'?r.current_values:undefined} requested={r.requested} catalog={catalog}/>
  {r.review_note&&<p className="lpe-note">Message to Member: {r.review_note}</p>}
  {r.status==='pending'&&<>
   {blocked&&<p className="lpe-error">Profile details, account access or the member connection changed. Refresh to review; decline with guidance if this request is no longer valid.</p>}
   <label>Message to Member <small>Required When Declining</small><textarea maxLength={500} disabled={busy} value={note} onChange={e=>setNote(e.target.value)} placeholder="A short explanation or next step visible to the member."/></label>
   {error&&<p className="lpe-error" role="alert">{uiMessage(error)}</p>}
   {decision?<div className="lpe-confirm"><strong>{decision==='approved'?'Approve These Profile Changes?':'Decline This Request?'}</strong><p>{decision==='approved'?'Only the requested fields change. Login credentials, permissions and saved attendance snapshots stay unchanged.':'The member can read your message and submit corrected details.'}</p><div className="lpe-actions"><button className="lpe-button" disabled={busy} onClick={()=>setDecision(null)}>Back</button><button className="lpe-button lpe-primary" disabled={busy||(decision==='declined'&&note.trim().length<3)} onClick={()=>void apply()}>{busy?'Saving…':decision==='approved'?'Confirm Approval':'Confirm Decline'}</button></div></div>:<div className="lpe-actions"><button className="lpe-button" disabled={busy||note.trim().length<3} onClick={()=>setDecision('declined')}><X size={14}/>Decline</button><button className="lpe-button lpe-primary" disabled={busy||blocked} onClick={()=>setDecision('approved')}><Check size={14}/>Approve Changes</button></div>}
  </>}
 </article>
}
