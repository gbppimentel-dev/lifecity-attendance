import type { CSSProperties } from 'react'
export const themeFields = [
 ['primary','Brand','Primary accent','#147d73'], ['secondary','Brand','Secondary accent','#8f7cd1'], ['highlight','Brand','Highlight accent','#e6ad4c'],
 ['page','Backgrounds','Page background','#f7faf9'], ['glowPrimary','Backgrounds','Primary background glow','#e5f5ef'], ['glowSecondary','Backgrounds','Secondary background glow','#f1edfa'], ['glowHighlight','Backgrounds','Warm background glow','#fff4dd'],
 ['surface','Surfaces','Card background','#ffffff'], ['surfaceAlt','Surfaces','Inset card background','#f4f9f6'], ['header','Surfaces','Header background','#ffffff'], ['input','Surfaces','Input background','#ffffff'], ['border','Surfaces','Card and input borders','#d6e7df'], ['shadow','Surfaces','Shadows','#315b53'],
 ['heading','Text','Headings','#173e37'], ['text','Text','Body text','#456d63'], ['muted','Text','Supporting text','#718b82'], ['placeholder','Text','Input placeholder','#8ca099'], ['onPrimary','Text','Primary button text','#ffffff'],
 ['button','Buttons','Primary button','#147d73'], ['buttonHover','Buttons','Primary button hover','#0e655c'], ['buttonSecondary','Buttons','Secondary button','#ffffff'], ['buttonSecondaryHover','Buttons','Secondary button hover','#eaf5ef'], ['buttonText','Buttons','Secondary button text','#315b53'], ['focus','Buttons','Keyboard focus ring','#8f7cd1'],
 ['graphicPrimary','Decoration','Primary illustration','#8ac7b5'], ['graphicSecondary','Decoration','Secondary illustration','#b8a4dc'], ['graphicHighlight','Decoration','Highlight illustration','#edce83'], ['framePrimary','Decoration','Moving border: start','#8ac7b5'], ['frameSecondary','Decoration','Moving border: middle','#b8a4dc'], ['frameHighlight','Decoration','Moving border: end','#edce83'],
 ['success','Feedback','Success text and icon','#18764e'], ['successBg','Feedback','Success background','#ecfdf3'], ['warning','Feedback','Warning text and icon','#a56b16'], ['warningBg','Feedback','Warning background','#fff6df'], ['danger','Feedback','Error text and icon','#bd3535'], ['dangerBg','Feedback','Error background','#fff0ef'], ['camera','Feedback','Camera surround','#091d19'],
] as const
export type ThemeKey = typeof themeFields[number][0]
export type ThemeTokens = Record<ThemeKey,string>
export const defaultTokens = Object.fromEntries(themeFields.map(([key,,,color])=>[key,color])) as ThemeTokens
export const isHex=(value:unknown):value is string=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)
export function validTokens(value:unknown):value is ThemeTokens {
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 return themeFields.every(([key])=>isHex((value as Record<string,unknown>)[key])) && Object.keys(value).length===themeFields.length
}
export function themeStyle(tokens:ThemeTokens):CSSProperties {
 return Object.fromEntries(Object.entries(tokens).map(([key,value])=>[`--lc-${key}`,value])) as CSSProperties
}
export function hexToHsv(hex:string):[number,number,number] {
 const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
 const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min
 let h=d===0?0:max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4
 h=(h*60+360)%360
 return [h,max===0?0:d/max,max]
}
export function hsvToHex(h:number,s:number,v:number):string {
 const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c
 const rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x]
 return '#'+rgb.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('')
}
