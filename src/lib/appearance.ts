import { useEffect } from 'react'
import { supabase } from './supabase'
import { defaultTokens, isHex, validTokens, themeStyle, type ThemeTokens } from './theme'
export type Appearance = { primary_color:string; secondary_color:string; highlight_color:string; use_default:boolean; revision:number; updated_at?:string; tokens?:ThemeTokens }
export const defaultAppearance:Appearance={primary_color:'#147d73',secondary_color:'#8f7cd1',highlight_color:'#e6ad4c',use_default:true,revision:0,tokens:defaultTokens}
export function onColor(hex:string){
 const v=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4)
 return .2126*v[0]+.7152*v[1]+.0722*v[2]>.179?'#000000':'#ffffff'
}
export function isAppearance(x:unknown):x is Appearance {
 if(!x||typeof x!=='object')return false
 const a=x as Appearance
 return [a.primary_color,a.secondary_color,a.highlight_color].every(isHex)&&typeof a.use_default==='boolean'&&Number.isInteger(a.revision)&&(a.tokens===undefined||validTokens(a.tokens))
}
export function appearanceTokens(a:Appearance):ThemeTokens {
 if(a.use_default)return {...defaultTokens}
 if(a.tokens)return {...a.tokens}
 return {...defaultTokens,primary:a.primary_color,button:a.primary_color,secondary:a.secondary_color,highlight:a.highlight_color,onPrimary:onColor(a.primary_color)}
}
export async function loadAppearance(){
 const next=await supabase.rpc('lc_get_appearance_v2')
 if(!next.error){if(!isAppearance(next.data))throw new Error('Invalid saved palette.');return {appearance:next.data,extended:true}}
 if(!['PGRST202','42883'].includes(next.error.code))throw next.error
 const old=await supabase.rpc('lc_get_appearance')
 if(old.error)throw old.error
 if(!isAppearance(old.data))throw new Error('Invalid saved palette.')
 return {appearance:old.data,extended:false}
}
let appliedRevision=-1
export function applyAppearance(a:Appearance){
 if(!isAppearance(a)||a.revision<appliedRevision)return
 appliedRevision=a.revision
 const root=document.documentElement,tokens=appearanceTokens(a)
 root.dataset.lcTheme=a.use_default?'default':'custom'
 for(const [key,value] of Object.entries(themeStyle(tokens)))root.style.setProperty(key,String(value))
 root.style.setProperty('--lc-on-primary',tokens.onPrimary)
}
export function useSharedAppearance(){
 useEffect(()=>{
 let alive=true,loading=false
 async function refresh(){if(loading||document.visibilityState==='hidden')return;loading=true
 try{const {appearance}=await loadAppearance();if(alive)applyAppearance(appearance)}catch{/* Retain the last working palette when offline. */}finally{loading=false}}
 void refresh();const visible=()=>{void refresh()}
 document.addEventListener('visibilitychange',visible);const timer=window.setInterval(visible,60000)
 return()=>{alive=false;clearInterval(timer);document.removeEventListener('visibilitychange',visible)}
 },[])
}
