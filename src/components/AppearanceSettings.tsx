import {MobileFold} from './CompactMobile'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CheckCircle2, Download, FileSearch, RotateCcw, Save, ScanLine, Sparkles, Users, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { appearanceTokens, applyAppearance, defaultAppearance, isAppearance, loadAppearance, type Appearance } from '../lib/appearance'
import { defaultTokens, themeFields, themeStyle, type ThemeKey, type ThemeTokens } from '../lib/theme'
import ColorPicker from './ColorPicker'

const titleLabel=(text:string)=>text.replace(/\b[a-z]/g,letter=>letter.toUpperCase())
const groups=[...new Set(themeFields.map(([,group])=>group))]
export default function AppearanceSettings(){
 const [saved,setSaved]=useState<Appearance|null>(null),[draft,setDraft]=useState<ThemeTokens>({...defaultTokens})
 const [active,setActive]=useState<ThemeKey>('primary'),[group,setGroup]=useState<string>('Brand')
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[extended,setExtended]=useState(false)
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[reset,setReset]=useState(false)
 const alive=useRef(true),lock=useRef(false)
 useEffect(()=>{alive.current=true;void reload();return()=>{alive.current=false}},[])
 async function reload(){setLoading(true);setError('');setMessage('');setReset(false)
 try{const data=await loadAppearance();if(alive.current){setSaved(data.appearance);setDraft(appearanceTokens(data.appearance));setExtended(data.extended);applyAppearance(data.appearance)}}
 catch{if(alive.current)setError('Could not load your saved palette. Check your connection, then reload.')}
 finally{if(alive.current)setLoading(false)}}
 async function save(tokens:ThemeTokens,restore=false){
 if(!saved||!extended||lock.current)return
 lock.current=true;setSaving(true);setError('');setMessage('')
 try{const {data,error:failure}=await supabase.rpc('lc_save_appearance_v2',{p_tokens:tokens,p_default:restore,p_revision:saved.revision})
 if(failure)throw failure;if(!isAppearance(data))throw new Error('Unexpected save response.')
 applyAppearance(data);if(alive.current){setSaved(data);setDraft(appearanceTokens(data));setReset(false);setMessage(restore?'Original colors restored for everyone.':'Palette saved. Other sessions update within a minute or when reopened.')}}
 catch(failure){if(alive.current)setError((failure as {code?:string}).code==='P0001'?(failure as {message:string}).message:'Could not confirm the save. Reload the saved palette before trying again.')}
 finally{lock.current=false;if(alive.current)setSaving(false)}}
 const changed=!!saved&&JSON.stringify(draft)!==JSON.stringify(appearanceTokens(saved))
 const selected=themeFields.find(([key])=>key===active)!
 return <section className="lct-panel lc-appearance-studio">
 <header><p className="eyebrow">Settings · Owner Workspace</p><h1>Make It Feel Like LifeCity.</h1><p>Fine-tune every layer of your palette. Try it in the live preview, then save it for everyone.</p></header>
 {error&&<p className="lct-error" role="alert">{error}</p>}{message&&<p className="lct-notice" role="status">{message}</p>}
 {loading?<p role="status">Loading your palette…</p>:saved&&<>
 {!extended&&<p className="lct-notice" role="status">Install LC-APPEARANCE-V2.sql, then reload to enable shared palette saving. You can explore the preview now.</p>}
 <div className="lc-appearance-grid"><fieldset disabled={saving} className="lc-palette-controls"><legend>Color Palette · {themeFields.length} Controls</legend>
 <nav className="lc-color-groups" aria-label="Color categories">{groups.map(name=><button key={name} type="button" aria-pressed={group===name} onClick={()=>{setGroup(name);setActive(themeFields.find(([,g])=>g===name)![0])}}>{name}</button>)}</nav>
 <div className="lc-color-list">{themeFields.filter(([,g])=>g===group).map(([key,,label])=><button type="button" key={key} aria-pressed={active===key} onClick={()=>setActive(key)}><i style={{background:draft[key]}}/><span>{titleLabel(label)}<small>{draft[key].toUpperCase()}</small></span></button>)}</div>
 <div className="lc-picker-heading"><strong>{titleLabel(selected[2])}</strong><button type="button" onClick={()=>setDraft({...draft,[active]:defaultTokens[active]})} title="Reset This Color" aria-label={`Reset ${selected[2]}`}><RotateCcw size={16}/></button></div>
 <ColorPicker value={draft[active]} label={titleLabel(selected[2])} onChange={color=>{setDraft({...draft,[active]:color});setMessage('');setReset(false)}}/>
 </fieldset><div className="lc-preview-column"><MobileFold title="Live Appearance Preview"><div className="lc-preview-caption"><strong>Live Preview</strong><span>Try the buttons, search, and export panel.</span></div><PalettePreview tokens={draft} active={active} label={titleLabel(selected[2])}/><p className="lc-preview-note">Preview only. Saving applies these colors across the app. Camera video and member QR codes keep their original colors.</p></MobileFold></div></div>
 </>}
 <footer className="lc-appearance-actions"><button type="button" className="secondary-button" disabled={loading||saving} onClick={()=>void reload()}><RotateCcw size={16}/>Reload Saved Palette</button><button type="button" className="secondary-button" disabled={loading||saving||!changed} onClick={()=>{if(saved)setDraft(appearanceTokens(saved));setReset(false)}}>Discard Changes</button><button type="button" className="primary-button" disabled={loading||saving||!extended||!changed} onClick={()=>void save(draft)}><Save size={16}/>{saving?'Saving…':'Save Appearance'}</button></footer>
 {saved&&<div className="lc-palette-reset"><div><strong>Back to the Original Palette</strong><p>Restore LifeCity’s default colors for everyone.</p></div><button type="button" className="secondary-button" disabled={saving||!extended} aria-expanded={reset} onClick={()=>setReset(!reset)}>Restore Defaults</button>{reset&&<div className="lc-palette-reset-confirm" role="group" aria-label="Confirm restore"><p>This replaces the shared palette and discards your unsaved changes.</p><div><button type="button" className="secondary-button" disabled={saving} onClick={()=>setReset(false)}>Cancel</button><button type="button" className="primary-button" disabled={saving} onClick={()=>void save(appearanceTokens(defaultAppearance),true)}>Restore Default Colors</button></div></div>}</div>}
 </section>
}
function PalettePreview({tokens,active,label}:{tokens:ThemeTokens;active:ThemeKey;label:string}){
 const [view,setView]=useState<'dashboard'|'scanner'>('dashboard'),[exportOpen,setExportOpen]=useState(true),[query,setQuery]=useState(''),[exportMessage,setExportMessage]=useState('')
 const spot=(...keys:ThemeKey[])=>keys.includes(active)?'true':undefined
 const primaryHover=active==='buttonHover',secondaryHover=active==='buttonSecondaryHover'
 return <><p className="lcp-editing" role="status"><span aria-hidden="true"/>Editing: <strong>{label}</strong><small>Highlighted Areas Show Where This Color Applies</small></p>
 <div className="lc-theme-preview" style={themeStyle(tokens)} data-highlight={spot('page','glowPrimary','glowSecondary')}>
 <header className="lcp-header" data-highlight={spot('header')}><strong><Sparkles size={18} data-highlight={spot('primary')}/>LifeCity</strong><span data-highlight={spot('muted')}>Sample Workspace</span></header>
 <nav className="lcp-nav" aria-label="Preview Pages"><button type="button" data-highlight={view==='dashboard'?spot('primary'):undefined} aria-pressed={view==='dashboard'} onClick={()=>setView('dashboard')}>Dashboard</button><button type="button" data-highlight={view==='scanner'?spot('primary'):undefined} aria-pressed={view==='scanner'} onClick={()=>setView('scanner')}>Scanner</button></nav>
 <div className="lcp-body"><div className="lcp-hero" data-highlight={spot('glowHighlight','framePrimary','frameSecondary','frameHighlight')}><i className="lcp-orbit" aria-hidden="true" data-highlight={spot('graphicPrimary','graphicSecondary','graphicHighlight')}/><p data-highlight={spot('primary')}>Gather. Connect. Grow.</p><h2 data-highlight={spot('heading')}>{view==='dashboard'?'Every Gathering Counts.':'Ready for Your Next Check-In.'}</h2><p data-highlight={spot('muted')}>Your Community, Connected.</p><div className="lcp-buttons"><button type="button" className={`lcp-primary${primaryHover?' is-hover-preview':''}`} data-highlight={spot('button','buttonHover','onPrimary')} onClick={()=>setView(view==='dashboard'?'scanner':'dashboard')}>{view==='dashboard'?'Open Scanner':'View Dashboard'}<ArrowRight size={16}/></button><button type="button" className={`lcp-secondary${secondaryHover?' is-hover-preview':''}`} data-highlight={spot('buttonSecondary','buttonSecondaryHover','buttonText')} aria-expanded={exportOpen} onClick={()=>setExportOpen(!exportOpen)}>Export</button></div></div>
 <div className="lcp-cards"><article data-highlight={spot('surface','border','shadow')}><Users size={24} data-highlight={spot('primary')}/><span data-highlight={spot('text')}>Active Members</span><strong data-highlight={spot('heading')}>130</strong><small data-highlight={spot('muted')}>Sample Total</small></article><article data-highlight={spot('surface','border','shadow')}><ScanLine size={24} data-highlight={spot('secondary')}/><span data-highlight={spot('text')}>Check-Ins Today</span><strong data-highlight={spot('heading')}>42</strong><small data-highlight={spot('muted')}>Sample Total</small></article></div>
 <div className="lcp-accent-note" data-highlight={spot('surfaceAlt')}><Sparkles size={15} data-highlight={spot('highlight')}/><span data-highlight={spot('text')}>Connected Through Every Gathering</span></div>
 <label className="lcp-search">Search Preview<input className={active==='focus'?'is-focus-preview':undefined} data-highlight={spot('input','placeholder','focus')} placeholder="Search Members…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
 {query&&<p className="lcp-small">Preview Search: {query}</p>}
 {(view==='scanner'||active==='camera')&&<div className="lcp-camera" data-highlight={spot('camera')}><ScanLine size={42}/><span>Camera Preview</span></div>}
 <div className="lcp-feedback"><span data-highlight={spot('success','successBg')}><CheckCircle2 size={16}/>Check-In Recorded</span><span data-highlight={spot('warning','warningBg')}>Already Checked In</span><span data-highlight={spot('danger','dangerBg')}>Camera Unavailable</span></div>
 <section className={`lcp-export lcp-export-demo${exportOpen?' is-open':''}`} aria-label="CSV Export Preview"><button type="button" aria-expanded={exportOpen} onClick={()=>setExportOpen(!exportOpen)}><Download size={18}/>Export Records<span>{exportOpen?<X size={16}/>:<ArrowRight size={16}/>}</span></button><div className="lcp-export-reveal" inert={!exportOpen}><div><header className="lcp-export-heading"><small>CSV Export Center</small><h3>Your Report, Ready to Share</h3><p>42 Sample Records · Current Filters</p></header><div className="lcp-export-options"><button type="button" data-highlight={spot('primary')} onClick={()=>setExportMessage('Quick CSV Preview Selected. No File Is Downloaded.')}><Download size={21}/><span><strong>Quick CSV</strong><small>Core Attendance Details</small></span></button><button type="button" data-highlight={spot('secondary')} onClick={()=>setExportMessage('Detailed CSV Preview Selected. No File Is Downloaded.')}><FileSearch size={21}/><span><strong>Detailed CSV</strong><small>Full Reporting Fields</small></span></button></div><p className="lcp-demo-note" role="status">{exportMessage||'Preview Only · Your Records Stay Unchanged'}</p></div></div></section>
 </div></div></>
}
