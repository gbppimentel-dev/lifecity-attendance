import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CheckCircle2, Download, RotateCcw, Save, ScanLine, Sparkles, Users, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { appearanceTokens, applyAppearance, defaultAppearance, isAppearance, loadAppearance, type Appearance } from '../lib/appearance'
import { defaultTokens, themeFields, themeStyle, type ThemeKey, type ThemeTokens } from '../lib/theme'
import ColorPicker from './ColorPicker'

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
 <header><p className="eyebrow">Settings · Owner workspace</p><h1>Make it feel like LifeCity.</h1><p>Fine-tune every layer of your palette. Try it in the live preview, then save it for everyone.</p></header>
 {error&&<p className="lct-error" role="alert">{error}</p>}{message&&<p className="lct-notice" role="status">{message}</p>}
 {loading?<p role="status">Loading your palette…</p>:saved&&<>
 {!extended&&<p className="lct-notice" role="status">Install LC-APPEARANCE-V2.sql, then reload to enable shared palette saving. You can explore the preview now.</p>}
 <div className="lc-appearance-grid"><fieldset disabled={saving} className="lc-palette-controls"><legend>Color palette · {themeFields.length} controls</legend>
 <nav className="lc-color-groups" aria-label="Color categories">{groups.map(name=><button key={name} type="button" aria-pressed={group===name} onClick={()=>{setGroup(name);setActive(themeFields.find(([,g])=>g===name)![0])}}>{name}</button>)}</nav>
 <div className="lc-color-list">{themeFields.filter(([,g])=>g===group).map(([key,,label])=><button type="button" key={key} aria-pressed={active===key} onClick={()=>setActive(key)}><i style={{background:draft[key]}}/><span>{label}<small>{draft[key].toUpperCase()}</small></span></button>)}</div>
 <div className="lc-picker-heading"><strong>{selected[2]}</strong><button type="button" onClick={()=>setDraft({...draft,[active]:defaultTokens[active]})} title="Reset this color" aria-label={`Reset ${selected[2]}`}><RotateCcw size={16}/></button></div>
 <ColorPicker value={draft[active]} label={selected[2]} onChange={color=>{setDraft({...draft,[active]:color});setMessage('');setReset(false)}}/>
 </fieldset><div className="lc-preview-column"><div className="lc-preview-caption"><strong>Live preview</strong><span>Try the buttons, search, and export panel.</span></div><PalettePreview tokens={draft}/><p className="lc-preview-note">Preview only. Saving applies these colors across the app. Camera video and member QR codes keep their original colors.</p></div></div>
 </>}
 <footer className="lc-appearance-actions"><button type="button" className="secondary-button" disabled={loading||saving} onClick={()=>void reload()}><RotateCcw size={16}/>Reload saved palette</button><button type="button" className="secondary-button" disabled={loading||saving||!changed} onClick={()=>{if(saved)setDraft(appearanceTokens(saved));setReset(false)}}>Discard changes</button><button type="button" className="primary-button" disabled={loading||saving||!extended||!changed} onClick={()=>void save(draft)}><Save size={16}/>{saving?'Saving…':'Save appearance'}</button></footer>
 {saved&&<div className="lc-palette-reset"><div><strong>Back to the original palette</strong><p>Restore LifeCity’s default colors for everyone.</p></div><button type="button" className="secondary-button" disabled={saving||!extended} aria-expanded={reset} onClick={()=>setReset(!reset)}>Restore defaults</button>{reset&&<div className="lc-palette-reset-confirm" role="group" aria-label="Confirm restore"><p>This replaces the shared palette and discards your unsaved changes.</p><div><button type="button" className="secondary-button" disabled={saving} onClick={()=>setReset(false)}>Cancel</button><button type="button" className="primary-button" disabled={saving} onClick={()=>void save(appearanceTokens(defaultAppearance),true)}>Restore default colors</button></div></div>}</div>}
 </section>
}
function PalettePreview({tokens}:{tokens:ThemeTokens}){
 const [view,setView]=useState<'dashboard'|'scanner'>('dashboard'),[exportOpen,setExportOpen]=useState(false),[query,setQuery]=useState('')
 return <div className="lc-theme-preview" style={themeStyle(tokens)}>
 <header className="lcp-header"><strong><Sparkles size={18}/>LifeCity</strong><span>Sample workspace</span></header>
 <nav className="lcp-nav" aria-label="Preview pages"><button type="button" aria-pressed={view==='dashboard'} onClick={()=>setView('dashboard')}>Dashboard</button><button type="button" aria-pressed={view==='scanner'} onClick={()=>setView('scanner')}>Scanner</button></nav>
 <div className="lcp-body"><div className="lcp-hero"><i className="lcp-orbit" aria-hidden="true"/><p>Gather. Connect. Grow.</p><h2>{view==='dashboard'?'Every gathering counts.':'Ready for your next check-in.'}</h2><p>Your community, connected.</p><div className="lcp-buttons"><button type="button" className="lcp-primary" onClick={()=>setView(view==='dashboard'?'scanner':'dashboard')}>{view==='dashboard'?'Open scanner':'View dashboard'}<ArrowRight size={16}/></button><button type="button" className="lcp-secondary" onClick={()=>setExportOpen(!exportOpen)}>Export</button></div></div>
 <div className="lcp-cards"><article><Users size={24}/><span>Active members</span><strong>130</strong><small>Sample total</small></article><article><ScanLine size={24}/><span>Check-ins today</span><strong>42</strong><small>Sample total</small></article></div>
 <label className="lcp-search">Search preview<input placeholder="Search members…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
 {query&&<p className="lcp-small">Preview search: {query}</p>}
 {view==='scanner'&&<div className="lcp-camera"><ScanLine size={42}/><span>Camera preview</span></div>}
 <div className="lcp-feedback"><span><CheckCircle2 size={16}/>Check-in recorded</span><span>Already checked in</span><span>Camera unavailable</span></div>
 <section className={`lcp-export${exportOpen?' is-open':''}`}><button type="button" aria-expanded={exportOpen} onClick={()=>setExportOpen(!exportOpen)}><Download size={18}/>Export records<span>{exportOpen?<X size={16}/>:<ArrowRight size={16}/>}</span></button><div className="lcp-export-reveal" inert={!exportOpen}><div><p>Your report, ready to share.</p><button type="button" className="lcp-secondary" onClick={()=>setExportOpen(false)}>Close preview</button></div></div></section>
 </div></div>
}
