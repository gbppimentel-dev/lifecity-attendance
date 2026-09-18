// Change ID: LC-P06A-v1
import { useEffect } from 'react'
import { supabase } from './supabase'
export type Appearance = { primary_color: string; secondary_color: string; highlight_color: string; use_default: boolean; revision: number; updated_at?: string }
export const defaultAppearance: Appearance = {primary_color:'#147d73',secondary_color:'#8f7cd1',highlight_color:'#e6ad4c',use_default:true,revision:0}
export function onColor(hex: string) {
  const v=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4)
  return .2126*v[0]+.7152*v[1]+.0722*v[2] > .179 ? '#000000' : '#ffffff'
}
export function isAppearance(x: unknown): x is Appearance {
  if(!x || typeof x!=='object') return false
  const a=x as Appearance
  return [a.primary_color,a.secondary_color,a.highlight_color].every(c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)) && typeof a.use_default==='boolean' && Number.isInteger(a.revision)
}
let appliedRevision=-1
export function applyAppearance(a: Appearance) {
  if(!isAppearance(a)||a.revision<appliedRevision)return
  appliedRevision=a.revision
  const root=document.documentElement
  root.dataset.lcTheme=a.use_default?'default':'custom'
  root.style.setProperty('--lc-primary',a.primary_color)
  root.style.setProperty('--lc-secondary',a.secondary_color)
  root.style.setProperty('--lc-highlight',a.highlight_color)
  root.style.setProperty('--lc-on-primary',onColor(a.primary_color))
}
export function useSharedAppearance() {
  useEffect(()=>{
    let alive=true,loading=false
    async function refresh(){
      if(loading||document.visibilityState==='hidden')return
      loading=true
      try { const {data,error}=await supabase.rpc('lc_get_appearance'); if(alive&&!error&&isAppearance(data))applyAppearance(data) }
      catch { /* Keep the last applied palette if the network is unavailable. */ }
      finally { loading=false }
    }
    void refresh()
    const visible=()=>{void refresh()}
    document.addEventListener('visibilitychange',visible)
    const timer=window.setInterval(visible,60000)
    return()=>{alive=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',visible)}
  },[])
}
