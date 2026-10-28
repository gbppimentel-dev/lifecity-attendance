import FeedbackInbox from './FeedbackInbox'
import RubberSegment from './RubberSegment'
// Change ID: LC-P06B-v1
import { MotionSettings } from '../lib/motion'
import { useState } from 'react'
import { History, Palette, ShieldCheck, MessageSquare } from 'lucide-react'
import ActivityHistory from './ActivityHistory'
import AccountsSettings from './AccountsSettings'
import AppearanceSettings from './AppearanceSettings'

export default function SettingsWorkspace(props: {currentUserId:string;onLinkChanged:()=>void}) {
 const [tab,setTab]=useState<'accounts'|'appearance'|'history'|'feedback'>('accounts')
 return <><RubberSegment as="nav" variant="navigation" className="lct-tabs" ariaLabel="Settings Sections"
   value={tab} onChange={value=>setTab(value as typeof tab)} equalSlots size="lg" draggable
   items={[
    {value:'accounts',label:'Accounts & Access',icon:<ShieldCheck size={17}/>},
    {value:'appearance',label:'Appearance',icon:<Palette size={17}/>},
    {value:'history',label:'Activity History',icon:<History size={17}/>},
    {value:'feedback',label:'Feedback',icon:<MessageSquare size={17}/>},
   ]}/>{tab==='accounts'?<AccountsSettings {...props}/>:tab==='appearance'?<><MotionSettings/><AppearanceSettings/></>:tab==='feedback'?<FeedbackInbox/>:<ActivityHistory/>}</>
}
