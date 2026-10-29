import {ResponsiveSelect} from './CompactMobile'
import { revealWorkspaceRegion } from '../lib/workspaceViewport'
import { motionEnabled } from '../lib/motion'
// Change ID: LC-P08I-v1
// Change ID: LC-UI-COPY-v2
import { uiMessage, uiStatus } from '../lib/uiText'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import './MemberProfileEditor.css'
import { useNoticeToast } from '../lib/useNoticeToast'
import { Pencil, Search, RefreshCw, Check, X, FilePenLine, Inbox, ArrowRight, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Phone, Send, ShieldCheck, Clock3, ChevronDown } from 'lucide-react'
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
 return <div className="lpe-comparison" aria-label="Profile Change Comparison"><div className="lpe-comparison-head"><span>Field</span><span>{current?'Current':'Before Request'}</span><span>Requested</span></div>{fields.filter(k=>!equal(base[k],requested[k])).map(k=><div className="lpe-change" key={k}><strong>{labels[k]}</strong><div><small>{current?'Current':'Before Request'}</small><span>{display(current||base,k,catalog)}</span></div><ArrowRight size={14} aria-hidden="true"/><div><small>Requested</small><span>{display(requested,k,catalog)}</span></div>{current&&!equal(current[k],base[k])&&<p className="lpe-conflict">Changed since submission. Ask for a fresh request before approving.</p>}</div>)}</div>
}
function Picker({title,items,selected,disabled,onChange}:{title:string;items:Named[];selected:string[];disabled:boolean;onChange:(ids:string[])=>void}){
 const [query,setQuery]=useState('')
 const visible=items.filter(item=>item.name.toLowerCase().includes(query.toLowerCase()))
 return <fieldset className="lpe-picker"><legend>{title} <small>{selected.length} Selected</small></legend><div className="lpe-picker-search"><Search size={15} aria-hidden="true"/><input aria-label={'Search '+title} type="search" value={query} disabled={disabled} onChange={e=>setQuery(e.target.value)} placeholder={'Find '+title.toLowerCase()}/></div><div className="lpe-picker-options">{visible.map(n=><label key={n.id}><input type="checkbox" checked={selected.includes(n.id)} disabled={disabled} onChange={e=>onChange((e.target.checked?[...selected,n.id]:selected.filter(id=>id!==n.id)).sort())}/><span className="lpe-picker-check" aria-hidden="true"><Check size={12}/></span><span>{n.name}</span></label>)}{!visible.length&&<p>No matches. Try another name.</p>}</div></fieldset>
}
export function MemberProfileEditor({onProfileChanged}:{onProfileChanged:()=>void}){
 const [open,setOpen]=useState(false),[saving,setSaving]=useState(false)
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null),heading=useId()
 useEffect(()=>{
  if(!open)return
  const node=dialog.current,overflow=document.body.style.overflow,padding=document.body.style.paddingRight
  const gap=Math.max(0,innerWidth-document.documentElement.clientWidth)
  document.body.style.overflow='hidden'
  if(gap)document.body.style.paddingRight=`${(parseFloat(getComputedStyle(document.body).paddingRight)||0)+gap}px`
  node?.showModal()
  return()=>{node?.close();document.body.style.overflow=overflow;document.body.style.paddingRight=padding;trigger.current?.focus({preventScroll:true})}
 },[open])
 function close(){if(!saving)setOpen(false)}
 return <div className="lpe-member"><button ref={trigger} type="button" className="lpe-button lpe-editor-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}><Pencil size={16}/><span>Edit Profile & Requests</span><ArrowRight size={15}/></button>{open&&createPortal(<dialog ref={dialog} className="lpe-member-dialog" aria-labelledby={heading} onCancel={e=>{e.preventDefault();close()}} onClick={e=>{if(e.target===e.currentTarget){const box=e.currentTarget.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)close()}}}><header className="lpe-drawer-heading"><span className="lpe-drawer-icon"><FilePenLine size={23}/></span><div><p className="eyebrow">Member Profile</p><h2 id={heading}>Details & Requests</h2><p>Update your contact details or review a request.</p></div><button type="button" autoFocus className="lpe-button lpe-drawer-close" disabled={saving} aria-label="Close Profile Editor" onClick={close}><X size={19}/></button></header><EditorBody onProfileChanged={onProfileChanged} onBusy={setSaving}/></dialog>,document.body)}</div>
}
function EditorBody({onProfileChanged,onBusy}:{onProfileChanged:()=>void;onBusy:(busy:boolean)=>void}){
 const editor=useRef<HTMLElement>(null)
 const [data,setData]=useState<Editor|null>(null)
 const [draft,setDraft]=useState<Values|null>(null)
 const [mobile,setMobile]=useState('')
 const [loading,setLoading]=useState(true)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 useNoticeToast(notice)
 const [revision,setRevision]=useState(0)
 const [tab,setTab]=useState<'details'|'requests'>('details')
 const [confirm,setConfirm]=useState<'request'|'mobile'|string|null>(null)
 const lock=useRef(false)
 const mounted=useRef(true)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;onBusy(false)}},[onBusy])
 useEffect(()=>{
  let active=true;setLoading(true);setError('');setConfirm(null)
  void(async()=>{try{
   const {data:result,error:failure}=await supabase.rpc('lc_profile_editor')
   if(failure)throw failure
   if(!result?.member_id||!result.values||!Array.isArray(result.requests)||!Array.isArray(result.churches)||!Array.isArray(result.ministries))throw Error('Invalid Profile Response')
   if(active){setData(result);setDraft(result.values);setMobile(result.mobile||'')}
  }catch(e){if(active){setData(null);setError('Could not load profile requests. Refresh and try again.')}}finally{if(active)setLoading(false)}})()
  return()=>{active=false}
 },[revision])
 async function apply(kind:string){
  if(lock.current||!data||!draft)return
  lock.current=true;setSaving(true);onBusy(true);setError('');setNotice('')
  try{
   let result
   if(kind==='mobile') result=await supabase.rpc('lc_update_my_mobile',{p_member_id:data.member_id,p_expected_mobile:data.mobile,p_mobile:mobile.trim()})
   else if(kind==='request') result=await supabase.rpc('lc_request_profile_changes',{p_member_id:data.member_id,p_expected:data.values,p_requested:draft})
   else {
    const request=data.requests.find(r=>r.id===kind);if(!request)throw new Error('Request Missing')
    result=await supabase.rpc('lc_cancel_profile_request',{p_id:kind,p_expected_updated_at:request.updated_at})
   }
   if(result.error)throw result.error
   if(mounted.current){setNotice(kind==='mobile'?'Mobile number saved.':kind==='request'?'Profile request sent for review.':'Request cancelled.');setRevision(v=>v+1);if(kind==='request')setTab('requests');if(kind==='mobile')onProfileChanged()}
  }catch(e){if(mounted.current){setError(failureMessage(e));setConfirm(null)}}
  finally{lock.current=false;if(mounted.current){setSaving(false);onBusy(false)}}
 }
 function review(e:FormEvent){e.preventDefault();setConfirm('request')}
 const pending=data?.requests.find(r=>r.status==='pending')
 const changed=!!data&&!!draft&&fields.some(k=>!equal(data.values[k],draft[k]))
 const blocked=saving||loading
 useEffect(()=>{
  if(loading)return
  const frame=requestAnimationFrame(()=>{
   const root=editor.current,dialog=root?.closest('dialog'),node=root?.querySelector<HTMLElement>(error?'.lpe-error':confirm?'[data-lpe-confirm]':tab==='requests'?'.lpe-requests-panel>.lpe-section-heading':'.lpe-editor-tools')
   if(!root||!dialog||!node)return
   const bounds=dialog.getBoundingClientRect(),heading=dialog.querySelector<HTMLElement>('.lpe-drawer-heading'),box=node.getBoundingClientRect()
   const safeTop=bounds.top+(heading?.getBoundingClientRect().height??0)+14,safeBottom=bounds.bottom-18
   const delta=box.top<safeTop||box.height>safeBottom-safeTop?box.top-safeTop:box.bottom>safeBottom?box.bottom-safeBottom:0
   if(Math.abs(delta)>1)dialog.scrollTo({top:Math.max(0,dialog.scrollTop+delta),behavior:motionEnabled()?'smooth':'auto'})
   if(confirm||error)node.focus({preventScroll:true})
  })
  return()=>cancelAnimationFrame(frame)
 },[confirm,tab,loading,error])
 return <section ref={editor} className="lpe-editor" aria-label="Edit Your Profile" aria-busy={blocked}>
  <div className="lpe-editor-tools"><div className="lpe-editor-tabs" role="tablist" aria-label="Profile Editor Sections"><button type="button" role="tab" aria-selected={tab==='details'} aria-controls="lpe-details-panel" id="lpe-details-tab" onClick={()=>{setTab('details');setConfirm(null)}}>Profile Details</button><button type="button" role="tab" aria-selected={tab==='requests'} aria-controls="lpe-requests-panel" id="lpe-requests-tab" onClick={()=>{setTab('requests');setConfirm(null)}}>Requests <span>{data?.requests.length??0}</span></button></div><button className="lpe-button lpe-editor-refresh lc-refresh-icon" aria-label="Reload profile editor" title="Reload Profile" aria-busy={loading} disabled={blocked} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={17} aria-hidden="true"/></button></div>
  {notice&&<p className="lpe-notice" role="status">{notice}</p>}{error&&<p className="lpe-error" role="alert" tabIndex={-1}>{uiMessage(error)}</p>}
  {loading?<div className="lpe-member-loading" role="status"><RefreshCw size={19}/>Loading your profile…</div>:data&&draft&&<>
   <div role="tabpanel" hidden={tab!=='details'} aria-labelledby="lpe-details-tab" id="lpe-details-panel" className="lpe-details-panel">
   <section className="lpe-mobile-section"><div className="lpe-section-heading"><span><Phone size={17}/></span><div><h3>Mobile Number</h3><p>Optional · Saved directly to your member profile.</p></div></div><div className="lpe-mobile"><label><span className="lpe-visually-hidden">Mobile Number</span><input type="tel" autoComplete="tel" maxLength={30} value={mobile} disabled={blocked} onChange={e=>{setMobile(e.target.value);setConfirm(null)}} placeholder="e.g. 09171234567"/></label><button type="button" className="lpe-button" disabled={blocked||mobile.trim()===data.mobile} onClick={()=>setConfirm('mobile')}>Review Change<ArrowRight size={14}/></button></div>
   {confirm==='mobile'&&<div className="lpe-confirm" data-lpe-confirm tabIndex={-1} role="group" aria-label="Review This Change"><strong>{mobile.trim()?'Save Your Mobile Number?':'Remove Your Mobile Number?'}</strong><p>{data.mobile||'Not Provided'} → {mobile.trim()||'Not Provided'}</p><div className="lpe-actions"><button className="lpe-button" disabled={saving} onClick={()=>setConfirm(null)}>Cancel</button><button className="lpe-button lpe-primary" disabled={saving} onClick={()=>void apply('mobile')}>{saving?'Saving…':'Confirm Save'}</button></div></div>}
   </section>
   {pending?<div className="lpe-pending-note"><Clock3 size={19}/><div><strong>A Request Is Pending</strong><p>You can update your mobile number. Other changes are available after this request is reviewed or cancelled.</p></div><button type="button" className="lpe-button" onClick={()=>{setTab('requests');setConfirm(null)}}>View Request<ArrowRight size={14}/></button></div>:<form className="lpe-form" onSubmit={review}>
    <div className="lpe-section-heading"><span><ShieldCheck size={18}/></span><div><h3>Request Profile Changes</h3><p>Your church team reviews these changes before they are saved.</p></div></div>
    <div className="lpe-fields">{(['first_name','last_name','email'] as const).map(k=><label key={k}><span className="lc-field-caption">{labels[k]}{k==='email'?<small>Optional</small>:<span className="lpe-required" aria-hidden="true">*</span>}</span><input type={k==='email'?'email':'text'} required={k!=='email'} maxLength={k==='email'?254:100} disabled={saving} value={draft[k]} onChange={e=>{setDraft({...draft,[k]:e.target.value});setConfirm(null)}}/></label>)}</div>
    <Picker title="Churches" items={data.churches} selected={draft.churches} disabled={saving} onChange={ids=>{setDraft({...draft,churches:ids});setConfirm(null)}}/><p className="lpe-help">Select at least one Church.</p>
    <Picker title="Ministries" items={data.ministries} selected={draft.ministries} disabled={saving} onChange={ids=>{setDraft({...draft,ministries:ids});setConfirm(null)}}/>
    <p className="lpe-help">Your sign-in email stays the same. The church team manages member number, status and access.</p>
    {confirm==='request'?<div className="lpe-confirm" data-lpe-confirm tabIndex={-1} role="group" aria-label="Review This Change"><h4>Review Your Request</h4><Comparison base={data.values} requested={draft} catalog={data}/><div className="lpe-actions"><button type="button" className="lpe-button" disabled={saving} onClick={()=>setConfirm(null)}>Back</button><button type="button" className="lpe-button lpe-primary" disabled={saving||!changed||draft.churches.length===0} onClick={()=>void apply('request')}><Send size={15}/>{saving?'Sending…':'Send for Approval'}</button></div></div>:<div className="lpe-form-footer"><span>{changed?'Unsaved Changes':'Change a field to request an update.'}</span><button className="lpe-button lpe-primary" disabled={blocked||!changed||draft.churches.length===0}>Review Changes<ArrowRight size={15}/></button></div>}
   </form>}
   </div>
   <div role="tabpanel" hidden={tab!=='requests'} aria-labelledby="lpe-requests-tab" id="lpe-requests-panel" className="lpe-requests-panel"><div className="lpe-section-heading"><span><Clock3 size={18}/></span><div><h3>Your Requests</h3><p>Review submitted details and your church team’s response.</p></div></div>
   {!data.requests.length?<div className="lpe-member-empty"><Inbox size={26}/><h3>No Profile Requests</h3><p>Submitted changes will appear here.</p><button type="button" className="lpe-button" onClick={()=>setTab('details')}>Edit Profile Details<ArrowRight size={14}/></button></div>:<div className="lpe-request-list">{data.requests.map(r=><article className="lpe-request-card" key={r.id}><header><span className={'lpe-badge '+r.status}>{r.status==='pending'?'Pending Review':uiStatus(r.status)}</span><time dateTime={r.created_at}>{new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium'}).format(new Date(r.created_at))}</time></header><details className="lpe-request-changes" open={r.status==='pending'}><summary><span>Requested Changes</span><span>{fields.filter(k=>!equal(r.base[k],r.requested[k])).length} {fields.filter(k=>!equal(r.base[k],r.requested[k])).length===1?'Field':'Fields'}<ChevronDown size={15}/></span></summary><Comparison base={r.base} requested={r.requested} catalog={data}/></details>{r.review_note&&<div className="lpe-review-message"><strong>Review Message</strong><p>{r.review_note}</p></div>}{r.status==='pending'&&(confirm===r.id?<div className="lpe-confirm" data-lpe-confirm tabIndex={-1} role="group" aria-label="Review This Change"><strong>Cancel This Request?</strong><p>Your saved profile will stay the same.</p><div className="lpe-actions"><button type="button" className="lpe-button" disabled={saving} onClick={()=>setConfirm(null)}>Keep Request</button><button type="button" className="lpe-button lpe-cancel-request" disabled={saving} onClick={()=>void apply(r.id)}>{saving?'Cancelling…':'Confirm Cancellation'}</button></div></div>:<footer><span><Clock3 size={14}/>Waiting for review</span><button type="button" className="lpe-button" disabled={blocked} onClick={()=>setConfirm(r.id)}>Cancel Request</button></footer>)}</article>)}</div>}</div>
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
 const [loadedKey,setLoadedKey]=useState('')
 const viewKey=JSON.stringify([status,page,requestQuery])
 const [loading,setLoading]=useState(true)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 useNoticeToast(notice)
 const [revision,setRevision]=useState(0)
 const section=useRef<HTMLElement>(null)
 useEffect(()=>{
  let active=true;setLoading(true);setError('')
  void(async()=>{try{
   const {data:result,error:failure}=await supabase.rpc('lc_owner_profile_requests_search',{p_status:status,p_page:page,p_search:requestQuery})
   if(failure)throw failure
   if(active){setData(result);setLoadedKey(viewKey)}
  }catch{if(active){setData(null);setError('Could not load profile requests. Refresh and try again.')}}finally{if(active)setLoading(false)}})()
  return()=>{active=false}
 },[status,page,revision,requestQuery,viewKey])
 const pages=Math.max(1,Math.ceil((data?.total||0)/20))
 const visible=!!data&&loadedKey===viewKey&&!searching
 const busy=loading||saving||searching
 function turn(n:number){setPage(n);revealWorkspaceRegion(section.current,'start')}
 return <section className="lpe-owner-panel lcsa-request-panel" ref={section} data-change-id="LC-SETTINGS-v24" aria-busy={busy} aria-labelledby="lcsa-profile-title">
  <header className="lcsa-panel-heading"><span className="lcsa-section-icon is-purple"><FilePenLine size={21}/></span><div className="lcsa-heading-copy"><p className="eyebrow">Member Profiles</p><h2 id="lcsa-profile-title">Profile Change Requests <span className="lcsa-count">{visible?data.total:'—'}</span></h2><p>Review changes before updating a member’s profile.</p></div><button className="lpe-button lcsa-icon-button" aria-label="Refresh profile change requests" title="Refresh profile change requests" aria-busy={loading} disabled={saving||loading} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={17} aria-hidden="true"/></button></header>
  <div className="lcsa-request-toolbar"><label className="lcsa-field"><span>Status</span><ResponsiveSelect aria-label="Profile Request Status" disabled={saving} value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}>{['pending','approved','declined','cancelled','all'].map(v=><option key={v} value={v}>{v==='pending'?'Pending Review':v==='all'?'All Requests':uiStatus(v)}</option>)}</ResponsiveSelect></label><label className="lcsa-field lcsa-request-search"><span>Search Requests</span><span className="lcsa-search"><Search size={17} aria-hidden="true"/><input type="search" aria-label="Search Profile Change Requests" placeholder="Name, email or member ID" disabled={saving} value={requestSearch} onChange={e=>{setRequestSearch(e.target.value);setPage(1)}}/>{requestSearch && <button type="button" aria-label="Clear profile request search" disabled={saving} onClick={()=>{setRequestSearch('');setRequestQuery('');setPage(1)}}><X size={14}/></button>}</span></label><span className="lcsa-filter-summary" aria-live="polite">{loading||searching?'Updating…':(data?.total||0)+' '+(data?.total===1?'Request':'Requests')}</span></div>
  <div className="lcsa-update-line" data-loading={loading||searching} aria-hidden="true"/>
  {error&&<p className="lpe-error" role="alert">{uiMessage(error)}</p>}{notice&&<p className="lpe-notice" role="status">{notice}</p>}
  {!visible&&(loading||searching)?<div className="lcsa-loading" role="status"><span/>Loading profile requests…</div>:data&&visible&&<>
   {data.rows.length===0&&<div className="lcsa-empty"><Inbox size={25} aria-hidden="true"/><div><h3>{requestQuery?'No Matching Requests':status==='pending'?'No Pending Profile Requests':'No Requests Found'}</h3><p>{requestQuery?'Try another name, email or member ID.':status==='pending'?'New requests will appear here for review.':'Choose another status to see requests.'}</p></div></div>}
   <div className="lcsa-request-list">{data.rows.map(r=><OwnerRequestRow key={r.id+':'+r.updated_at} request={r} catalog={data} busy={busy} onBusy={setSaving} onDone={()=>{setNotice('Profile request reviewed.');setRevision(v=>v+1)}}/>)}</div>
   <nav className="lpe-pagination lcsa-pagination" aria-label="Profile Request Pages"><span>Page {data.page} of {pages} · 20 Per Page</span><div>{[{label:'First page',icon:ChevronsLeft,n:1,off:data.page===1},{label:'Previous page',icon:ChevronLeft,n:data.page-1,off:data.page===1},{label:'Next page',icon:ChevronRight,n:data.page+1,off:data.page>=pages},{label:'Last page',icon:ChevronsRight,n:pages,off:data.page>=pages}].map(x=><button type="button" key={x.label} className="lpe-button lcsa-page-icon" aria-label={x.label} title={x.label} disabled={busy||x.off} onClick={()=>turn(x.n)}><x.icon size={17} aria-hidden="true"/></button>)}</div></nav>
  </>}
 </section>
}
function OwnerComparison({request:r,catalog}:{request:RequestRow;catalog:Catalog}){
 const current=r.status==='pending'?r.current_values:null
 const changes=fields.filter(k=>!equal(r.base[k],r.requested[k]))
 return <div className="lcsa-comparison" aria-label="Requested Profile Changes"><div className="lcsa-comparison-head"><span>{changes.length} {changes.length===1?'Change':'Changes'}</span><span>{current?'Current':'At Submission'}</span><span>Requested</span></div>{changes.map(k=><div className="lcsa-comparison-row" key={k}><strong>{labels[k]}</strong><div><small>{current?'Current':'At Submission'}</small><span>{display(current||r.base,k,catalog)}</span>{current&&!equal(current[k],r.base[k])&&<em>Changed since request</em>}</div><ArrowRight size={14} aria-hidden="true"/><div><small>Requested</small><span>{display(r.requested,k,catalog)}</span></div></div>)}</div>
}
function OwnerRequestRow({request:r,catalog,busy,onBusy,onDone}:{request:RequestRow;catalog:Catalog;busy:boolean;onBusy:(value:boolean)=>void;onDone:()=>void}){
 const [note,setNote]=useState('')
 const [decision,setDecision]=useState<'approved'|'declined'|null>(null)
 const [error,setError]=useState('')
 useEffect(()=>{
  const leave=(event:Event)=>{
   const detail=(event as CustomEvent<{tab?:string;page?:string}>).detail
   if((event.type==='lifecity-settings-activate'&&detail?.tab!=='accounts')||(event.type==='lifecity-workspace-activate'&&detail?.page!=='settings')){setDecision(null)}
  }
  window.addEventListener('lifecity-settings-activate',leave);window.addEventListener('lifecity-workspace-activate',leave)
  return()=>{window.removeEventListener('lifecity-settings-activate',leave);window.removeEventListener('lifecity-workspace-activate',leave)}
 },[])
 const lock=useRef(false)
 const conflict=!r.current_values||fields.some(k=>!equal(r.base[k],r.requested[k])&&!equal(r.current_values?.[k],r.base[k]))
 const blocked=conflict||r.account_status!=='active'||r.linked_member_id!==r.member_id
 async function apply(){
  if(lock.current||!decision||(decision==='approved'&&blocked)||(decision==='declined'&&note.trim().length<3))return
  lock.current=true;onBusy(true);setError('')
  try{
   const {error:failure}=await supabase.rpc('lc_review_profile_request',{p_id:r.id,p_decision:decision,p_expected_updated_at:r.updated_at,p_note:note.trim()})
   if(failure)throw failure
   onDone()
  }catch(e){setError(failureMessage(e));setDecision(null)}
  finally{lock.current=false;onBusy(false)}
 }
 return <article className="lpe-review-card lcsa-review-card"><header className="lcsa-review-heading"><div><strong>{r.base.first_name} {r.base.last_name}</strong><p>{r.account_email}</p><small>Submitted {new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(new Date(r.created_at))}</small></div><span className={'lpe-badge '+r.status}>{r.status==='pending'?'Pending Review':uiStatus(r.status)}</span></header>
  <OwnerComparison request={r} catalog={catalog}/>
  {r.review_note&&<p className="lpe-note"><strong>Review Message</strong>{r.review_note}</p>}
  {r.status==='pending'&&<>
   {blocked&&<p className="lpe-error" role="status">The profile, account access or member connection has changed. Refresh before approving, or decline with a message.</p>}
   <div className="lcsa-profile-review"><label className="lcsa-field"><span>Message to Member <small>Required to decline</small></span><textarea maxLength={500} disabled={busy} value={note} onChange={e=>setNote(e.target.value)} placeholder="A short explanation or next step…"/></label>
   {!decision&&<div className="lpe-actions"><button className="lpe-button lcsa-decline" disabled={busy||note.trim().length<3} onClick={()=>setDecision('declined')}><X size={15}/>Decline</button><button className="lpe-button lpe-primary" disabled={busy||blocked} onClick={()=>setDecision('approved')}><Check size={15}/>Approve Changes</button></div>}</div>
   {error&&<p className="lpe-error" role="alert">{uiMessage(error)}</p>}
   {decision&&<div className="lpe-confirm"><div><strong>{decision==='approved'?'Approve Profile Changes?':'Decline This Request?'}</strong><p>{decision==='approved'?'Updates the requested fields. Login access and saved attendance are unchanged.':'The member can read your message and submit corrected details.'}</p></div><div className="lpe-actions"><button className="lpe-button" disabled={busy} onClick={()=>setDecision(null)}>Back</button><button className={'lpe-button '+(decision==='approved'?'lpe-primary':'lcsa-decline')} disabled={busy||(decision==='declined'&&note.trim().length<3)} onClick={()=>void apply()}>{busy?'Saving…':decision==='approved'?'Confirm Approval':'Confirm Decline'}</button></div></div>}
  </>}
 </article>
}
