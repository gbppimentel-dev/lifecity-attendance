// Change ID: LC-P08H-v1
// Change ID: LC-UI-COPY-v2
import { uiMessage, uiStatus } from '../lib/uiText'
import { Fragment, useEffect, useRef, useState } from 'react'
import { Search, ShieldCheck, RefreshCw, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { OwnerProfileRequests } from './ProfileChanges'
import MemberLinkRequests from './MemberLinkRequests'
import { supabase } from '../lib/supabase'

type Account = {
 user_id: string; email: string | null; display_name: string;
 role: 'owner' | 'admin' | 'user'; status: 'active' | 'suspended';
 member_id: string | null; member_name: string | null; member_number?: string | null; updated_at: string;
}
type Action = 'grant_admin' | 'revoke_admin' | 'suspend' | 'reactivate'
type Result = { rows: Account[]; total: number; page: number; page_size: number }
const labels: Record<Action,string> = {grant_admin:'Grant Admin',revoke_admin:'Remove Admin',suspend:'Suspend Access',reactivate:'Reactivate Access'}
const roleName = (role: Account['role']) => role === 'user' ? 'User' : role === 'admin' ? 'Admin' : 'Owner'

export default function AccountsSettings({currentUserId,onLinkChanged}: {currentUserId:string;onLinkChanged:()=>void}) {
 const [search,setSearch] = useState('')
 const [filters,setFilters] = useState({role:'all',status:'all',link:'all'})
 const [query,setQuery] = useState('')
 const [page,setPage] = useState(1)
 const [pageSize,setPageSize] = useState(25)
 const [refresh,setRefresh] = useState(0)
 const [data,setData] = useState<Result | null>(null)
 const [loading,setLoading] = useState(true)
 const [error,setError] = useState('')
 const [notice,setNotice] = useState('')
 const [pending,setPending] = useState<{account:Account;action:Action} | null>(null)
 const [saving,setSaving] = useState(false)
 const [linkTarget,setLinkTarget] = useState<Account | null>(null)
 const listRef = useRef<HTMLElement>(null)
 const writeLock = useRef(false)
 const requestId = useRef(0)
 const mounted = useRef(true)
 useEffect(()=> { mounted.current=true; return ()=> {mounted.current=false} },[])
 useEffect(()=> {
  const timer=window.setTimeout(()=> {setQuery(search.trim());setPage(1);setPending(null);setLinkTarget(null)},300)
  return ()=>window.clearTimeout(timer)
 },[search])
 useEffect(()=> {
  let active=true
  const id=++requestId.current
  setLoading(true);setError('');setPending(null);setLinkTarget(null)
  void (async()=> {
   try {
    const {data:result,error:failure}=await supabase.rpc('lc_owner_accounts_page',{p_search:query,p_page:page,p_role:filters.role,p_status:filters.status,p_link:filters.link,p_size:pageSize})
    if(failure) throw failure
    if(active && id===requestId.current) setData(result as Result)
   } catch(failure) {
    if(active && id===requestId.current) {setData(null);setError((failure as {code?:string}).code==='PGRST202' ? 'Run LC-P08H-v1.sql in Supabase, then refresh Accounts.' : 'Could not load accounts. Check your Owner access and try Refresh.')}
   } finally {if(active && id===requestId.current) setLoading(false)}
  })()
  return ()=> {active=false}
 },[query,page,refresh,filters,pageSize])
 const searching=search.trim()!==query
 const busy=loading || saving || searching
 const currentPage=data?.page ?? page
 const pages=Math.max(1,Math.ceil((data?.total ?? 0)/(data?.page_size ?? pageSize)))
 const hasFilters=Boolean(search || filters.role!=='all' || filters.status!=='all' || filters.link!=='all')
 function changeFilter(key: 'role' | 'status' | 'link',value:string) {
  setFilters(previous=>({...previous,[key]:value}));setPage(1);setPending(null);setLinkTarget(null);setNotice('')
 }
 function clearFilters() {
  setSearch('');setQuery('');setFilters({role:'all',status:'all',link:'all'});setPage(1);setPending(null);setLinkTarget(null);setNotice('')
 }
 function go(next:number) {
  setPending(null);setLinkTarget(null);setPage(next)
  listRef.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})
 }
 async function apply() {
  if(!pending || writeLock.current) return
  writeLock.current=true;setSaving(true);setError('');setNotice('')
  const target=pending
  try {
   const {error:failure}=await supabase.rpc('lc_owner_change_access',{p_user_id:target.account.user_id,p_action:target.action,p_expected_updated_at:target.account.updated_at})
   if(failure) throw failure
   if(mounted.current) {setNotice(labels[target.action]+' completed for '+(target.account.email || target.account.display_name)+'.');setPending(null);setRefresh(v=>v+1)}
  } catch(failure) {
   if(mounted.current) {
    const code=(failure as {code?:string}).code
    setError(code==='P0001' ? (failure as {message:string}).message : 'Could not confirm the change. Refresh Accounts to check its current state before trying again.')
    setPending(null);setData(null)
   }
  } finally {writeLock.current=false;if(mounted.current) setSaving(false)}
 }
 function confirmation() {
  if(!pending) return ''
  const a=pending.account
  if(pending.action==='grant_admin') return 'This gives access to members, services, the scanner, attendance records and CSV exports. Account management remains Owner-only.'
  if(pending.action==='revoke_admin') return 'This removes admin workspace access. The login and any linked member record remain.'
  if(pending.action==='suspend') return 'This pauses app access, including admin data access. It does not delete the login, member record or attendance.'
  return 'This Restores App Access with the '+roleName(a.role)+' Role'+(a.role==='admin' ? ', including the admin workspace.' : '.')
 }
 return <div className="lc-accounts" data-change-id="LC-UI-COPY-v2">
  <section className="lca-hero">
   <div><p className="eyebrow">Settings · Owner Workspace</p><h1>Accounts & Access</h1><p>Manage who can use your admin workspace. Login accounts and church member records stay separate.</p></div>
   <div className="lca-owner"><ShieldCheck size={26}/><strong>Owner Controls</strong><span>Your Account is Protected</span></div>
  </section>
  <OwnerProfileRequests/>
  <MemberLinkRequests owner onChanged={()=>{setRefresh(v=>v+1);onLinkChanged()}}/>
  <section className="lca-panel" ref={listRef} aria-labelledby="lca-heading" aria-busy={busy}>
   <header className="lca-heading"><div><p className="eyebrow">People Behind the Logins</p><h2 id="lca-heading">Accounts</h2><p>Access status is separate from a member’s Active / Inactive status.</p></div><button type="button" className="secondary-button lc-refresh-icon" aria-label="Refresh accounts" title="Refresh accounts" aria-busy={loading} disabled={saving || loading} onClick={()=>{setRefresh(v=>v+1);setNotice('')}}><RefreshCw size={17} aria-hidden="true"/></button></header>
   <div className="lca-toolbar lca-filter-toolbar">
    <div className="lca-filter-top"><label><span>Find an Account</span><div className="lca-search"><Search size={17}/><input type="search" value={search} onChange={e=>{setSearch(e.target.value);setPending(null);setLinkTarget(null)}} placeholder="Name, Email, Member ID or Account ID" disabled={saving}/></div></label>
     <div className="lca-filter-tools"><span aria-live="polite">{busy ? 'Updating…' : (data?.total ?? 0)+' Accounts Found'}</span><button type="button" className="secondary-button" disabled={!hasFilters || saving} onClick={clearFilters}>Clear All</button></div>
    </div>
    <div className="lca-filter-fields">
     <label><span>Role</span><select value={filters.role} disabled={saving} onChange={e=>changeFilter('role',e.target.value)}><option value="all">All Roles</option><option value="owner">Owner</option><option value="admin">Admin</option><option value="user">User</option></select></label>
     <label><span>Access</span><select value={filters.status} disabled={saving} onChange={e=>changeFilter('status',e.target.value)}><option value="all">Any Access Status</option><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
     <label><span>Member Link</span><select value={filters.link} disabled={saving} onChange={e=>changeFilter('link',e.target.value)}><option value="all">All Accounts</option><option value="linked">Linked Members</option><option value="unlinked">Not Linked Yet</option></select></label>
    </div>
   </div>
   {notice && <p className="lca-notice" role="status">{notice}</p>}
   {error && <p className="lca-error" role="alert">{uiMessage(error)}</p>}
   {loading || searching ? <div className="lca-loading" role="status">Loading Accounts…</div> : data && <>
    {data.rows.length===0 ? <div className="lca-empty"><h3>No Accounts Match</h3><p>Try another search or clear the filters.</p>{hasFilters && <button className="secondary-button" onClick={clearFilters}>Clear All</button>}</div> :
    <div className="lca-table-wrap"><table className="lca-table"><thead><tr><th>Account</th><th>Role</th><th>Access</th><th>Linked Member</th><th>Actions</th></tr></thead><tbody>
     {data.rows.map(a=><Fragment key={a.user_id}><tr>
      <td data-label="Account"><strong>{a.display_name}{a.user_id===currentUserId && <small> · You</small>}</strong><span>{a.email || 'No Email'}</span></td>
      <td data-label="Role"><span className={'lca-pill '+a.role}>{roleName(a.role)}</span></td>
      <td data-label="Access"><span className={'lca-pill '+a.status}>{a.status==='active'?'Active':'Suspended'}</span></td>
      <td data-label="Linked Member"><div className="lcb-member-cell"><span>{a.member_name || 'Not Linked'}{a.member_number && <small className="lcah-member-number">{a.member_number}</small>}</span></div></td>
      <td data-label="Actions"><div className="lca-actions lca-unified-actions"><button className={"lcb-link-trigger "+(a.member_id ? "is-unlink" : "is-link")} disabled={busy} onClick={()=>{setPending(null);setNotice('');setError('');setLinkTarget(a)}}>{a.member_id ? 'Unlink Member' : 'Link Member'}</button>{a.role==='owner' || a.user_id===currentUserId ? <span className="lca-protected"><ShieldCheck size={14}/>Protected</span> : <>
       {(a.role==='admin' || a.status==='active') && <button className={a.role==='admin'?'lca-action-remove':'lca-action-grant'} disabled={busy} onClick={()=>{setError('');setLinkTarget(null);setPending({account:a,action:a.role==='admin'?'revoke_admin':'grant_admin'})}}>{a.role==='admin'?'Remove Admin':'Grant Admin'}</button>}
       <button className={a.status==='active'?'lca-action-suspend':'lca-action-reactivate'} disabled={busy} onClick={()=>{setError('');setLinkTarget(null);setPending({account:a,action:a.status==='active'?'suspend':'reactivate'})}}>{a.status==='active'?'Suspend':'Reactivate'}</button>
      </>}</div></td>
     </tr>{linkTarget?.user_id===a.user_id && <tr className="lca-confirm-row"><td colSpan={5}><MemberLinkPanel key={a.user_id+ a.updated_at} account={linkTarget} onBusy={setSaving} onCancel={()=>setLinkTarget(null)} onDone={()=>{setLinkTarget(null);setNotice(a.member_id ? 'Member unlinked. Member data and attendance are preserved.' : 'Member linked successfully.');setRefresh(v=>v+1);onLinkChanged()}}/></td></tr>}{pending?.account.user_id===a.user_id && <tr className="lca-confirm-row"><td colSpan={5}><div className="lca-confirm" role="group" aria-label="Confirm Access Change"><div><strong>{labels[pending.action]} for {a.email || a.display_name}?</strong><p>{confirmation()}</p></div><div className="lca-actions"><button disabled={saving} onClick={()=>setPending(null)}>Cancel</button><button className="lca-confirm-button" disabled={saving} onClick={()=>void apply()}>{saving?'Saving…':'Confirm '+labels[pending.action]}</button></div></div></td></tr>}</Fragment>)}
    </tbody></table></div>}

   </>}
    <footer className="lca-pagination lcah-pagination">
     <div className="lcah-page-summary"><span>{(data?.total ?? 0) ? ((currentPage-1)*(data?.page_size ?? pageSize)+1)+'–'+Math.min(currentPage*(data?.page_size ?? pageSize),(data?.total ?? 0))+' of '+(data?.total ?? 0)+' Accounts' : '0 Accounts'}</span>
      <label className="lcah-page-size"><span>Per Page</span><span className="lcah-size-field"><select aria-label="Accounts per Page" value={pageSize} disabled={busy} onChange={e=>{setPageSize(Number(e.target.value));setPage(1);setPending(null);setLinkTarget(null);setNotice('')}}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select><ChevronDown size={14} aria-hidden="true"/></span></label>
     </div>
     <nav aria-label="Account Pages"><button aria-label="First Page" disabled={busy || !data || !!error || currentPage===1} onClick={()=>go(1)}><ChevronsLeft size={17}/></button><button aria-label="Previous Page" disabled={busy || !data || !!error || currentPage===1} onClick={()=>go(currentPage-1)}><ChevronLeft size={17}/></button><span>{currentPage} / {pages}</span><button aria-label="Next Page" disabled={busy || !data || !!error || currentPage>=pages} onClick={()=>go(currentPage+1)}><ChevronRight size={17}/></button><button aria-label="Last Page" disabled={busy || !data || !!error || currentPage>=pages} onClick={()=>go(pages)}><ChevronsRight size={17}/></button></nav>
    </footer>
  </section>
 </div>
}

