// Add shipped changes at the top and assign audiences to EACH highlight.
// Shared changes use all four audiences; never publish planned work as completed.
export type ReleaseAudience = 'guest' | 'user' | 'admin' | 'owner'
type Highlight = {text:string;audiences:readonly ReleaseAudience[]}
type Release = {version:string;title:string;highlights:Highlight[]}
const all:ReleaseAudience[]=['guest','user','admin','owner']
const signedIn:ReleaseAudience[]=['user','admin','owner']
const staff:ReleaseAudience[]=['admin','owner']
const note=(text:string,audiences:readonly ReleaseAudience[]=all):Highlight=>({text,audiences})
export const releaseNotes:Release[] = [
 {version:'Pre-Launch · Simpler Mobile Welcome',title:'Less Scrolling, Clearer Choices',highlights:[
  note('Mobile welcome focuses on sign-in and guest access, with first-time account help available on demand.',['guest']),
  note('Shorter benefit labels align consistently, and guest service cards show the full schedule and venue in a tighter layout.',['guest'])
 ]},
 {version:'Pre-Launch · Guest Layout Polish',title:'A More Balanced Guest View',highlights:[
  note('The mobile service refresh button is aligned to the right, opposite the service count.',['guest']),
  note('Member ID, attendance, and profile benefits now use three equally sized tiles.',['guest'])
 ]},
 {version:'Pre-Launch · Mobile Workspaces',title:'More Room for What Matters',highlights:[
  note('Members and Records use tighter mobile rows, compact filters, and option sheets with search for longer lists.',staff),
  note('My Member Space puts attendance QR access first, with expandable profile details, feedback tickets, and attendance history.',signedIn),
  note('Mobile Settings uses compact account actions, smaller appearance controls, and an expandable live preview.',['owner']),
  note('The app suggestion form has a compact mobile sheet with smaller category buttons and all existing submission options.',signedIn)
 ]},
 {version:'Pre-Launch · Mobile Services',title:'Service Management, Made Compact',highlights:[
  note('Mobile Services now uses compact rows with scanner shortcuts and expandable notes and management actions.',staff),
  note('Mobile filters and page-size controls use custom pickers. Create and edit forms keep all fields in a tighter layout.',staff)
 ]},
 {version:'Pre-Launch · Phone Sign-In & Camera Controls',title:'Simpler Camera Controls',highlights:[
  note('Removed flashlight controls and the camera dropdown. Use the switch-camera icon to change cameras.',staff),
  note('Added a phone viewport recovery check when returning from Google sign-in or resuming the app.')
 ]},
 {version:'Pre-Launch · Camera & Startup Fixes',title:'More Reliable Camera Controls',highlights:[
  note('Flashlight control rechecks camera support after startup, verifies reported lamp settings, and offers camera selection for phones with multiple lenses.',staff),
  note('Mobile presentation styles now load with the app’s initial styles instead of depending on page loading order.')
 ]},
 {version:'Pre-Launch · Mobile Scanner',title:'A Smaller Check-In Station',highlights:[
  note('The mobile scanner now uses a compact service card, camera controls, and camera frame with check-in feedback directly below.',staff),
  note('Open manual member search only when needed, and choose services from a mobile bottom sheet.',staff)
 ]},
 {version:'Pre-Launch · Mobile Tech Stack',title:'The Tech Stack, Pocket-Sized',highlights:[
  note('Browse nine technology tiles at a time on phones, with simple page controls.'),
  note('Tap any tool for its full explanation and usage diagram in a compact detail sheet. Desktop keeps its side-by-side layout.')
 ]},
 {version:'Pre-Launch · Mobile Dashboard Polish',title:'Small Details, Smoother Navigation',highlights:[
  note('The mobile dashboard has a softly animated header and a custom period picker that matches the app.',staff),
  note('The mobile dashboard footer now sits at the bottom of short pages without duplicate navigation spacing.',staff)
 ]},
 {version:'Pre-Launch · Mobile Dashboard Redesign',title:'Your Dashboard, Built for Phones',highlights:[
  note('Use quick Scanner and Records actions, compact totals, and one switchable panel for upcoming events, the latest event, and recent activity.',staff),
  note('Expand service notes, additional check-ins, and What’s New only when needed. Desktop dashboard layouts stay the same.',staff)
 ]},
 {version:'Pre-Launch · Mobile Dashboard',title:'A More Compact Overview',highlights:[
  note('Mobile dashboard totals now sit beside their labels in compact rows, with readable event details and bottom navigation clearance.',staff)
 ]},
 {version:'Pre-Launch · Landing Spacing Polish',title:'A Little More Breathing Room',highlights:[
  note('Added a little more space between the desktop welcome card, logo, and footer.',['guest'])
 ]},
 {version:'Pre-Launch · Welcome Illustration',title:'Room for Every Card',highlights:[
  note('The welcome illustration now gives its floating cards separate spaces so the main card’s text stays readable.',['guest'])
 ]},
 {version:'Pre-Launch · Welcome Spacing',title:'More Room to Welcome You',highlights:[
  note('The desktop welcome panel now fills the available height between the brand and footer, with more breathing room for its content.',['guest'])
 ]},
 {version:'Pre-Launch · Welcome Layout',title:'A More Compact Welcome',highlights:[
  note('The welcome page uses height-aware spacing to keep sign-in, help text, and the footer together on standard desktop screens.',['guest'])
 ]},
 {version:'Pre-Launch · Tech Stack Redesign',title:'A New View of the Tech Stack',highlights:[
  note('Explore a compact technology index with a dedicated panel for each tool’s explanation and usage diagram.'),
  note('A fresh ivory and dark teal layout replaces the expanding card grid, with larger logos and subtle motion.')
 ]},
 {version:'Pre-Launch · Interactive Tech Stack',title:'See How Each Tool Helps',highlights:[
  note('Explore colorful, compact technology cards with expandable explanations and simple usage diagrams.'),
  note('The Tech Stack page now shows all tools directly, without search or category filters.')
 ]},
 {version:'Pre-Launch · Compact Tech Stack',title:'Tech Stack at a Glance',highlights:[
  note('Browse technology logos and short descriptions in compact groups organized by purpose.'),
  note('The footer Tech Stack link now uses a subtle underline animation with consistent text sizing.')
 ]},
 {version:'Pre-Launch · Tech Stack Refinement',title:'A Clearer Look Behind the App',highlights:[
  note('The Tech Stack page now has a more focused layout with recognizable technology logos.'),
  note('Refined the footer Tech Stack hover and removed the page’s decorative entrance and floating effects.')
 ]},
 {version:'Pre-Launch · Web Wrap-Up',title:'Meet the Tools Behind LifeCity',highlights:[
  note('Explore the new Tech Stack page from the footer, with searchable categories and optional animated graphics.'),
  note('The public repository now includes a detailed README and a source-based technology and backend inventory.')
 ]},
 {version:'Pre-Launch · Updates That Fit Your Space',title:'Made for Your View',highlights:[
  note('What’s New and Version History now show updates relevant to your access.'),
  note('A friendlier feedback confirmation takes you back to exploring the app.',signedIn),
  note('Your feedback tickets use balanced cards and first, previous, next, and last page controls.',signedIn),
  note('Member linking and account actions share one aligned row. Link reviews have clearer approval and decline controls.',['owner'])
 ]},
 {version:'Pre-Launch · Community Experience',title:'A Warmer Welcome, a Calmer Workspace',highlights:[
  note('Explore a refreshed guest page with illustrated headers, compact gathering cards, and optional playful motion.',['guest']),
  note('Enjoy a cleaner member space with balanced information and church and ministry selections.',signedIn),
  note('Edit profile details without stretching the QR card, and expand request history only when needed.',signedIn),
  note('Find quieter account actions.',['owner']),
  note('Feedback confirmations and sign-in notices have a softer, smaller layout.'),
  note('Open the scanner from a compact camera shortcut in Services.',staff)
 ]},
 {version:'Pre-Launch · Feedback & Account Polish',title:'Clearer Updates, Thoughtful Next Steps',highlights:[
  note('Completed feedback means an improvement has been implemented. Considered ideas stay saved for possible future work.',signedIn),
  note('Feedback confirmations point you to What’s New for completed requests and app improvements.',signedIn),
  note('Account actions have distinct controls for permissions, access, and member links.',['owner']),
  note('Reduced the extra spacing between What’s New and the footer.')
 ]},
 {version:'Pre-Launch · Web Polish',title:'Your Feedback Has a Home',highlights:[
  note('Send app feedback from a compact form with clearer categories.',signedIn),
  note('Follow your feedback tickets from your member page. New status updates stay highlighted until you read them.',signedIn),
  note('See what changed in LifeCity Attendance from your space.')
 ]},
 {version:'Earlier Development · Appearance & Feedback',title:'A More Personal LifeCity Attendance',highlights:[
  note('Customize app colors with a live preview and clearer color controls.',['owner']),
  note('Use a quieter feedback shortcut and find the shared footer across the app.'),
  note('Enjoy refined layouts, readable colors, and optional decorative animations.')
 ]},
 {version:'Earlier Development · Check-In & Reporting',title:'Smoother Check-Ins and Reports',highlights:[
  note('Use a full-screen kiosk with a large camera view and clear check-in feedback.',staff),
  note('Export member lists, services, and attendance with quick or detailed CSV options.',staff),
  note('Find members and services with refined search, filters, and pagination.',staff)
 ]},
 {version:'Earlier Development · Foundations',title:'The Essentials, Together',highlights:[
  note('Register members and generate personal attendance QR codes.',staff),
  note('Manage services,ç record check-ins, and review attendance history.',staff),
  note('Open a member space for profile details and QR access.',signedIn),
  note('Browse public gatherings and service details without signing in.',['guest'])
 ]}
]
export function getReleaseNotes(audience:ReleaseAudience){
 return releaseNotes.map(entry=>({...entry,highlights:entry.highlights.filter(item=>item.audiences.includes(audience)).map(item=>item.text)})).filter(entry=>entry.highlights.length>0)
}
