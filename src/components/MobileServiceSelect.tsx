import {useEffect,useRef} from 'react'
import {Check,ChevronDown} from 'lucide-react'
export default function MobileServiceSelect({label,value,options,onChange}:{label:string;value:string;options:{value:string;label:string}[];onChange:(value:string)=>void}){
 const ref=useRef<HTMLDetailsElement>(null)
 useEffect(()=>{const close=(event:PointerEvent)=>{if(event.target instanceof Node&&ref.current&&!ref.current.contains(event.target))ref.current.open=false};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[])
 return <div className="lcsm-select"><span>{label}</span><details ref={ref} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))e.currentTarget.open=false}} onKeyDown={e=>{if(e.key==='Escape'){e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();e.stopPropagation()}}}><summary aria-label={`${label}: ${options.find(item=>item.value===value)?.label??value}`}>{options.find(item=>item.value===value)?.label??value}<ChevronDown size={14}/></summary><div role="group" aria-label={label}>{options.map(item=><button key={item.value} type="button" aria-pressed={value===item.value} onClick={()=>{if(ref.current){ref.current.open=false;ref.current.querySelector('summary')?.focus()}onChange(item.value)}}>{item.label}{value===item.value&&<Check size={14}/>}</button>)}</div></details></div>
}