type MemberCandidate = {
 id:string;first_name:string;last_name:string;member_number:string;email:string|null;mobile:string|null;
 status:string;updated_at:string;already_linked:boolean
}
function MemberLinkPanel({account,onBusy,onCancel,onDone}:{
 account:Account;onBusy:(busy:boolean)=>void;onCancel:()=>void;onDone:()=>void
}) {
 const [search,setSearch]=useState('')
 const [page,setPage]=useState(1)
 const [result,setResult]=useState<{rows:MemberCandidate[];total:number;page:number}|null>(null)
 const [loading,setLoading]=useState(false)
 const [selected,setSelected]=useState<MemberCandidate|null>(null)
 const [error,setError]=useState('')
 const [saving,setSaving]=useState(false)
 const lock=useRef(false)
 const alive=useRef(true)
 useEffect(()=>{alive.current=true;return ()=>{alive.current=false}},[])
 useEffect(()=>{
  if(account.member_id || search.trim().length<2){setResult(null);setLoading(false);return}
  let active=true
  setLoading(true);setResult(null)
  const timer=window.setTimeout(()=>{
   void (async()=>{
    try{
     const {data,error:failure}=await supabase.rpc('lc_owner_member_candidates',{p_search:search.trim(),p_page:page})
     if(failure)throw failure
     if(active)setResult(data)
    }catch{if(active)setError('Could not search members. Check that LC-P08H-v1.sql is installed, then try again.')}
    finally{if(active)setLoading(false)}
   })()
  },300)
  return ()=>{active=false;window.clearTimeout(timer)}
 },[search,page,account.member_id])
 async function save(){
  if(lock.current || (!account.member_id && !selected))return
  lock.current=true;setSaving(true);onBusy(true);setError('')
  try{
   const {error:failure}=await supabase.rpc('lc_owner_set_member_link',{
    p_user_id:account.user_id,p_member_id:account.member_id?null:selected!.id,
    p_expected_updated_at:account.updated_at,p_expected_member_updated_at:account.member_id?null:selected!.updated_at
   })
   if(failure)throw failure
   if(alive.current)onDone()
  }catch(failure){
   if(alive.current)setError((failure as {code?:string}).code==='P0001' ? (failure as {message:string}).message : 'Could not confirm this change. Close this panel and Refresh Accounts to check the current link before retrying.')
  }finally{lock.current=false;onBusy(false);if(alive.current)setSaving(false)}
 }
 return <section className="lcb-panel" aria-label={account.member_id?'Unlink Member Confirmation':'Link a Member'}>
  <header><div><p className="eyebrow">Verified Member Connection</p><h3>{account.member_id?'Unlink This Member?':'Find the Right Member'}</h3></div><button disabled={saving} onClick={onCancel}>Cancel</button></header>
  <div className="lcb-identities"><div><small>Login Account</small><strong>{account.display_name}</strong><span>{account.email || 'No Email'}</span><span>{roleName(account.role)} · {uiStatus(account.status)}</span></div>
   <div><small>{account.member_id?'Currently Linked Member':'Selected Member'}</small><strong>{account.member_id ? account.member_name || 'Linked Member' : selected ? selected.first_name+' '+selected.last_name : 'Choose an Existing Profile Below'}</strong>{selected && <><span>{selected.member_number} · {uiStatus(selected.status)}</span><span>{selected.email || 'No Email'} · {selected.mobile || 'No Mobile'}</span></>}</div>
  </div>
  {!account.member_id && <>
   <label className="lcb-search-label">Search the Directory<input autoFocus type="search" disabled={saving} value={search} placeholder="Name, member ID, email or mobile — 2+ characters" onChange={e=>{setSearch(e.target.value);setPage(1);setSelected(null);setResult(null);setError('')}}/></label>
   {loading ? <p role="status">Searching Members…</p> : result ? <>
    <div className="lcb-results">{result.rows.map(m=><button key={m.id} disabled={saving || m.already_linked} aria-pressed={selected?.id===m.id} onClick={()=>setSelected(m)}><span><strong>{m.first_name} {m.last_name}</strong><small>{m.member_number} · {uiStatus(m.status)}</small><small>{m.email || 'No Email'} · {m.mobile || 'No Mobile'}</small></span><span>{m.already_linked?'Already Linked':selected?.id===m.id?'Selected':'Select'}</span></button>)}</div>
    {result.total===0 && <p>No members match. Try their member ID or another name.</p>}
    {result.total>25 && <div className="lcb-pager"><button disabled={saving || result.page<=1} onClick={()=>{setPage(result.page-1);setSelected(null)}}>Previous</button><span>Page {result.page} of {Math.ceil(result.total/25)}</span><button disabled={saving || result.page*25>=result.total} onClick={()=>{setPage(result.page+1);setSelected(null)}}>Next</button></div>}
   </> : <p>Search by an existing member’s details. Members without an email can be linked too.</p>}
  </>}
  <p className="lcb-helper">{account.member_id ? 'The login will no longer be connected to this member. Their QR ID, member profile and attendance remain intact. Account role and access status stay the same.' : 'Verify that the login belongs to this person before confirming. Matching names or emails alone do not prove identity. Linking does not overwrite contact details or change access roles.'}</p>
  {error && <p className="lca-error" role="alert">{uiMessage(error)}</p>}
  <footer><button className="lcb-confirm" disabled={saving || (!account.member_id && !selected)} onClick={()=>void save()}>{saving?'Saving…':account.member_id?'Confirm Unlink':'Confirm Link'}</button></footer>
 </section>
}
