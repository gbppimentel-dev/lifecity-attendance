import type { CSSProperties } from 'react'
import { themeShades } from './themeShades'
export const themeFields = [
 ['primary','Brand','Primary accent','#147d73'], ['secondary','Brand','Secondary accent','#7964ad'], ['highlight','Brand','Highlight accent','#986a21'],
 ['page','Backgrounds','Page background','#f7faf9'], ['glowPrimary','Backgrounds','Primary background glow','#e5f5ef'], ['glowSecondary','Backgrounds','Secondary background glow','#f1edfa'], ['glowHighlight','Backgrounds','Warm background glow','#fff4dd'],
 ['surface','Surfaces','Card background','#ffffff'], ['surfaceAlt','Surfaces','Inset card background','#f4f9f6'], ['header','Surfaces','Header background','#ffffff'], ['input','Surfaces','Input background','#ffffff'], ['border','Surfaces','Card and input borders','#d6e7df'], ['shadow','Surfaces','Shadows','#315b53'],
 ['heading','Text','Headings','#173e37'], ['text','Text','Body text','#456d63'], ['muted','Text','Supporting text','#60796f'], ['placeholder','Text','Input placeholder','#657d75'], ['onPrimary','Text','Primary button text','#ffffff'],
 ['button','Buttons','Primary button','#147d73'], ['buttonHover','Buttons','Primary button hover','#0e655c'], ['buttonSecondary','Buttons','Secondary button','#ffffff'], ['buttonSecondaryHover','Buttons','Secondary button hover','#eaf5ef'], ['buttonText','Buttons','Secondary button text','#315b53'], ['focus','Buttons','Keyboard focus ring','#8f7cd1'],
 ['graphicPrimary','Decoration','Primary illustration','#8ac7b5'], ['graphicSecondary','Decoration','Secondary illustration','#b8a4dc'], ['graphicHighlight','Decoration','Highlight illustration','#edce83'], ['framePrimary','Decoration','Moving border: start','#8ac7b5'], ['frameSecondary','Decoration','Moving border: middle','#b8a4dc'], ['frameHighlight','Decoration','Moving border: end','#edce83'],
 ['success','Feedback','Success text and icon','#18764e'], ['successBg','Feedback','Success background','#ecfdf3'], ['warning','Feedback','Warning text and icon','#85570f'], ['warningBg','Feedback','Warning background','#fff6df'], ['danger','Feedback','Error text and icon','#bd3535'], ['dangerBg','Feedback','Error background','#fff0ef'], ['camera','Feedback','Camera surround','#091d19'],
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
 const style:Record<string,string> = Object.fromEntries(Object.entries(tokens).map(([key,value])=>[`--lc-${key}`,value]))
 for(const [id,role,original,ink] of themeShades){
  const key=role as ThemeKey
  if(!(key in defaultTokens))continue
  let shade=shiftShade(original,defaultTokens[key],tokens[key])
  // Preserve white lettering. Dark and mid-tone text receives enough contrast
  // against the light surfaces used by the original design.
  if(ink && luminance(original)<.72)shade=readableOn(shade,[tokens.surface,tokens.surfaceAlt])
  style[`--lc-shade-${id}`]=shade
 }
 style['--lc-safe-button-text']=readableOn(tokens.onPrimary,[tokens.button,tokens.buttonHover])
 style['--lc-safe-text']=readableOn(tokens.text,[tokens.surface,tokens.surfaceAlt])
 style['--lc-safe-muted']=readableOn(tokens.muted,[tokens.surface,tokens.surfaceAlt])
 style['--lc-safe-secondary']=readableOn(tokens.secondary,[tokens.surface,tokens.glowSecondary])
 style['--lc-safe-highlight']=readableOn(tokens.highlight,[tokens.surface,tokens.glowHighlight])
 style['--lc-soft-shadow']=mix(tokens.shadow,tokens.surface,.87)
 return style as CSSProperties
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

function channels(hex:string){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))}
export function luminance(hex:string){const c=channels(hex).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});return .2126*c[0]+.7152*c[1]+.0722*c[2]}
export function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
export function mix(a:string,b:string,amount:number){const x=channels(a),y=channels(b);return '#'+x.map((v,i)=>Math.round(v+(y[i]-v)*amount).toString(16).padStart(2,'0')).join('')}
export function readableOn(foreground:string,backgrounds:string[]){
 if(backgrounds.every(bg=>contrast(foreground,bg)>=4.5))return foreground
 const min=(c:string)=>Math.min(...backgrounds.map(bg=>contrast(c,bg)))
 const target=min('#17332d')>=min('#ffffff')?'#17332d':'#ffffff'
 for(let i=1;i<=40;i++){const candidate=mix(foreground,target,i/40);if(min(candidate)>=4.5)return candidate}
 return min('#000000')>min('#ffffff')?'#000000':'#ffffff'
}
// Changing an accent rotates its family while retaining the lightness and
// saturation differences between backgrounds, borders, icons and lettering.
function shiftShade(original:string,base:string,next:string){
 if(base.toLowerCase()===next.toLowerCase())return original
 const [oh,os,ov]=hexToHsv(original),[bh,bs,bv]=hexToHsv(base),[nh,ns,nv]=hexToHsv(next)
 const h=(oh+nh-bh+360)%360
 const s=Math.max(0,Math.min(1,os+(ns-bs)*(os<.2?.35:1)))
 const v=Math.max(0,Math.min(1,ov+(nv-bv)*(ov>.8?.35:1)))
 return hsvToHex(h,s,v)
}
