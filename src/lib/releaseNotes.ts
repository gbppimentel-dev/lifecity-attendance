// Add each shipped update at the top. Keep unreleased plans out of highlights.
// Historical entries are development milestones, not invented release numbers/dates.
export const releaseNotes = [
 {version:'Pre-Launch · Community Experience',title:'A Warmer Welcome, a Calmer Workspace',highlights:[
  'Explore a refreshed guest page with illustrated headers, compact gathering cards, and optional playful motion.',
  'Enjoy a cleaner member space with balanced information and church and ministry selections.',
  'Edit profile details without stretching the QR card, and expand request history only when needed.',
  'Find quieter account actions, smaller feedback confirmations, and a compact camera shortcut in Services.'
 ]},
 {version:'Pre-Launch · Feedback & Account Polish',title:'Clearer Updates, Thoughtful Next Steps',highlights:[
  'Completed feedback means an improvement has been implemented. Considered ideas stay saved for possible future work.',
  'Feedback confirmations point you to What’s New for completed requests and app improvements.',
  'Account actions have distinct, evenly sized controls for permissions, access, and member links.',
  'Reduced the extra spacing between What’s New and the footer.'
 ]},
 {version:'Pre-Launch · Web Polish',title:'Your Feedback Has a Home',highlights:[
  'Send app feedback from a compact form with clearer categories.',
  'Follow your feedback tickets from your member page. New status updates stay highlighted until you read them.',
  'See what changed in LifeCity Attendance from the dashboard, member space, or guest preview.'
 ]},
 {version:'Earlier Development · Appearance & Feedback',title:'A More Personal LifeCity Attendance',highlights:[
  'Customize app colors with a live preview and clearer color controls.',
  'Use a quieter feedback shortcut and find the shared footer across the app.',
  'Enjoy refined layouts, readable colors, and optional decorative animations.'
 ]},
 {version:'Earlier Development · Check-In & Reporting',title:'Smoother Check-Ins and Reports',highlights:[
  'Use a full-screen kiosk with a large camera view and clear check-in feedback.',
  'Export member lists, services, and attendance with quick or detailed CSV options.',
  'Find members and services with refined search, filters, and pagination.'
 ]},
 {version:'Earlier Development · Foundations',title:'The Essentials, Together',highlights:[
  'Register members and generate personal attendance QR codes.',
  'Manage services, record check-ins, and review attendance history.',
  'Open a member space for profile details and QR access, or browse public services as a guest.'
 ]}
] as const
