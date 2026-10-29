// Adapted from the supplied React Bits GlideSelect; themed for LifeCity.
import {Fragment,isValidElement,useCallback,useEffect,useId,useLayoutEffect,useMemo,useRef,useState,type AriaAttributes,type CSSProperties,type FocusEvent,type KeyboardEvent,type ReactNode,type Ref,type SelectHTMLAttributes} from 'react'
import {createPortal} from 'react-dom'
import {Check,ChevronDown,Search} from 'lucide-react'
import './GlideSelect.css'

export type GlideOption={value:string;label:ReactNode;tag?:string;disabled?:boolean;group?:string}
type Props={options?:(string|GlideOption)[];value?:string;defaultValue?:string;onChange?:(value:string,option:GlideOption)=>void;placeholder?:string;showTags?:boolean;accentColor?:string;surfaceColor?:string;highlightColor?:string;textColor?:string;size?:'sm'|'md'|'lg';radius?:number;menuWidth?:number;placement?:'top'|'bottom';align?:'left'|'right';popDuration?:number;glideDuration?:number;rememberPosition?:boolean;disabled?:boolean;ariaLabel?:string;className?:string;style?:CSSProperties;id?:string;searchable?:boolean;required?:boolean;'aria-labelledby'?:string;'aria-describedby'?:string;'aria-invalid'?:AriaAttributes['aria-invalid'];onBlur?:(event:FocusEvent<HTMLButtonElement>)=>void;onFocus?:(event:FocusEvent<HTMLButtonElement>)=>void;onKeyDown?:(event:KeyboardEvent<HTMLButtonElement>)=>void;triggerRef?:Ref<HTMLButtonElement>}
type Position={left:number;top:number;width:number;maxHeight:number;side:'top'|'bottom'}
const SIZES={sm:{chip:32,row:34,font:12},md:{chip:42,row:38,font:13},lg:{chip:44,row:44,font:14}}
const DEFAULT_OPTIONS=['One','Two','Three']
const textOf=(node:ReactNode):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(textOf).join(''):isValidElement<{children?:ReactNode}>(node)?textOf(node.props.children):''
const samePosition=(a:Position|null,b:Position)=>a&&a.left===b.left&&a.top===b.top&&a.width===b.width&&a.maxHeight===b.maxHeight&&a.side===b.side
function useMotionOff(){
 const read=()=>document.documentElement.dataset.lcMotion==='off'||matchMedia('(prefers-reduced-motion: reduce)').matches
 const [off,setOff]=useState(read)
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)'),sync=()=>setOff(read()),observer=new MutationObserver(sync);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-lc-motion']});media.addEventListener('change',sync);return()=>{observer.disconnect();media.removeEventListener('change',sync)}},[])
 return off
}
export default function GlideSelect({options=DEFAULT_OPTIONS,value,defaultValue='',onChange,placeholder='Select…',showTags=true,accentColor,surfaceColor,highlightColor,textColor,size='md',radius=12,menuWidth=200,placement='bottom',align='left',popDuration=180,glideDuration=220,rememberPosition=true,disabled=false,ariaLabel,className='',style,id:suppliedId,searchable,required,'aria-labelledby':labelledBy,'aria-describedby':describedBy,'aria-invalid':invalid,onBlur,onFocus,onKeyDown,triggerRef}:Props){
 const autoId=useId(),id=suppliedId??autoId+'-trigger'
 const items=useMemo(()=>options.map(option=>typeof option==='string'?{value:option,label:option}:option),[options])
 const [inner,setInner]=useState(defaultValue),current=value??inner,selected=items.findIndex(option=>option.value===current)
 const [phase,setPhase]=useState<'closed'|'opening'|'open'|'closing'>('closed'),[active,setActive]=useState(-1),[mode,setMode]=useState<'keyboard'|'pointer'>('keyboard')
 const [query,setQuery]=useState(''),[swap,setSwap]=useState(false),[position,setPosition]=useState<Position|null>(null),[portal,setPortal]=useState<HTMLElement|null>(null),[inferredLabel,setInferredLabel]=useState('')
 const root=useRef<HTMLSpanElement>(null),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),list=useRef<HTMLDivElement>(null),search=useRef<HTMLInputElement>(null),rows=useRef(new Map<number,HTMLDivElement>())
 const [pill,setPill]=useState({top:0,height:38,visible:false})
 const closeTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),swapTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),openingFrame=useRef(0),typeahead=useRef({value:'',at:0}),touch=useRef<{x:number;y:number;moved:boolean}|null>(null)
 const motionOff=useMotionOff(),S=SIZES[size],isOpen=phase==='open'||phase==='opening',showSearch=searchable??items.length>8
 const filtered=useMemo(()=>items.map((option,index)=>({option,index})).filter(({option})=>(textOf(option.label)+' '+(option.tag??'')+' '+(option.group??'')).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),[items,query])
 const enabled=filtered.filter(({option})=>!option.disabled).map(({index})=>index)
 const latest=useRef({items,current,onChange,disabled});latest.current={items,current,onChange,disabled}
 const close=useCallback((instant=false,restoreFocus=false)=>{clearTimeout(closeTimer.current);cancelAnimationFrame(openingFrame.current);touch.current=null;if(restoreFocus)trigger.current?.focus({preventScroll:true});if(instant||motionOff)setPhase('closed');else{setPhase('closing');closeTimer.current=setTimeout(()=>setPhase('closed'),Math.max(0,popDuration*2/3))}},[motionOff,popDuration])
 useLayoutEffect(()=>{
  const node=trigger.current;if(!node)return
  if(ariaLabel||labelledBy){setInferredLabel('');return}
  const label=node.labels?.[0]??node.closest('label');if(!label){setInferredLabel('');return}
  const copy=label.cloneNode(true) as HTMLElement
  copy.querySelectorAll('.glide-select,.lc-select-native,select,input,button').forEach(child=>child.remove())
  setInferredLabel(copy.textContent?.replace(/\s+/g,' ').trim()??'')
 },[ariaLabel,labelledBy,current,options])
 const calculatePosition=useCallback(()=>{
  const node=trigger.current;if(!node?.isConnected)return
  if(node.closest('[hidden],[aria-hidden="true"]')){close(true);return}
  const box=node.getBoundingClientRect(),viewport=window.visualViewport,leftEdge=viewport?.offsetLeft??0,topEdge=viewport?.offsetTop??0,viewportWidth=viewport?.width??innerWidth,viewportHeight=viewport?.height??innerHeight
  if(!box.width||!box.height||box.bottom<topEdge||box.top>topEdge+viewportHeight){close(true);return}
  const margin=10,gap=6,width=Math.min(Math.max(menuWidth,box.width),viewportWidth-margin*2),below=topEdge+viewportHeight-box.bottom-gap-margin,above=box.top-topEdge-gap-margin
  const estimated=Math.max(Math.min(340,Math.max(S.row,filtered.length*(S.row+1)+10)+(showSearch?51:0)),menu.current?.scrollHeight??0)
  let side=placement;if(side==='bottom'&&below<estimated&&above>below)side='top';if(side==='top'&&above<estimated&&below>above)side='bottom'
  const maxHeight=Math.max(44,Math.min(340,side==='bottom'?below:above,viewportHeight-margin*2)),desiredHeight=Math.min(menu.current?.scrollHeight??estimated,maxHeight)
  const left=Math.min(Math.max(align==='right'?box.right-width:box.left,leftEdge+margin),leftEdge+viewportWidth-margin-width),top=side==='bottom'?box.bottom+gap:Math.max(topEdge+margin,box.top-gap-desiredHeight)
  const next={left:Math.round(left),top:Math.round(top),width:Math.round(width),maxHeight:Math.floor(maxHeight),side};setPosition(previous=>samePosition(previous,next)?previous:next)
 },[align,close,filtered.length,menuWidth,placement,S.row,showSearch])
 function open(viaKey=false,end=false){
  if(latest.current.disabled||trigger.current?.matches(':disabled')||trigger.current?.closest('[hidden],[aria-hidden="true"]'))return
  clearTimeout(closeTimer.current);typeahead.current={value:'',at:0};touch.current=null;setQuery('');setPosition(null);setMode('keyboard')
  const indexes=items.map((option,index)=>option.disabled?-1:index).filter(index=>index>=0)
  setActive(selected>=0&&!items[selected].disabled?selected:viaKey&&end?indexes.at(-1)??-1:indexes[0]??-1)
  setPortal(trigger.current?.closest<HTMLElement>('dialog,[role="dialog"]')??document.body);setPhase('opening')
 }
 function pick(index:number){
  const option=latest.current.items[index];if(!option||option.disabled||latest.current.disabled)return
  if(option.value!==latest.current.current){if(value===undefined)setInner(option.value);if(!motionOff){setSwap(true);clearTimeout(swapTimer.current);swapTimer.current=setTimeout(()=>setSwap(false),180)}latest.current.onChange?.(option.value,option)}
  close(true,true)
 }
 function key(event:KeyboardEvent<HTMLElement>){
  if(event.defaultPrevented)return
  const searching=event.target===search.current,k=event.key
  if(!isOpen){
   if(['Enter',' ','ArrowDown','ArrowUp'].includes(k)){event.preventDefault();open(true,k==='ArrowUp')}
   else if(k.length===1&&!event.altKey&&!event.ctrlKey&&!event.metaKey){event.preventDefault();open(true);typeahead.current={value:k.toLocaleLowerCase(),at:performance.now()};const next=items.findIndex(option=>!option.disabled&&textOf(option.label).toLocaleLowerCase().startsWith(typeahead.current.value));if(next>=0)setActive(next)}
   return
  }
  if(k==='Escape'){event.preventDefault();event.stopPropagation();close(true,true);return}
  if(k==='Tab'){close(true,searching);return}
  let next=active
  if(k==='ArrowDown'||k==='ArrowUp'){event.preventDefault();const index=enabled.indexOf(active),step=k==='ArrowDown'?1:-1;next=enabled[Math.min(enabled.length-1,Math.max(0,index<0?step>0?0:enabled.length-1:index+step))]??-1}
  else if(!searching&&(k==='Home'||k==='End')){event.preventDefault();next=enabled[k==='Home'?0:enabled.length-1]??-1}
  else if(k==='Enter'||(!searching&&k===' ')){event.preventDefault();pick(active);return}
  else if(!searching&&k.length===1&&!event.altKey&&!event.ctrlKey&&!event.metaKey){event.preventDefault();const now=performance.now(),previous=now-typeahead.current.at<700?typeahead.current.value:'';let term=previous+k.toLocaleLowerCase();if(term.length>1&&[...term].every(char=>char===term[0]))term=k.toLocaleLowerCase();typeahead.current={value:term,at:now};const ordered=[...enabled.filter(i=>i>active),...enabled.filter(i=>i<=active)];next=ordered.find(i=>textOf(items[i].label).toLocaleLowerCase().startsWith(term))??active}
  else return
  setMode('keyboard');setActive(next)
 }
 useLayoutEffect(()=>{if(phase!=='opening')return;calculatePosition();openingFrame.current=requestAnimationFrame(()=>setPhase('open'));return()=>cancelAnimationFrame(openingFrame.current)},[phase,calculatePosition])
 useLayoutEffect(()=>{if(isOpen)calculatePosition()},[isOpen,phase,filtered,calculatePosition,position?.width])
 useLayoutEffect(()=>{
  if(!isOpen)return
  const observer=new ResizeObserver(calculatePosition)
  if(trigger.current)observer.observe(trigger.current)
  if(menu.current)observer.observe(menu.current)
  return()=>observer.disconnect()
 },[isOpen,calculatePosition])
 useLayoutEffect(()=>{
  if(!isOpen)return
  const row=rows.current.get(active),container=list.current
  if(!row||!container||!filtered.some(item=>item.index===active)){setPill(previous=>previous.visible?{...previous,visible:false}:previous);return}
  if(mode==='keyboard'){if(row.offsetTop<container.scrollTop)container.scrollTop=row.offsetTop;else if(row.offsetTop+row.offsetHeight>container.scrollTop+container.clientHeight)container.scrollTop=row.offsetTop+row.offsetHeight-container.clientHeight}
  setPill(previous=>previous.top===row.offsetTop&&previous.height===row.offsetHeight&&previous.visible?previous:{top:row.offsetTop,height:row.offsetHeight,visible:true})
 },[active,filtered,isOpen,mode,position])
 useEffect(()=>{if(isOpen&&!enabled.includes(active)){setMode('keyboard');setActive(enabled.includes(selected)?selected:enabled[0]??-1)}},[items,filtered,active,isOpen,selected])
 useEffect(()=>{if(isOpen){setMode('keyboard');setActive(selected)}},[current,selected])
 useEffect(()=>{if(disabled)close(true)},[disabled,close])
 useLayoutEffect(()=>{
  if(phase==='closed')return
  // A portal is outside its trigger's hidden workspace. Remove it immediately
  // when a retained route/tab closes, without focusing the hidden control.
  const dismissHidden=()=>{if(!trigger.current?.isConnected||trigger.current.closest('[hidden],[aria-hidden="true"]'))close(true)}
  const observer=new MutationObserver(dismissHidden)
  let ancestor:HTMLElement|null=trigger.current?.parentElement??null
  while(ancestor){observer.observe(ancestor,{attributes:true,attributeFilter:['hidden','aria-hidden']});ancestor=ancestor.parentElement}
  window.addEventListener('lifecity-workspace-activate',dismissHidden)
  window.addEventListener('lifecity-settings-activate',dismissHidden)
  dismissHidden()
  return()=>{observer.disconnect();window.removeEventListener('lifecity-workspace-activate',dismissHidden);window.removeEventListener('lifecity-settings-activate',dismissHidden)}
 },[phase,close])
 useEffect(()=>{
  if(phase==='closed')return
  const outside=(event:PointerEvent)=>{const target=event.target as Node;if(!root.current?.contains(target)&&!menu.current?.contains(target))close()}
  const reposition=(event:Event)=>{if(event.target instanceof Node&&menu.current?.contains(event.target))return;calculatePosition()}
  document.addEventListener('pointerdown',outside,true);window.addEventListener('resize',reposition);window.addEventListener('scroll',reposition,true);window.visualViewport?.addEventListener('resize',reposition);window.visualViewport?.addEventListener('scroll',reposition)
  return()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',reposition);window.removeEventListener('scroll',reposition,true);window.visualViewport?.removeEventListener('resize',reposition);window.visualViewport?.removeEventListener('scroll',reposition)}
 },[phase,close,calculatePosition])
 useEffect(()=>()=>{clearTimeout(closeTimer.current);clearTimeout(swapTimer.current);cancelAnimationFrame(openingFrame.current)},[])
 const name=ariaLabel||inferredLabel||'Select'
 const variables={'--gs-chip':S.chip+'px','--gs-row':S.row+'px','--gs-font':S.font+'px','--gs-radius':radius+'px','--gs-pop':(motionOff?0:popDuration)+'ms','--gs-glide':(motionOff||mode==='keyboard'?0:glideDuration)+'ms','--gs-origin':(position?.side==='top'?'bottom':'top')+' '+align,...(accentColor?{'--gs-accent':accentColor}:{}),...(surfaceColor?{'--gs-surface':surfaceColor}:{}),...(highlightColor?{'--gs-highlight':highlightColor}:{}),...(textColor?{'--gs-text':textColor}:{})} as CSSProperties
 const popup=phase!=='closed'&&portal?createPortal(<div ref={menu} className="glide-select__menu" data-state={phase} data-reduced={motionOff||undefined} aria-hidden={phase==='closing'||undefined} inert={phase==='closing'||undefined} style={{...variables,position:'fixed',left:position?.left??0,top:position?.top??0,width:position?.width??menuWidth,maxHeight:position?.maxHeight??340,visibility:position?'visible':'hidden'}} onBlurCapture={event=>{const next=event.relatedTarget as Node|null;if(next&&!menu.current?.contains(next)&&!root.current?.contains(next))close(true)}}>
  {showSearch&&<div className="glide-select__search"><Search size={15} aria-hidden="true"/><input ref={search} type="search" placeholder="Find an option…" aria-label={'Find an option for '+name} autoComplete="off" spellCheck={false} value={query} onChange={event=>{setQuery(event.target.value);setMode('keyboard');setActive(-1)}} onKeyDown={key} aria-controls={autoId+'-list'} aria-activedescendant={active>=0?autoId+'-'+active:undefined}/></div>}
  <div ref={list} id={autoId+'-list'} role="listbox" aria-label={name} className="glide-select__list" data-live={pill.visible||undefined} onPointerLeave={()=>{if(!rememberPosition&&!touch.current)setActive(-1)}} onPointerDown={event=>{touch.current={x:event.clientX,y:event.clientY,moved:false};if(event.pointerType==='mouse')event.preventDefault()}} onPointerMove={event=>{if(touch.current&&Math.hypot(event.clientX-touch.current.x,event.clientY-touch.current.y)>8)touch.current.moved=true}} onPointerCancel={()=>{if(touch.current)touch.current.moved=true}}>
   <span className="glide-select__pill" aria-hidden="true" style={{height:pill.height,transform:'translateY('+pill.top+'px)',opacity:pill.visible?1:0}}/>
   {filtered.map(({option,index},at)=><Fragment key={option.value+':'+index}>
    {option.group&&(at===0||filtered[at-1].option.group!==option.group)&&<div className="glide-select__group" aria-hidden="true">{option.group}</div>}
    <div ref={node=>{if(node)rows.current.set(index,node);else rows.current.delete(index)}} id={autoId+'-'+index} role="option" aria-selected={index===selected} aria-disabled={option.disabled||undefined} className="glide-select__option" data-index={index} onPointerEnter={event=>{if(event.pointerType!=='touch'&&!option.disabled){setMode('pointer');setActive(index)}}} onClick={()=>{const moved=touch.current?.moved;touch.current=null;if(!moved)pick(index)}}><span className="glide-select__name">{option.label}</span>{showTags&&option.tag&&<span className="glide-select__tag">{option.tag}</span>}<Check size={15} className="glide-select__check" data-on={index===selected||undefined} aria-hidden="true"/></div>
   </Fragment>)}
   {!filtered.length&&<p className="glide-select__empty">No matching options.</p>}
  </div>
 </div>,portal):null
 return <span ref={root} className={'glide-select'+(className?' '+className:'')} data-size={size} data-disabled={disabled||undefined} data-swap={swap||undefined} style={{...variables,...style}}>
  <button ref={node=>{trigger.current=node;if(typeof triggerRef==='function')triggerRef(node);else if(triggerRef)triggerRef.current=node}} id={id} type="button" className="glide-select__trigger" role="combobox" aria-haspopup="listbox" aria-expanded={isOpen} aria-controls={autoId+'-list'} aria-activedescendant={isOpen&&active>=0?autoId+'-'+active:undefined} aria-label={labelledBy?ariaLabel:name} aria-labelledby={labelledBy} aria-describedby={describedBy} aria-invalid={invalid} aria-required={required||undefined} disabled={disabled} onClick={()=>{if(isOpen)close();else open()}} onKeyDown={event=>{onKeyDown?.(event);key(event)}} onFocus={onFocus} onBlur={event=>{if(menu.current?.contains(event.relatedTarget as Node|null))return;onBlur?.(event);if(!root.current?.contains(event.relatedTarget as Node|null))close(true)}}><span className="glide-select__label" data-empty={selected<0||undefined}>{selected>=0?items[selected].label:placeholder}</span><ChevronDown size={15} className="glide-select__chevron" aria-hidden="true"/></button>{popup}
 </span>
}

