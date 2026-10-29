import FoldText from './FoldText'
import { useNoticeToast } from '../lib/useNoticeToast'
import {MobileFold} from './CompactMobile'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CheckCircle2, Download, FileSearch, Palette, RefreshCw, RotateCcw, Save, ScanLine, Sparkles, Users, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { appearanceTokens, applyAppearance, defaultAppearance, isAppearance, loadAppearance, type Appearance } from '../lib/appearance'
import { defaultTokens, themeFields, themeStyle, type ThemeKey, type ThemeTokens } from '../lib/theme'
import ColorPicker from './ColorPicker'
import './SettingsPanels.css'

const titleLabel=(text:string)=>text.replace(/\b[a-z]/g,letter=>letter.toUpperCase())
const groups=[...new Set(themeFields.map(([,group])=>group))]
export default function AppearanceSettings(){
 const [saved,setSaved]=useState<Appearance|null>(null),[draft,setDraft]=useState<ThemeTokens>({...defaultTokens})
 const [active,setActive]=useState<ThemeKey>('primary'),[group,setGroup]=useState<string>('Brand')
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[extended,setExtended]=useState(false)
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[reset,setReset]=useState(false)
 useNoticeToast(message)
 const alive=useRef(true),lock=useRef(false),reloadSequence=useRef(0)
 useEffect(()=>{alive.current=true;void reload();return()=>{alive.current=false;reloadSequence.current++}},[])
 useEffect(()=>{
  const settingsChanged=(event:Event)=>{if((event as CustomEvent<{tab:string}>).detail?.tab!=='appearance')setReset(false)}
  const workspaceChanged=(event:Event)=>{if((event as CustomEvent<{page:string}>).detail?.page!=='settings')setReset(false)}
  window.addEventListener('lifecity-settings-activate',settingsChanged);window.addEventListener('lifecity-workspace-activate',workspaceChanged)
  return()=>{window.removeEventListener('lifecity-settings-activate',settingsChanged);window.removeEventListener('lifecity-workspace-activate',workspaceChanged)}
 },[])
 async function reload(){const request=++reloadSequence.current;setLoading(true);setError('');setMessage('');setReset(false)
 try{const data=await loadAppearance();if(alive.current&&reloadSequence.current===request){setSaved(data.appearance);setDraft(appearanceTokens(data.appearance));setExtended(data.extended);applyAppearance(data.appearance)}}
 catch{if(alive.current&&reloadSequence.current===request)setError('Could not load your saved palette. Check your connection, then reload.')}
 finally{if(alive.current&&reloadSequence.current===request)setLoading(false)}}
 async function save(tokens:ThemeTokens,restore=false){
 if(!saved||!extended||lock.current)return
 lock.current=true;setSaving(true);setError('');setMessage('')
 try{const {data,error:failure}=await supabase.rpc('lc_save_appearance_v2',{p_tokens:tokens,p_default:restore,p_revision:saved.revision})
 if(failure)throw failure;if(!isAppearance(data))throw new Error('Unexpected save response.')
 applyAppearance(data);if(alive.current){setSaved(data);setDraft(appearanceTokens(data));setReset(false);setMessage(restore?'Default colors restored for everyone.':'Appearance saved for everyone. Other sessions update within a minute.')}}
 catch(failure){if(alive.current)setError((failure as {code?:string}).code==='P0001'?(failure as {message:string}).message:'Could not confirm the save. Reload the saved palette before trying again.')}
 finally{lock.current=false;if(alive.current)setSaving(false)}}
 const changed=!!saved&&JSON.stringify(draft)!==JSON.stringify(appearanceTokens(saved))
 const selected=themeFields.find(([key])=>key===active)!
 return <section className="lct-panel lc-appearance-studio lcsp-panel" aria-labelledby="lc-appearance-title">
 <header className="lcsp-heading"><div><p className="eyebrow">Settings · Appearance</p><h1 id="lc-appearance-title"><FoldText text="Colors & Preview"/></h1><p>Adjust the app colors in the preview, then save the shared palette.</p></div><span className="lcsp-label-chip"><Palette size={15}/>Shared Palette</span></header>
 {error&&<p className="lct-error" role="alert">{error}</p>}{message&&<p className="lct-notice" role="status">{message}</p>}
 {loading?<div className="lcsp-loading" role="status"><RefreshCw size={18}/>Loading saved colors…</div>:saved&&<>
 {!extended&&<p className="lct-notice" role="status">Install LC-APPEARANCE-V2.sql, then reload to enable shared palette saving. You can explore the preview now.</p>}
 <div className="lc-appearance-grid"><fieldset disabled={saving} className="lc-palette-controls"><legend>Color Palette <small>{themeFields.length} Colors · {groups.length} Groups</small></legend>
 <nav className="lc-color-groups" aria-label="Color categories">{groups.map(name=><button key={name} type="button" aria-pressed={group===name} onClick={()=>{setGroup(name);setActive(themeFields.find(([,g])=>g===name)![0])}}>{name}</button>)}</nav>
 <div className="lc-color-list">{themeFields.filter(([,g])=>g===group).map(([key,,label])=><button type="button" key={key} aria-pressed={active===key} onClick={()=>setActive(key)}><i style={{background:draft[key]}}/><span>{titleLabel(label)}<small>{draft[key].toUpperCase()}</small></span></button>)}</div>
 <div className="lc-picker-heading"><strong>{titleLabel(selected[2])}</strong><button type="button" disabled={draft[active]===defaultTokens[active]} onClick={()=>{setDraft({...draft,[active]:defaultTokens[active]});setMessage('');setReset(false)}} title="Reset This Color" aria-label={`Reset ${selected[2]}`}><RotateCcw size={15}/></button></div>
 <ColorPicker value={draft[active]} label={titleLabel(selected[2])} onChange={color=>{setDraft({...draft,[active]:color});setMessage('');setReset(false)}}/>
 </fieldset><div className="lc-preview-column"><MobileFold title="Live Appearance Preview"><div className="lc-preview-caption"><strong>Live Preview</strong><span>Try the buttons, search, and export panel.</span></div><PalettePreview tokens={draft} active={active} label={titleLabel(selected[2])}/><p className="lc-preview-note">Changes stay in this preview until saved. Camera video and member QR codes retain their original colors.</p></MobileFold></div></div>
 </>}
 <footer className="lc-appearance-actions"><span className={'lcsp-state'+(changed?' is-dirty':'')} role="status">{loading?'Loading…':saving?'Saving…':changed?'Unsaved Changes':'Saved Palette'}</span><button type="button" className="secondary-button" disabled={loading||saving} onClick={()=>void reload()}><RotateCcw size={15}/>Reload Saved</button><button type="button" className="secondary-button" disabled={loading||saving||!changed} onClick={()=>{if(saved)setDraft(appearanceTokens(saved));setReset(false);setMessage('')}}>Discard Changes</button><button type="button" className="primary-button" disabled={loading||saving||!extended||!changed} onClick={()=>void save(draft)}><Save size={15}/>{saving?'Saving…':'Save Appearance'}</button></footer>
 {saved&&<div className="lc-palette-reset"><div><strong>Default Colors</strong><p>Replace the shared palette with LifeCity’s original colors.</p></div><button type="button" className="secondary-button" disabled={saving||!extended} aria-expanded={reset} onClick={()=>setReset(!reset)}>Restore Defaults</button>{reset&&<div className="lc-palette-reset-confirm" role="group" aria-label="Confirm restore"><p>This replaces the shared palette and discards your unsaved changes.</p><div><button type="button" className="secondary-button" disabled={saving} onClick={()=>setReset(false)}>Cancel</button><button type="button" className="primary-button" disabled={saving} onClick={()=>void save(appearanceTokens(defaultAppearance),true)}>Restore Default Colors</button></div></div>}</div>}
 </section>
}
function PalettePreview({tokens,active,label}:{tokens:ThemeTokens;active:ThemeKey;label:string}){
 const [view,setView]=useState<'dashboard'|'scanner'>('dashboard'),[exportOpen,setExportOpen]=useState(true),[query,setQuery]=useState(''),[exportMessage,setExportMessage]=useState('')
 const spot=(...keys:ThemeKey[])=>keys.includes(active)?'true':undefined
 const primaryHover=active==='buttonHover',secondaryHover=active==='buttonSecondaryHover'
 return <><p className="lcp-editing" role="status"><span aria-hidden="true"/>Editing <strong>{label}</strong><small>Highlighted areas use this color.</small></p>
 <div className="lc-theme-preview" style={themeStyle(tokens)} data-highlight={spot('page','glowPrimary','glowSecondary')}>
 <header className="lcp-header" data-highlight={spot('header')}><strong><Sparkles size={18} data-highlight={spot('primary')}/>LifeCity</strong><span data-highlight={spot('muted')}>Sample Workspace</span></header>
 <nav className="lcp-nav" aria-label="Preview Pages"><button type="button" data-highlight={view==='dashboard'?spot('primary'):undefined} aria-pressed={view==='dashboard'} onClick={()=>setView('dashboard')}>Dashboard</button><button type="button" data-highlight={view==='scanner'?spot('primary'):undefined} aria-pressed={view==='scanner'} onClick={()=>setView('scanner')}>Scanner</button></nav>
 <div className="lcp-body"><div className="lcp-hero" data-highlight={spot('glowHighlight','framePrimary','frameSecondary','frameHighlight')}><i className="lcp-orbit" aria-hidden="true" data-highlight={spot('graphicPrimary','graphicSecondary','graphicHighlight')}/><p data-highlight={spot('primary')}>LifeCity Attendance</p><h2 data-highlight={spot('heading')}>{view==='dashboard'?'Dashboard':'Check In Members'}</h2><p data-highlight={spot('muted')}>Sample services and member activity.</p><div className="lcp-buttons"><button type="button" className={`lcp-primary${primaryHover?' is-hover-preview':''}`} data-highlight={spot('button','buttonHover','onPrimary')} onClick={()=>setView(view==='dashboard'?'scanner':'dashboard')}>{view==='dashboard'?'Open Scanner':'View Dashboard'}<ArrowRight size={16}/></button><button type="button" className={`lcp-secondary${secondaryHover?' is-hover-preview':''}`} data-highlight={spot('buttonSecondary','buttonSecondaryHover','buttonText')} aria-expanded={exportOpen} onClick={()=>setExportOpen(!exportOpen)}>Export</button></div></div>
 <div className="lcp-cards"><article data-highlight={spot('surface','border','shadow')}><Users size={24} data-highlight={spot('primary')}/><span data-highlight={spot('text')}>Active Members</span><strong data-highlight={spot('heading')}>130</strong><small data-highlight={spot('muted')}>Sample Total</small></article><article data-highlight={spot('surface','border','shadow')}><ScanLine size={24} data-highlight={spot('secondary')}/><span data-highlight={spot('text')}>Check-Ins Today</span><strong data-highlight={spot('heading')}>42</strong><small data-highlight={spot('muted')}>Sample Total</small></article></div>
 <div className="lcp-accent-note" data-highlight={spot('surfaceAlt')}><Sparkles size={15} data-highlight={spot('highlight')}/><span data-highlight={spot('text')}>Sunday Service · Main Church</span></div>
 <label className="lcp-search">Search Preview<input className={active==='focus'?'is-focus-preview':undefined} data-highlight={spot('input','placeholder','focus')} placeholder="Search Members…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
 {query&&<p className="lcp-small">Preview Search: {query}</p>}
 {(view==='scanner'||active==='camera')&&<div className="lcp-camera" data-highlight={spot('camera')}><ScanLine size={42}/><span>Camera Preview</span></div>}
 <div className="lcp-feedback"><span data-highlight={spot('success','successBg')}><CheckCircle2 size={16}/>Check-In Recorded</span><span data-highlight={spot('warning','warningBg')}>Already Checked In</span><span data-highlight={spot('danger','dangerBg')}>Camera Unavailable</span></div>
 <section className={`lcp-export lcp-export-demo${exportOpen?' is-open':''}`} aria-label="CSV Export Preview"><button type="button" aria-expanded={exportOpen} onClick={()=>setExportOpen(!exportOpen)}><Download size={18}/>Export Records<span>{exportOpen?<X size={16}/>:<ArrowRight size={16}/>}</span></button><div className="lcp-export-reveal" inert={!exportOpen}><div><header className="lcp-export-heading"><small>CSV Export Center</small><h3>Your Report, Ready to Share</h3><p>42 Sample Records · Current Filters</p></header><div className="lcp-export-options"><button type="button" data-highlight={spot('primary')} onClick={()=>setExportMessage('Quick CSV Preview Selected. No File Is Downloaded.')}><Download size={21}/><span><strong>Quick CSV</strong><small>Core Attendance Details</small></span></button><button type="button" data-highlight={spot('secondary')} onClick={()=>setExportMessage('Detailed CSV Preview Selected. No File Is Downloaded.')}><FileSearch size={21}/><span><strong>Detailed CSV</strong><small>Full Reporting Fields</small></span></button></div><p className="lcp-demo-note" role="status">{exportMessage||'Preview Only · Your Records Stay Unchanged'}</p></div></div></section>
 </div></div></>
}
