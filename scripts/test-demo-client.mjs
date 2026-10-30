import assert from 'node:assert/strict'
import test from 'node:test'
import { registerHooks } from 'node:module'

// Resolve the application's extensionless TypeScript imports in Node's built-in
// type-stripping runner. The same production engine is exercised, never a fake.
registerHooks({resolve(specifier,context,next){try{return next(specifier,context)}catch(error){if(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier))return next(specifier+'.ts',context);throw error}}})
const {createDemoClient,DEMO_STORAGE_KEY}=await import('../src/demo/client.ts')
const now=Date.parse('2026-10-30T05:00:00Z')
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k),values}}
const make=(s=storage())=>createDemoClient({storage:s,now:()=>now})
const rpc=async(client,name,args={})=>{const result=await client.rpc(name,args);assert.equal(result.error,null,JSON.stringify(result.error));return result.data}
const directory=(client,args={})=>rpc(client,'lc_members_page',{p_status:'all',p_ministry:'all',p_church:'all',p_sort:'name-asc',p_page:1,p_size:25,...args})

test('seed has 600 unique fictional members, complete schedules and thousands of saved attendance snapshots',async()=>{
 const c=make(),members=await directory(c,{p_size:1000}),services=await rpc(c,'lc_services_page',{p_archive:'all',p_size:1000})
 assert.equal(members.registered,600);assert.equal(members.active,540);assert.equal(new Set(members.rows.map(m=>m.first_name+' '+m.last_name)).size,600)
 assert.ok(members.rows.every(m=>m.email.endsWith('@example.com')));assert.equal(services.registered,82)
 assert.ok(services.rows.some(e=>e.state==='in-progress'));assert.ok(services.rows.some(e=>e.state==='upcoming'));assert.ok(services.rows.some(e=>e.state==='completed'));assert.ok(services.rows.some(e=>e.state==='archived'))
 assert.ok(services.rows.every(e=>e.is_sunday_service===(new Date(Date.parse(e.starts_at)+8*3_600_000).getUTCDay()===0)))
 const feedback=await rpc(c,'lc_feedback_page',{p_status:'all',p_category:'all',p_query:'',p_page:1});assert.equal(new Set(feedback.rows.map(row=>row.id.slice(0,8))).size,feedback.rows.length)
 const report=await rpc(c,'attendance_report_v4',{p_filters:{scope:'all'},p_as_of:new Date(now).toISOString(),p_limit:10})
 assert.equal(report.report_version,4);assert.ok(report.total>4000);assert.ok(report.rows.every(r=>r.churches.length&&r.snapshot_version===1));assert.ok(c.__demo.serializedBytes()<2_000_000)
})
test('visitor storage is isolated, survives refresh, resets only its own namespace, and handles storage denial',async()=>{
 const first=storage(),second=storage();first.setItem('real-app:preference','keep');const a=make(first),b=make(second)
 const saved=await a.from('ministries').insert({name:'Only visitor A'}).select('*').single();assert.equal(saved.error,null)
 assert.equal((await directory(b)).ministries.some(m=>m.name==='Only visitor A'),false);assert.equal((await directory(make(first))).ministries.some(m=>m.name==='Only visitor A'),true)
 a.__demo.reset();assert.equal((await directory(a)).ministries.some(m=>m.name==='Only visitor A'),false);assert.equal(first.getItem('real-app:preference'),'keep');assert.ok(first.getItem(DEMO_STORAGE_KEY))
 const blocked=createDemoClient({storage:{getItem(){throw Error('blocked')},setItem(){throw Error('quota')},removeItem(){}},now:()=>now});assert.equal((await directory(blocked)).registered,600)
})
test('service field updates compare saved values and deletion Undo never replaces an attended service',async()=>{
 const c=make(),services=await rpc(c,'lc_services_page',{p_archive:'all',p_size:1000}),future=services.rows.find(e=>e.state==='upcoming')
 assert.equal((await c.from('events').update({is_sunday_service:!future.is_sunday_service}).eq('id',future.id).eq('is_sunday_service',future.is_sunday_service).select('*').maybeSingle()).error,null)
 assert.equal((await c.from('events').update({is_sunday_service:false}).eq('id',future.id).eq('is_sunday_service',future.is_sunday_service).select('*').maybeSingle()).data,null)
 const deleted=await c.from('events').delete().eq('id',future.id).select('*').single();assert.equal(deleted.error,null);assert.equal((await c.from('events').insert(deleted.data).select('*').single()).error,null)
 const attended=services.rows.find(e=>e.check_ins>0);assert.equal((await c.from('events').delete().eq('id',attended.id)).error.code,'23503')
})
test('directory constraints, duplicate rename and member contact uniqueness match app behavior',async()=>{
 const c=make(),data=await directory(c),used=data.ministries.find(m=>data.ministry_counts[m.id]>0),empty=data.ministries.find(m=>!data.ministry_counts[m.id])
 assert.equal((await c.rpc('lc_delete_empty_ministry',{p_id:used.id})).error.code,'23503');const removed=await rpc(c,'lc_delete_empty_ministry',{p_id:empty.id});assert.equal(removed.id,empty.id)
 assert.equal((await c.from('ministries').insert(removed).select('*').single()).error,null)
 assert.equal((await c.from('ministries').update({name:used.name}).eq('id',empty.id)).error.code,'23505')
 const [a,b]=data.rows;assert.equal((await c.from('members').update({email:b.email}).eq('id',a.id)).error.code,'23505');assert.equal((await c.from('members').select('*').eq('id',a.id).single()).data.email,a.email)
})
test('attendance removal restores the original snapshot and rejects a conflicting newer check-in',async()=>{
 const c=make(),report=await rpc(c,'attendance_report_v4',{p_filters:{scope:'completed'},p_limit:1}),row=report.rows[0],removed=await rpc(c,'lc_remove_attendance_with_undo',{p_id:row.id})
 const restored=await rpc(c,'lc_restore_attendance',{p_undo_token:removed.undo_token});assert.deepEqual(restored,removed.attendance)
 const again=await rpc(c,'lc_remove_attendance_with_undo',{p_id:row.id});const replacement=await c.from('attendance').insert({event_id:row.event_id,member_id:row.member_id}).select('*').single();assert.equal(replacement.error,null)
 assert.ok((await c.rpc('lc_restore_attendance',{p_undo_token:again.undo_token})).error);assert.equal((await c.from('attendance').select('*').eq('id',replacement.data.id).single()).data.id,replacement.data.id)
})
test('member role can request changes, owner approves them, and member history and QR reflect the same profile',async()=>{
 const c=make();c.__demo.setRole('member');const editor=await rpc(c,'lc_profile_editor'),portal=await rpc(c,'lc_my_member_portal',{p_service_page:1});assert.equal(editor.member_id,portal.profile.id);assert.ok(portal.profile.qr_token);assert.ok(!('admin_note'in portal.profile))
 const requested={...editor.values,first_name:'Updated Demo Name'};const request=await rpc(c,'lc_request_profile_changes',{p_member_id:editor.member_id,p_expected:editor.values,p_requested:requested})
 c.__demo.setRole('owner');await rpc(c,'lc_review_profile_request',{p_id:request.id,p_decision:'approved',p_expected_updated_at:request.updated_at,p_note:'Checked in the private demo.'})
 c.__demo.setRole('member');assert.equal((await rpc(c,'lc_my_member_portal',{p_service_page:1})).profile.first_name,'Updated Demo Name');const history=await rpc(c,'lc_my_attendance_history',{p_page:1});assert.equal(history.member_id,editor.member_id);assert.ok(history.total>0)
})
test('feedback status is shared between owner and sender within one visitor session, anonymous identity stays owner-only',async()=>{
 const c=make();c.__demo.setRole('member');const submitted=await rpc(c,'lc_submit_feedback',{p_request_id:'test-request',p_category:'idea',p_subject:'Demo idea',p_message:'A fictional suggestion.',p_anonymous:true,p_page:'Member Space'})
 assert.equal((await rpc(c,'lc_submit_feedback',{p_request_id:'test-request',p_subject:'Ignored retry',p_message:'Retry.'})).submitted,true)
 assert.equal((await c.rpc('lc_feedback_identity',{p_id:submitted.id})).error.code,'42501');c.__demo.setRole('owner')
 const inbox=await rpc(c,'lc_feedback_page',{p_status:'all',p_category:'all',p_query:'Demo idea',p_page:1});assert.equal(inbox.total,1);assert.equal(inbox.rows[0].identity,null)
 await rpc(c,'lc_feedback_set_status',{p_id:submitted.id,p_status:'resolved'});c.__demo.setRole('member');const mine=await rpc(c,'lc_my_feedback',{p_page:1});assert.equal(mine.rows.find(r=>r.id===submitted.id).status,'resolved')
})
test('guest and member cannot reach owner tables or mutations, unknown operations fail closed',async()=>{
 const c=make();c.__demo.setRole('guest');assert.equal((await c.auth.getSession()).data.session,null);const publicRows=await rpc(c,'lc_guest_services',{p_page:1});assert.ok(publicRows.rows.length);assert.ok(publicRows.rows.every(e=>!('admin_note'in e)&&!('check_ins'in e)))
 assert.ok((await c.from('members').select('*')).error);assert.ok((await c.rpc('lc_members_page',{})).error)
 c.__demo.setRole('member');assert.ok((await c.from('members').select('*')).error);assert.ok((await c.rpc('lc_owner_accounts_page',{})).error)
 c.__demo.setRole('owner');assert.equal((await c.from('accounts').update({role:'owner'})).error.code,'42P01');assert.equal((await c.rpc('unknown_demo_rpc')).error.code,'PGRST202')
})
test('member imports are atomic and idempotent, including named assignments',async()=>{
 const c=make(),row={firstName:'DemoImport',lastName:'Visitor',email:'import.person@example.com',mobile:'',ministryNames:['Demo New Ministry'],branchNames:['LifeCity - Main'],adminNote:'Fictional.'}
 assert.equal((await rpc(c,'lc_import_members',{p_request_id:'one-batch',p_rows:[row]})).imported,1);assert.equal((await rpc(c,'lc_import_members',{p_request_id:'one-batch',p_rows:[row]})).imported,1);assert.equal((await directory(c)).registered,601)
 assert.ok((await c.rpc('lc_import_members',{p_request_id:'bad-batch',p_rows:[{...row,email:'another.import@example.com'},{...row,email:'import.person@example.com'}]})).error);assert.equal((await directory(c)).registered,601)
})
test('reports honor filters and export pagination keeps a stable revision until data changes',async()=>{
 const c=make(),args={p_filters:{scope:'completed'},p_as_of:new Date(now).toISOString(),p_limit:25},first=await rpc(c,'attendance_report_v4',args),second=await rpc(c,'attendance_report_v4',{...args,p_offset:25})
 assert.equal(first.revision,second.revision);assert.equal(first.total,second.total);assert.ok(!first.rows.some(a=>second.rows.some(b=>a.id===b.id)))
 const filtered=await rpc(c,'attendance_report_v4',{...args,p_filters:{scope:'completed',event_id:first.rows[0].event_id,sunday_only:true}});assert.ok(filtered.rows.every(r=>r.event_id===first.rows[0].event_id&&r.sunday_service))
 const revision=first.revision;await rpc(c,'lc_remove_attendance_with_undo',{p_id:first.rows[0].id});assert.notEqual((await rpc(c,'attendance_report_v4',args)).revision,revision)
})
test('profile approval merges only requested fields and rejects deleted assignments while decline remains available',async()=>{
 const c=make();c.__demo.setRole('member');let editor=await rpc(c,'lc_profile_editor');const request=await rpc(c,'lc_request_profile_changes',{p_member_id:editor.member_id,p_expected:editor.values,p_requested:{...editor.values,email:'changed.member@example.com'}})
 c.__demo.setRole('owner');assert.equal((await c.from('members').update({first_name:'Owner Changed Name'}).eq('id',editor.member_id)).error,null)
 await rpc(c,'lc_review_profile_request',{p_id:request.id,p_decision:'approved',p_expected_updated_at:request.updated_at,p_note:'Verified.'});c.__demo.setRole('member');editor=await rpc(c,'lc_profile_editor');assert.equal(editor.values.first_name,'Owner Changed Name');assert.equal(editor.values.email,'changed.member@example.com')
 const empty=editor.ministries.find(n=>n.name==='Welcome Volunteers'),next=await rpc(c,'lc_request_profile_changes',{p_member_id:editor.member_id,p_expected:editor.values,p_requested:{...editor.values,ministries:[...editor.values.ministries,empty.id]}})
 c.__demo.setRole('owner');await rpc(c,'lc_delete_empty_ministry',{p_id:empty.id});assert.ok((await c.rpc('lc_review_profile_request',{p_id:next.id,p_decision:'approved',p_expected_updated_at:next.updated_at})).error)
 const accounts=await rpc(c,'lc_owner_accounts_page',{p_search:'demo.member@example.com',p_role:'all',p_status:'all',p_link:'all',p_page:1,p_size:25}),account=accounts.rows[0]
 await rpc(c,'lc_owner_change_access',{p_user_id:account.user_id,p_action:'suspend',p_expected_updated_at:account.updated_at});const declined=await rpc(c,'lc_review_profile_request',{p_id:next.id,p_decision:'declined',p_expected_updated_at:next.updated_at,p_note:'Please submit current details after reactivation.'});assert.equal(declined.status,'declined')
})
test('bulk changes write one compact save, and saved attendance deltas reload without recapturing history',async()=>{
 const s=storage();let writes=0;const write=s.setItem;s.setItem=(k,v)=>{writes++;write(k,v)};const c=make(s),rows=(await directory(c)).rows,baseline=writes
 assert.equal((await c.from('members').update({is_starred:true}).in('id',rows.map(r=>r.id))).error,null);assert.equal(writes-baseline,1)
 const report=await rpc(c,'attendance_report_v4',{p_filters:{scope:'completed'},p_limit:1}),removed=await rpc(c,'lc_remove_attendance_with_undo',{p_id:report.rows[0].id});const refreshed=make(s),after=await rpc(refreshed,'attendance_report_v4',{p_filters:{scope:'completed'},p_limit:1000})
 assert.equal(after.total,report.total-1);assert.ok(!after.rows.some(r=>r.id===removed.attendance.id));assert.deepEqual(await rpc(refreshed,'lc_restore_attendance',{p_undo_token:removed.undo_token}),removed.attendance)
})
test('member search follows contact fields and importing after an empty-member deletion keeps unique numbers',async()=>{
 const c=make(),all=await directory(c,{p_size:1000}),person=all.rows[0],matches=await directory(c,{p_search:person.first_name+' '+person.last_name});assert.equal(matches.total,1)
 assert.equal((await directory(c,{p_search:'fictional'})).total,0)
 const empty=all.rows.find(m=>m.member_number==='DEMO-0590');assert.equal((await c.from('members').delete().eq('id',empty.id)).error,null)
 await rpc(c,'lc_import_members',{p_request_id:'after-delete',p_rows:[{firstName:'New Demo',lastName:'Import',email:'after.delete@example.com',mobile:'',branchNames:['LifeCity - Main'],ministryNames:[],adminNote:''}]})
 const next=await directory(c,{p_size:1000});assert.equal(next.registered,600);assert.equal(new Set(next.rows.map(m=>m.member_number)).size,600)
})
