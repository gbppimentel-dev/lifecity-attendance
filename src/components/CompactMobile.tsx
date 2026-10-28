import {useId,useState,type ReactNode,type SelectHTMLAttributes} from 'react'
import {ChevronDown} from 'lucide-react'
import {SelectControl} from './GlideSelect'
export function MobileFold({title,children}:{title:string;children:ReactNode}){
 const [open,setOpen]=useState(false);const id=useId()
 return <section className="mcu-fold" data-open={open}><button type="button" className="mcu-fold-toggle" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(v=>!v)}>{title}<ChevronDown size={16}/></button><div id={id} className="mcu-fold-body">{children}</div></section>
}
export function ResponsiveSelect(props:SelectHTMLAttributes<HTMLSelectElement>){return <SelectControl {...props}/>}
