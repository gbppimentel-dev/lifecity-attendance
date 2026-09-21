import { useEffect, useId, useState } from 'react'
import { hexToHsv, hsvToHex, isHex } from '../lib/theme'

export default function ColorPicker({value,onChange,label}:{value:string;onChange:(color:string)=>void;label:string}){
 const id=useId(),[hex,setHex]=useState(value),[hsv,setHsv]=useState(()=>hexToHsv(value))
 useEffect(()=>{setHex(value);setHsv(old=>hsvToHex(...old).toLowerCase()===value.toLowerCase()?old:hexToHsv(value))},[value])
 function update(next:[number,number,number]){setHsv(next);onChange(hsvToHex(...next))}
 const [h,s,v]=hsv
 function point(e:React.PointerEvent<HTMLDivElement>){const r=e.currentTarget.getBoundingClientRect();update([h,Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,1-(e.clientY-r.top)/r.height))])}
 return <div className="lc-color-picker">
 <div className="lc-color-plane" aria-hidden="true" style={{backgroundColor:`hsl(${h} 100% 50%)`}} onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);point(e)}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))point(e)}}><span style={{left:`${s*100}%`,top:`${(1-v)*100}%`,background:value}}/></div>
 <label htmlFor={`${id}-h`}>Hue <output>{Math.round(h)}°</output></label><input id={`${id}-h`} className="lc-hue-range" type="range" min="0" max="359" value={h} onChange={e=>update([+e.target.value,s,v])}/>
 <div className="lc-color-sliders"><label>Saturation <input type="range" min="0" max="100" value={Math.round(s*100)} onChange={e=>update([h,+e.target.value/100,v])}/></label><label>Brightness <input type="range" min="0" max="100" value={Math.round(v*100)} onChange={e=>update([h,s,+e.target.value/100])}/></label></div>
 <label htmlFor={`${id}-hex`}>{label} · HEX</label><div className="lc-hex-field"><span style={{background:value}}/><input id={`${id}-hex`} value={hex.toUpperCase()} spellCheck={false} maxLength={7} aria-invalid={!isHex(hex)} onChange={e=>{setHex(e.target.value);if(isHex(e.target.value))onChange(e.target.value)}} onBlur={()=>{if(!isHex(hex))setHex(value)}}/></div>
 {!isHex(hex)&&<small role="status">Enter # followed by six hexadecimal characters.</small>}
 <div className="lc-color-swatches" aria-label="Suggested colors">{['#147d73','#315b91','#8f7cd1','#bd668c','#e6ad4c','#173e37','#ffffff','#f5f5f5'].map(c=><button key={c} type="button" style={{background:c}} aria-label={`Use ${c}`} title={c} onClick={()=>onChange(c)}/>)}</div>
 </div>
}
