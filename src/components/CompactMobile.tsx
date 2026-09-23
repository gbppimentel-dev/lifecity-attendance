import {useId,useRef,useState,useLayoutEffect,type ReactNode,type SelectHTMLAttributes} from 'react'
import {createPortal} from 'react-dom'
import {Check,ChevronDown,X,Search} from 'lucide-react'
export function MobileFold({title,children}:{title:string;children:ReactNode}){
 const [open,setOpen]=useState(false);const id=useId()
 return <section className="mcu-fold" data-open={open}><button type="button" className="mcu-fold-toggle" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(v=>!v)}>{title}<ChevronDown size={16}/></button><div id={id} className="mcu-fold-body">{children}</div></section>
}
export function ResponsiveSelect(props:SelectHTMLAttributes<HTMLSelectElement>){
 const select=useRef<HTMLSelectElement>(null),dialog=useRef<HTMLDialogElement>(null)
 const [text,setText]=useState('Choose'),[query,setQuery]=useState('')
 const [options,setOptions]=useState<{value:string;text:string;disabled:boolean}[]>([])
 const id=useId()
 useLayoutEffect(()=>{setText(select.current?.selectedOptions[0]?.text??'Choose')})
 function open(){const node=select.current;if(!node||node.matches(':disabled'))return;setOptions(Array.from(node.options).map(o=>({value:o.value,text:o.text,disabled:o.disabled||(o.parentElement instanceof HTMLOptGroupElement&&o.parentElement.disabled)})));setQuery('');dialog.current?.showModal()}
 return <><select {...props} ref={select} className={(props.className??'')+' mcu-native-select'}/><button type="button" className="mcu-select-trigger" disabled={props.disabled} aria-haspopup="dialog" aria-label={props['aria-label']?`${props['aria-label']}: ${text}`:text} onClick={open}>{text}<ChevronDown size={14}/></button>{createPortal(<dialog ref={dialog} className="mcu-select-sheet" aria-labelledby={id} onClick={e=>{e.stopPropagation();if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.currentTarget.close()}}}><header><h2 id={id}>{props['aria-label']??'Choose an Option'}</h2><button type="button" autoFocus aria-label="Close Options" onClick={()=>dialog.current?.close()}><X size={18}/></button></header>{options.length>8&&<label className="mcu-option-search"><Search size={16}/><input aria-label="Find an Option" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find an option…"/></label>}<div className="mcu-option-list">{options.filter(o=>o.text.toLowerCase().includes(query.toLowerCase())).map((o,i)=><button type="button" key={o.value+':'+i} disabled={o.disabled} aria-pressed={select.current?.value===o.value} onClick={()=>{if(select.current){select.current.value=o.value;select.current.dispatchEvent(new Event('change',{bubbles:true}));setText(o.text)}dialog.current?.close()}}>{o.text}{select.current?.value===o.value&&<Check size={16}/>}</button>)}</div>{!options.some(o=>o.text.toLowerCase().includes(query.toLowerCase()))&&<p>No matching options.</p>}</dialog>,document.body)}</>
}
