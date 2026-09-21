import { lazy, Suspense, useState } from 'react'
const TechStackPage=lazy(()=>import('./TechStackPage'))
export default function AppFooter({landing=false}:{landing?:boolean}){
 const [showTech,setShowTech]=useState(false)
 return <><footer className={`lc-app-footer${landing?' lc-auth-footer lc-landing-footer':''}`}>
  <p className="lc-footer-credit">© {new Date().getFullYear()} LifeCity Attendance <span aria-hidden="true">·</span> LifeCity Church of Christ</p>
  <p className="lc-footer-verse">“So whether you eat or drink or whatever you do, do it all for the glory of God.” — 1 Corinthians 10:31</p>
  <button type="button" className="lc-footer-tech" onClick={()=>setShowTech(true)} aria-haspopup="dialog">Tech Stack</button>
 </footer>{showTech&&<Suspense fallback={<p role="status" className="lc-tech-loading">Opening Tech Stack…</p>}><TechStackPage onClose={()=>setShowTech(false)}/></Suspense>}</>
}
