/** Audited against main 5438bff. Update with package.json and README when the stack changes. */
export const techGroups = ['Interface', 'Data & Identity', 'QR & Reports', 'Browser Tools', 'Build & Delivery'] as const
export type TechGroup = typeof techGroups[number]
export const techStack: {name:string;group:TechGroup;mark:string;description:string}[] = [
 {name:'React 19',group:'Interface',mark:'UI',description:'Components, hooks, lazy loading, and state bring each workspace together.'},
 {name:'React DOM',group:'Interface',mark:'DOM',description:'Renders the app and places dialogs above the surrounding interface with portals.'},
 {name:'TypeScript',group:'Interface',mark:'TS',description:'Typed components and data models with strict checks before every production build.'},
 {name:'HTML & Custom CSS',group:'Interface',mark:'CSS',description:'Responsive layouts, theme variables, gradients, and carefully scoped component styles.'},
 {name:'Lucide React',group:'Interface',mark:'ICON',description:'A shared set of lightweight interface icons, from camera controls to navigation.'},
 {name:'CSS & Web Animations',group:'Interface',mark:'FX',description:'Keyframes and the Web Animations API power optional transitions, illustrations, and click effects.'},
 {name:'Supabase JavaScript SDK',group:'Data & Identity',mark:'SDK',description:'Connects the interface to authentication, database queries, and server-side functions.'},
 {name:'Supabase Auth & Google OAuth',group:'Data & Identity',mark:'AUTH',description:'Google sign-in and session management connect people to their app accounts.'},
 {name:'PostgreSQL & SQL Functions',group:'Data & Identity',mark:'SQL',description:'Relational records and remote procedure calls support members, services, reporting, and reviews.'},
 {name:'Row Level Security',group:'Data & Identity',mark:'RLS',description:'Database access depends on deployed policies and function permissions, beyond the visible UI.'},
 {name:'Supabase Realtime',group:'Data & Identity',mark:'LIVE',description:'Database change subscriptions refresh dashboard and service check-in totals.'},
 {name:'pgcrypto & UUIDs',group:'Data & Identity',mark:'ID',description:'The initial database schema enables pgcrypto and uses generated UUIDs for identifiers and QR tokens.'},
 {name:'html5-qrcode',group:'QR & Reports',mark:'SCAN',description:'Reads QR codes from the camera, with camera switching and supported torch controls.'},
 {name:'qrcode.react',group:'QR & Reports',mark:'QR',description:'Creates SVG member QR codes from opaque tokens rather than personal details.'},
 {name:'Papa Parse',group:'QR & Reports',mark:'CSV',description:'Parses member CSV imports for field mapping and validation. Exports use app-owned CSV formatters.'},
 {name:'Canvas, SVG & File APIs',group:'QR & Reports',mark:'PNG',description:'Render member IDs and QR downloads, read selected files, and save generated exports.'},
 {name:'Media & Fullscreen APIs',group:'Browser Tools',mark:'CAM',description:'Camera access and fullscreen kiosk presentation work within browser and device capabilities.'},
 {name:'Web Audio API',group:'Browser Tools',mark:'SFX',description:'Generates scanner feedback sounds where browser interaction rules allow playback.'},
 {name:'Intl Date & Time',group:'Browser Tools',mark:'TIME',description:'Formats service and reporting dates, including Asia/Manila time.'},
 {name:'Local Storage & Web Crypto',group:'Browser Tools',mark:'WEB',description:'Stores the device’s motion preference and creates feedback request IDs for retry handling.'},
 {name:'Native Dialog & ResizeObserver',group:'Browser Tools',mark:'A11Y',description:'Native modal behavior and size observation support interactive panels without a UI framework.'},
 {name:'Vite 7 & React Plugin',group:'Build & Delivery',mark:'DEV',description:'Runs the development server and bundles production assets with @vitejs/plugin-react.'},
 {name:'Node.js & npm',group:'Build & Delivery',mark:'NPM',description:'Run development tools and install the dependency versions recorded in package-lock.json.'},
 {name:'TypeScript Type Packages',group:'Build & Delivery',mark:'TYPES',description:'React, React DOM, and Papa Parse type definitions support editor assistance and build checks.'},
 {name:'Web App Manifest',group:'Build & Delivery',mark:'APP',description:'Provides app icons, standalone display metadata, and a home-screen identity. Offline caching is not implemented.'},
 {name:'Git & GitHub',group:'Build & Delivery',mark:'GIT',description:'Track source changes and host the public LifeCity Attendance repository.'},
 {name:'Vercel',group:'Build & Delivery',mark:'HOST',description:'Hosts the web deployment. Hosting settings live outside this repository.'}
]
