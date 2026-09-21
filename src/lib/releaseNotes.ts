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
