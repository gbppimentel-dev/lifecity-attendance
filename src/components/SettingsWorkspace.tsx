// Change ID: LC-P06B-v1
import { useEffect, useRef, useState } from 'react'
import { History, Palette, ShieldCheck, RotateCcw, Save } from 'lucide-react'
import ActivityHistory from './ActivityHistory'
import AccountsSettings from './AccountsSettings'
import { supabase } from '../lib/supabase'
import { applyAppearance, defaultAppearance, isAppearance, onColor, type Appearance } from '../lib/appearance'

export default function SettingsWorkspace(props: {currentUserId:string;onLinkChanged:()=>void}) {
 const [tab,setTab]=useState<'accounts'|'appearance'|'history'>('accounts')
 return <><nav className="lct-tabs" aria-label="Settings Sections"><button type="button" aria-current={tab==='accounts'?'page':undefined} onClick={()=>setTab('accounts')}><ShieldCheck size={17}/>Accounts & Access</button><button type="button" aria-current={tab==='appearance'?'page':undefined} onClick={()=>setTab('appearance')}><Palette size={17}/>Appearance</button><button type="button" aria-current={tab==='history'?'page':undefined} onClick={()=>setTab('history')}><History size={17}/>Activity History</button></nav>{tab==='accounts'?<AccountsSettings {...props}/>:tab==='appearance'?<AppearanceSettings/>:<ActivityHistory/>}</>
}
function AppearanceSettings(){
 const [saved,setSaved]=useState<Appearance|null>(null)
 const [draft,setDraft]=useState<Appearance>(defaultAppearance)
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false)
 const [message,setMessage]=useState(''),[error,setError]=useState('')
 const [reset,setReset]=useState(false)
 const alive=useRef(true),lock=useRef(false)
 useEffect(()=>{alive.current=true;void reload();return()=>{alive.current=false}},[])
 async function reload(){
  setLoading(true);setError('');setMessage('');setReset(false)
  try {const {data,error:failure}=await supabase.rpc('lc_get_appearance');if(failure)throw failure;if(!isAppearance(data))throw new Error('Invalid response');if(alive.current){setSaved(data);setDraft(data);applyAppearance(data)}}
  catch {if(alive.current)setError('Could not load appearance. Run LC-P06A-v1.sql, then select Reload Saved Colors.')}
  finally {if(alive.current)setLoading(false)}
 }
 async function save(value:Appearance){
  if(!saved||lock.current)return
  lock.current=true;setSaving(true);setError('');setMessage('')
  try{
   const {data,error:failure}=await supabase.rpc('lc_save_appearance',{p_primary:value.primary_color,p_secondary:value.secondary_color,p_highlight:value.highlight_color,p_default:value.use_default,p_revision:saved.revision})
   if(failure)throw failure;if(!isAppearance(data))throw new Error('Invalid response')
   applyAppearance(data)
   if(alive.current){setSaved(data);setDraft(data);setReset(false);setMessage(data.use_default?'LifeCity’s original colors have been restored.':'Appearance saved. Other open sessions update within a minute or when reopened.')}
  }catch(failure){if(alive.current){setReset(false);setError((failure as {code?:string}).code==='P0001'?(failure as {message:string}).message:'Could not confirm the save. Reload saved colors to check the current settings.')}}
  finally{lock.current=false;if(alive.current)setSaving(false)}
 }
 const changed=saved&&(['primary_color','secondary_color','highlight_color','use_default'] as const).some(k=>draft[k]!==saved[k])
 return <section className="lct-panel"><header><p className="eyebrow">Settings · Owner Workspace</p><h1>Appearance</h1><p>Make LifeCity feel like your church. Preview your palette, then save it for everyone.</p></header>
 {error&&<p className="lct-error" role="alert">{error}</p>}{message&&<p className="lct-notice" role="status">{message}</p>}
 {loading?<p role="status">Loading appearance…</p>:saved&&<div className="lct-grid"><fieldset disabled={saving} className="lct-fields"><legend>Brand Colors</legend>
 {([{key:'primary_color',label:'Primary Color',help:'Main buttons, navigation accents, and branding.'},{key:'secondary_color',label:'Secondary Color',help:'Decorative gradient frames and accents.'},{key:'highlight_color',label:'Highlight Color',help:'Warm accents in gradient frames and branding.'}] as const).map(({key,label,help})=><label key={key}><span>{label}</span><div className="lct-color"><input type="color" value={draft[key]} onChange={e=>{setDraft({...draft,[key]:e.target.value,use_default:false});setMessage('');setReset(false)}}/><code>{draft[key].toUpperCase()}</code></div><small>{help}</small></label>)}
 <p className="lct-help">Status colors, warning colors, and the Google logo keep their meaning. This controls shared brand colors; some existing illustrations and generated IDs retain their original styling.</p>
 </fieldset><aside className="lct-preview" aria-label="Palette Preview" style={{borderColor:draft.primary_color,background:`linear-gradient(145deg,${draft.primary_color}12,${draft.secondary_color}16)`}}><p className="eyebrow">Live Preview</p><h2>Welcome to LifeCity</h2><p>Your community, connected.</p><div className="lct-swatches">{[draft.primary_color,draft.secondary_color,draft.highlight_color].map((c,i)=><span key={i} style={{background:c}}/>)}</div><span className="lct-sample-button" style={{background:draft.primary_color,color:onColor(draft.primary_color)}}>View Upcoming Services</span><small>Preview only. Changes apply after you save.</small></aside></div>}
 <footer className="lct-actions"><button className="secondary-button" disabled={loading||saving} onClick={()=>void reload()}><RotateCcw size={16}/>Reload Saved Colors</button>{saved&&<><button className="secondary-button" disabled={loading||saving||!changed} onClick={()=>{setDraft(saved);setReset(false);setMessage('Unsaved changes discarded.')}}>Discard Changes</button><button className="primary-button" disabled={loading||saving||!changed} onClick={()=>void save(draft)}><Save size={16}/>{saving?'Saving…':'Save Appearance'}</button></>}</footer>
 {saved&&<div className="lct-reset"><button className="secondary-button" disabled={loading||saving} onClick={()=>setReset(!reset)} aria-expanded={reset}>Restore Default Colors</button>{reset&&<div className="lct-reset-confirm"><div><strong>Restore Default Colors?</strong><p>This restores LifeCity’s original palette for everyone and discards your preview.</p></div><button className="secondary-button" disabled={saving} onClick={()=>setReset(false)}>Cancel</button><button className="primary-button" disabled={saving} onClick={()=>void save({...defaultAppearance,revision:saved.revision})}>Restore Defaults</button></div>}</div>}
 </section>
}
