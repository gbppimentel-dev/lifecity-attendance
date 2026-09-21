import { Heart, Sparkles, CalendarDays, Users } from 'lucide-react'

/** Decorative only: never hides live information or changes focus order. */
export default function CommunityArt({compact=false}:{compact?:boolean}) {
 return <div className={'lc-community-art'+(compact?' is-compact':'')} aria-hidden="true">
  <div className="lc-art-orbit"/>
  <svg className="lc-art-home" viewBox="0 0 240 180" fill="none">
   <path className="lc-art-ground" d="M20 156Q120 140 220 156" strokeWidth="3" strokeLinecap="round"/>
   <path className="lc-art-building" d="M62 85L120 38L178 85V151H62V85Z" strokeWidth="3" strokeLinejoin="round"/>
   <path className="lc-art-roof" d="M47 90L120 29L193 90" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
   <path className="lc-art-door" d="M102 151V119a18 18 0 0 1 36 0v32"/>
   <circle className="lc-art-window" cx="120" cy="75" r="12"/>
   <path d="M120 65V85M110 75H130" stroke="currentColor" strokeWidth="2"/>
   <path className="lc-art-leaf" d="M41 151C17 135 19 117 27 110C42 119 46 135 41 151ZM199 151C223 135 221 117 213 110C198 119 194 135 199 151Z"/>
  </svg>
  <span className="lc-art-sticker sticker-heart"><Heart size={21}/></span>
  <span className="lc-art-sticker sticker-calendar"><CalendarDays size={21}/></span>
  <span className="lc-art-sticker sticker-people"><Users size={22}/></span>
  <Sparkles className="lc-art-spark" size={23}/>
 </div>
}
