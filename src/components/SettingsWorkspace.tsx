import FeedbackInbox from './FeedbackInbox'
// Change ID: LC-P06B-v1
import { MotionSettings } from '../lib/motion'
import { useState } from 'react'
import { History, Palette, ShieldCheck, MessageSquare } from 'lucide-react'
import ActivityHistory from './ActivityHistory'
import AccountsSettings from './AccountsSettings'
import AppearanceSettings from './AppearanceSettings'

export default function SettingsWorkspace(props: {currentUserId:string;onLinkChanged:()=>void}) {
 const [tab,setTab]=useState<'accounts'|'appearance'|'history'|'feedback'>('accounts')
 return <><nav className="lct-tabs" aria-label="Settings Sections"><button type="button" aria-current={tab==='accounts'?'page':undefined} onClick={()=>setTab('accounts')}><ShieldCheck size={17}/>Accounts & Access</button><button type="button" aria-current={tab==='appearance'?'page':undefined} onClick={()=>setTab('appearance')}><Palette size={17}/>Appearance</button><button type="button" aria-current={tab==='history'?'page':undefined} onClick={()=>setTab('history')}><History size={17}/>Activity History</button><button type="button" aria-current={tab==='feedback'?'page':undefined} onClick={()=>setTab('feedback')}><MessageSquare size={17}/>Feedback</button></nav>{tab==='accounts'?<AccountsSettings {...props}/>:tab==='appearance'?<><MotionSettings/><AppearanceSettings/></>:tab==='feedback'?<FeedbackInbox/>:<ActivityHistory/>}</>
}