export function SelectControl(props:SelectHTMLAttributes<HTMLSelectElement>){
 const {children,value,defaultValue,id,className,style,onChange,onBlur,onFocus,onKeyDown,onInvalid,...nativeProps}=props
 const autoId=useId(),native=useRef<HTMLSelectElement>(null),button=useRef<HTMLButtonElement>(null),[current,setCurrent]=useState(String(value??defaultValue??'')),[invalid,setInvalid]=useState(false)
 const [options,setOptions]=useState<GlideOption[]>([]),latest=useRef(props);latest.current=props
 useLayoutEffect(()=>{const node=native.current;if(!node)return
  const next=Array.from(node.options).map(option=>{const group=option.parentElement instanceof HTMLOptGroupElement?option.parentElement:null;return{value:option.value,label:option.label,disabled:option.disabled||Boolean(group?.disabled),group:group?.label}})
  setOptions(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next)
  setCurrent(node.value);if(node.validity.valid)setInvalid(false)
 },[value,defaultValue,children])
 useEffect(()=>{const form=native.current?.form;if(!form)return;let frame=0;const reset=()=>{frame=requestAnimationFrame(()=>{const node=native.current;if(!node)return;if(latest.current.value!==undefined)node.value=String(latest.current.value);setCurrent(node.value);setInvalid(false)})};form.addEventListener('reset',reset);return()=>{form.removeEventListener('reset',reset);cancelAnimationFrame(frame)}},[props.form])
 function nativeEvent<T extends object>(event:T):T{return new Proxy(event,{get(target,key){if(key==='target'||key==='currentTarget')return native.current;const result=Reflect.get(target,key);return typeof result==='function'?result.bind(target):result}})}
 return <span className="lc-select-control">
  <GlideSelect options={options} value={current} disabled={props.disabled} id={id??autoId+'-control'} required={props.required} ariaLabel={props['aria-label']} aria-labelledby={props['aria-labelledby']} aria-describedby={props['aria-describedby']} aria-invalid={props['aria-invalid']??(invalid||undefined)} triggerRef={button} className={'glide-select--field'+(className?' '+className:'')} style={style} onBlur={event=>onBlur?.(nativeEvent(event) as unknown as FocusEvent<HTMLSelectElement>)} onFocus={event=>onFocus?.(nativeEvent(event) as unknown as FocusEvent<HTMLSelectElement>)} onKeyDown={event=>onKeyDown?.(nativeEvent(event) as unknown as KeyboardEvent<HTMLSelectElement>)} onChange={next=>{const node=native.current;if(!node)return;node.value=next;node.dispatchEvent(new Event('change',{bubbles:true}));setCurrent(node.value);if(node.validity.valid)setInvalid(false)}}/>
  <select {...nativeProps} ref={native} id={(id??autoId)+'-native'} className="lc-select-native" tabIndex={-1} aria-hidden="true" value={value} defaultValue={defaultValue} onChange={event=>{onChange?.(event);setCurrent(event.currentTarget.value);if(event.currentTarget.validity.valid)setInvalid(false)}} onInvalid={event=>{event.preventDefault();onInvalid?.(event);setInvalid(true);button.current?.focus({preventScroll:false})}}>{children}</select>
  {invalid&&<span className="glide-select__validation" role="alert">Please choose an option.</span>}
 </span>
}
