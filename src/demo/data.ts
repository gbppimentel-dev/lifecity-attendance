import { defaultTokens } from '../lib/theme'
import type { DemoRow, DemoState } from './types'

export const demoId = (kind: number, index: number) => `${kind.toString(16).padStart(8, '0')}-0000-4000-8000-${index.toString(16).padStart(12, '0')}`
const firstNames = ['Adrian','Amara','Angelo','Bea','Caleb','Camille','Daniel','Elena','Elias','Emilia','Gabriel','Hannah','Isaac','Isabel','Jacob','Jasmine','Joel','Julia','Liam','Lucia','Marco','Maya','Nathan','Nina','Noah','Olivia','Paolo','Rafael','Samuel','Sofia']
const lastNames = ['Aguilar','Alonzo','Bautista','Castillo','Castro','Cruz','Delgado','Flores','Garcia','Lim','Lopez','Mercado','Navarro','Padilla','Ramos','Reyes','Rivera','Santos','Torres','Villanueva']
const ministries = ['Counseling & Care','Discipleship','Hospitality','Kids','Media','Men','Missions','Outreach','Prayer','Production','Women','Worship','Young Adults','Youth','Welcome Volunteers']
const churches = ['Main','East','Hillside','Lakeside','North','Riverside','South','West','Garden']
export function defaultDemoAppearance(revision = 0): DemoRow {
  return { primary_color: defaultTokens.primary, secondary_color: defaultTokens.secondary, highlight_color: defaultTokens.highlight, use_default: true, tokens: { ...defaultTokens }, revision }
}
export function affiliations(state: DemoState, memberId: string, kind: 'churches' | 'ministries'): DemoRow[] {
  const table = kind === 'churches' ? 'branches' : 'ministries', link = kind === 'churches' ? 'member_branches' : 'member_ministries', key = kind === 'churches' ? 'branch_id' : 'ministry_id'
  const ids = new Set(state.tables[link].filter(row => row.member_id === memberId).map(row => row[key]))
  return state.tables[table].filter(row => ids.has(row.id)).map(({ id, name }) => ({ id, name }))
}
export function captureAttendance(state: DemoState, member: DemoRow, event: DemoRow, checkedInAt: string): DemoRow {
  return { first_name: member.first_name, last_name: member.last_name, member_number: member.member_number, email: member.email, mobile: member.mobile, member_status: member.status, churches: affiliations(state,member.id,'churches'), ministries: affiliations(state,member.id,'ministries'), service_name: event.name, service_date: event.starts_at, service_end: event.ends_at, service_location: event.location, sunday_service: event.is_sunday_service, member_group: null, notes: null, snapshot_source: 'Captured at Check-In', snapshot_captured_at: checkedInAt, snapshot_version: 1 }
}
/** Entirely fictional, deterministic people; dates are anchored to this visitor's reset. */
export function createDemoState(now = Date.now()): DemoState {
  const iso = (time: number) => new Date(time).toISOString(), day = 86_400_000
  const state: DemoState = { version:1, seededAt:iso(now), revision:1, role:'owner', tables:{ members:[],events:[],attendance:[],ministries:[],branches:[],member_ministries:[],member_branches:[],accounts:[],member_requests:[],profile_requests:[],feedback:[],activity:[] }, appearance:defaultDemoAppearance(), undo:{}, imports:{} }
  state.tables.ministries = ministries.map((name,i)=>({id:demoId(3,i+1),name,created_at:iso(now-100*day)}))
  state.tables.branches = churches.map((name,i)=>({id:demoId(4,i+1),name:`LifeCity - ${name}`,created_at:iso(now-100*day)}))
  for(let i=0;i<600;i++) {
    const first_name=firstNames[i%firstNames.length],last_name=lastNames[Math.floor(i/firstNames.length)]
    const member={id:demoId(1,i+1),first_name,last_name,member_number:`DEMO-${String(i+1).padStart(4,'0')}`,email:`${first_name.toLowerCase()}.${last_name.toLowerCase()}@example.com`,mobile:i%5===0?null:`09${String(170000000+i).padStart(9,'0')}`,status:i>=540?'inactive':'active',is_starred:i%23===0,qr_token:demoId(9,i+1),admin_note:i%3===0?'Fictional demo profile. Enjoys serving with the community and welcoming new visitors.':null,created_at:iso(now-(60+i%360)*day),updated_at:iso(now-3*day)}
    state.tables.members.push(member)
    state.tables.member_branches.push({member_id:member.id,branch_id:demoId(4,i%8+1)})
    if(i%11===0)state.tables.member_branches.push({member_id:member.id,branch_id:demoId(4,(i+1)%8+1)})
    if(i%7!==0)state.tables.member_ministries.push({member_id:member.id,ministry_id:demoId(3,i%14+1)})
    if(i%9===0)state.tables.member_ministries.push({member_id:member.id,ministry_id:demoId(3,(i+3)%14+1)})
  }
  const eventNames=['Sunday Celebration','Midweek Prayer Gathering','Youth Night','Community Care Gathering','Volunteer Team Workshop','Young Adults Fellowship']
  for(let i=0;i<82;i++) {
    const starts=i<41?now-(41-i)*day:i===41?now-30*60_000:now+(i-42)*day+60*60_000
    const weekday=new Date(starts+8*3_600_000).getUTCDay(),isSunday=weekday===0
    const theme=[0,4,5,1,4,2,3][weekday],name=i===41?(isSunday?'Sunday Celebration (Current Service)':'Current Community Gathering'):eventNames[theme],branch=churches[i%8]
    state.tables.events.push({id:demoId(2,i+1),name:`${name} · ${new Date(starts+8*3_600_000).toISOString().slice(0,10)}`,starts_at:iso(starts),ends_at:null,location:`LifeCity - ${branch} ${i%3===0?'Community Hall':'Worship Hall'}`,is_sunday_service:isSunday,archived_at:i<20&&i%9===0?iso(starts+day):null,is_public:i%5!==0,admin_note:i%3===0?null:'Fictional demo service. Coordinate with the welcome and volunteer teams before check-in.',created_at:iso(starts-14*day),updated_at:iso(now-2*day)})
  }
  for(let i=0;i<42;i++) {
    const event=state.tables.events[i],count=i===41?24:92+(i*17)%70
    for(let j=0;j<count;j++) {
      const member=state.tables.members[j<20?j:(j*7+i*13)%540],checked=iso(Math.min(now-1000,Date.parse(event.starts_at)+(10+j%75)*60_000))
      if(state.tables.attendance.some(row=>row.event_id===event.id&&row.member_id===member.id))continue
      state.tables.attendance.push({id:demoId(5,i*200+j+1),member_id:member.id,event_id:event.id,checked_in_at:checked,status:'present',created_at:checked,scanned_by:demoId(6,2),notes:null,report_snapshot:captureAttendance(state,member,event,checked)})
    }
  }
  const accountSeeds=[['Demo Owner','demo.owner@example.com','owner','active',0],['Demo Admin','demo.admin@example.com','admin','active',1],['Demo Member','demo.member@example.com','user','active',2],['Avery Quinn','avery.quinn@example.com','user','active',null],['Jordan Blake','jordan.blake@example.com','user','active',4],['Casey Morgan','casey.morgan@example.com','user','suspended',null]]
  state.tables.accounts=accountSeeds.map(([display_name,email,role,status,index],i)=>({user_id:demoId(6,i+1),email,display_name,role,status,member_id:typeof index==='number'?demoId(1,index+1):null,updated_at:iso(now-(i+1)*day),foundation_version:'LC-P01-02-v1'}))
  state.tables.member_requests=[{id:demoId(7,1),user_id:demoId(6,4),full_name:'Avery Quinn',member_number:'DEMO-0021',contact:'avery.quinn@example.com',church:'LifeCity - Main',status:'pending',review_note:'',created_at:iso(now-day),updated_at:iso(now-day)}]
  const m=state.tables.members[4],values={first_name:m.first_name,last_name:m.last_name,email:m.email,churches:affiliations(state,m.id,'churches').map(n=>n.id),ministries:affiliations(state,m.id,'ministries').map(n=>n.id)}
  state.tables.profile_requests=[{id:demoId(8,1),user_id:demoId(6,5),member_id:m.id,base:values,requested:{...values,email:'updated.profile@example.com'},status:'pending',review_note:'',created_at:iso(now-2*day),updated_at:iso(now-2*day)}]
  state.tables.feedback=[['bug','Search retains an old filter','After switching between pages, a previous filter can be easy to miss.','new'],['idea','A volunteer welcome checklist','It would be useful to have a short checklist before a gathering.','reviewing'],['improvement','Clearer check-in instructions','The camera guide makes it easier to scan the member ID.','resolved'],['other','Thank you to the welcome team','A fictional example of feedback submitted by a member.','closed']].map(([category,subject,message,status],i)=>({id:demoId(0x8d73a100+i*0x00a6b1c3,i+1),user_id:demoId(6,i%3+1),category,subject,message,status,anonymous:i===0,page:'Member Space',created_at:iso(now-(i+1)*day),updated_at:iso(now-i*day),status_revision:i+1,read_revision:0}))
  state.tables.activity=Array.from({length:24},(_,i)=>({id:demoId(11,i+1),actor_id:demoId(6,i%2+1),actor_name:i%2?'Demo Admin':'Demo Owner',actor_email:i%2?'demo.admin@example.com':'demo.owner@example.com',target_id:state.tables.members[i].id,target_name:`${state.tables.members[i].first_name} ${state.tables.members[i].last_name}`,target_email:state.tables.members[i].email,target_member_number:state.tables.members[i].member_number,category:i%2?'profiles':'attendance',action:i%2?'member_update':'attendance_insert',before_value:i%2?{Status:'inactive'}:{},after_value:i%2?{Status:'active'}:{Service:'Sunday Celebration'},created_at:iso(now-i*3_600_000)}))
  return state
}
