export default function AppFooter({landing=false}:{landing?:boolean}){
 return <footer className={`lc-app-footer${landing?' lc-auth-footer lc-landing-footer':''}`}>
  <p className="lc-footer-credit">© {new Date().getFullYear()} LifeCity Attendance <span aria-hidden="true">·</span> LifeCity Church of Christ</p>
  <p className="lc-footer-verse">“So whether you eat or drink or whatever you do, do it all for the glory of God.” — 1 Corinthians 10:31</p>
  <button type="button" className="lc-footer-tech" disabled title="Available when the app is complete">Tech Stack</button>
 </footer>
}
