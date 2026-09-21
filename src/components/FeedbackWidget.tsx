import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Bug, CheckCircle2, Lightbulb, MessageSquare, Send, Sparkles, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

export const feedbackCategories=[{value:'bug',label:'Bug Report',icon:Bug},{value:'idea',label:'Feature Idea',icon:Lightbulb},{value:'improvement',label:'Improvement',icon:Sparkles},{value:'other',label:'Other',icon:MessageSquare}] as const
export function feedbackError(error:unknown){const e=error as {code?:string;message?:string};return e.code==='P0001'?e.message||'Please try again.':e.code==='PGRST202'?'Feedback is not set up yet. Please contact the Owner.':'Could not complete the request. Check your connection and try again.'}
export default function FeedbackWidget(){
 const id=useId(),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null)
 const [uid,setUid]=useState<string|null>(null),[authReady,setAuthReady]=useState(false),[open,setOpen]=useState(false)
 const [category,setCategory]=useState('bug'),[subject,setSubject]=useState(''),[message,setMessage]=useState(''),[anonymous,setAnonymous]=useState(false)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[sent,setSent]=useState(false)
 const lock=useRef(false),requestId=useRef<string|null>(null),currentUid=useRef<string|null>(null),generation=useRef(0),alive=useRef(true)
 useEffect(()=>{alive.current=true;let observed=false,disposed=false
  function auth(next:string|null){if(disposed)return;if(currentUid.current!==next){generation.current++;currentUid.current=next;requestId.current=null;setSubject('');setMessage('');setAnonymous(false);setSent(false);setError('')}setUid(next);setAuthReady(true)}
  const {data}=supabase.auth.onAuthStateChange((_event,session)=>{observed=true;auth(session?.user.id??null)})
  void supabase.auth.getSession().then(({data})=>{if(!disposed&&!observed)auth(data.session?.user.id??null)}).catch(()=>{if(!disposed&&!observed)auth(null)})
  return()=>{disposed=true;alive.current=false;generation.current++;data.subscription.unsubscribe()}
 },[])
 useEffect(()=>{if(!open)return;const el=dialog.current;if(!el)return
  el.showModal();const previous=document.body.style.overflow;document.body.style.overflow='hidden'
  return()=>{el.close();document.body.style.overflow=previous;trigger.current?.focus({preventScroll:true})}
 },[open])
 function close(){if(!lock.current)setOpen(false)}
 async function submit(e:FormEvent){e.preventDefault();if(!uid||lock.current)return
  lock.current=true;setBusy(true);setError('');const started=generation.current
  try{requestId.current??=crypto.randomUUID()
   const page=document.querySelector('.main-nav .nav-active')?.textContent?.trim()||document.querySelector('h1')?.textContent?.trim()||'Member Space'
   const {error:failure}=await supabase.rpc('lc_submit_feedback',{p_request_id:requestId.current,p_category:category,p_subject:subject.trim(),p_message:message.trim(),p_anonymous:anonymous,p_page:page.slice(0,120)})
   if(failure)throw failure
   if(alive.current&&started===generation.current){setSent(true);window.dispatchEvent(new Event('lc-feedback-sent'));setSubject('');setMessage('');requestId.current=null}
  }catch(failure){if(alive.current&&started===generation.current)setError(feedbackError(failure))}
  finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 return <><button ref={trigger} type="button" className="lcf-floating" onClick={()=>{setSent(false);setError('');setOpen(true)}} aria-haspopup="dialog" aria-label="Feedback for LifeCity Attendance" aria-expanded={open}><MessageSquare size={19} aria-hidden="true"/><span aria-hidden="true">Feedback / Bug Report</span></button>
 <dialog ref={dialog} className="lcf-dialog" aria-labelledby={`${id}-title`} onCancel={e=>{e.preventDefault();close()}} onClose={()=>setOpen(false)}>
 <header className="lcf-heading lcf-playful-heading"><div className="lcf-header-art" aria-hidden="true"><MessageSquare size={30}/><Sparkles size={16}/><i/><i/></div><div><p className="eyebrow">LifeCity Attendance · App Feedback</p><h2 id={`${id}-title`}>A Little Idea. A Better App.</h2><p>Found a bug or thought of something useful? Help improve LifeCity Attendance.</p></div><button type="button" className="lcf-icon" aria-label="Close Feedback" disabled={busy} onClick={close}><X size={20}/></button></header>
 {!authReady?<p role="status">Checking your sign-in…</p>:!uid?<div className="lcf-notice"><MessageSquare size={28}/><h3>Sign In to Send Feedback</h3><p>Sign in to LifeCity Attendance, then share your feedback about the app.</p><button type="button" className="secondary-button" onClick={close}>Back to the App</button></div>:sent?<div className="lcf-notice" role="status"><CheckCircle2 size={36}/><h3>You’re Helping Shape the App!</h3><p>Your feedback about LifeCity Attendance has been received. Thank you!</p><p>Feel free to check the What’s New section for completed requests and the latest app improvements.</p><button type="button" className="primary-button" onClick={close}>Back to Exploring</button></div>:<form onSubmit={e=>void submit(e)}>
 <fieldset disabled={busy}><legend className="lcf-sr-only">Send Feedback</legend>
 <div><span className="lcf-label">What’s on Your Mind?</span><div className="lcf-category-options" role="group" aria-label="Feedback Category">{feedbackCategories.map(({value,label,icon:Icon})=><button key={value} type="button" aria-pressed={category===value} onClick={()=>setCategory(value)}><span className="lcf-category-icon"><Icon size={20}/></span><span>{label}</span></button>)}</div></div>
 <label>Subject<input required minLength={3} maxLength={160} value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Give your app feedback a short title…"/></label>
 <label>Message<textarea required minLength={10} maxLength={5000} rows={3} value={message} onChange={e=>setMessage(e.target.value)} placeholder={category==='bug'?'Which app page were you on? What happened, and what did you expect?':category==='idea'?'What would you love to do in LifeCity Attendance? Tell us how it would help.':'Tell us what could make LifeCity Attendance easier or more enjoyable to use…'}/><small>{message.length.toLocaleString()} / 5,000</small></label>
 <label className="lcf-anonymous"><input type="checkbox" checked={anonymous} onChange={e=>setAnonymous(e.target.checked)} aria-describedby={`${id}-privacy`}/><span><strong>Hide My Identity</strong><small id={`${id}-privacy`}>Hidden by default. The app Owner can reveal your identity.</small></span></label>
 </fieldset>
 {error&&<p className="lcf-error" role="alert">{error}</p>}
 <button type="submit" className="primary-button lcf-submit" disabled={busy||subject.trim().length<3||message.trim().length<10}><Send size={17}/>{busy?'Sending…':'Send Feedback'}</button>
 </form>}
 </dialog></>
}
