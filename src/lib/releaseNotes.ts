export type ReleaseAudience = 'guest' | 'user' | 'admin' | 'owner';
type Highlight = { text: string; audiences: readonly ReleaseAudience[] };
type Release = { version: string; title: string; highlights: Highlight[] };
const all: ReleaseAudience[] = ['guest', 'user', 'admin', 'owner'];
const signedIn: ReleaseAudience[] = ['user', 'admin', 'owner'];
const staff: ReleaseAudience[] = ['admin', 'owner'];
const note = (text: string, audiences: readonly ReleaseAudience[] = all): Highlight => ({
  text,
  audiences,
});
export const releaseNotes: Release[] = [
  {
    version: 'Pre-Launch · Service Notes v26',
    title: 'A Playful Corner Detail',
    highlights: [
      note(
        'Member and guest service cards show their status and Sunday label as small paper notes overlapping the corner, with soft colors and a subtle hover tilt.',
      ),
    ],
  },
  {
    version: 'Pre-Launch · Member & Guest Spaces v25',
    title: 'Services First, Details Within Reach',
    highlights: [
      note(
        'Member Space shows current and upcoming services near the top, with a three-service preview and expandable schedule. Profile and QR cards align, with shortcuts to attendance and feedback.',
        signedIn,
      ),
      note(
        'Profile details and requests open in a side panel, with searchable church and ministry choices, compact change comparisons and clearer review confirmations. Attendance history and feedback tickets have refreshed filters, status controls and pagination.',
        signedIn,
      ),
      note(
        'Attendance QR opens in a private side panel with Member ID and QR downloads. Downloads recheck the active member connection before creating a file.',
        signedIn,
      ),
      note(
        'Guest Preview has a clearer public schedule, calendar cards, sign-in information and refresh feedback. Public service cards remain visible while the same page refreshes.',
      ),
      note(
        'Approval, member-link and access confirmation buttons retain readable primary colors on hover. Decline and suspension actions keep their warning colors.',
        ['owner'],
      ),
    ],
  },
  {
    version: 'Pre-Launch · Settings & Navigation v24',
    title: 'Smoother Navigation, Clearer Settings',
    highlights: [
      note(
        'Navigation keeps the current page visible while a destination loads, then uses a short fade. Visited Dashboard, Records and Settings screens retain their content; Scanner stops its camera when you leave.',
        staff,
      ),
      note(
        'Settings has clearer tabs, a compact Owner badge, aligned request filters, current/requested profile comparisons and refined account controls. Confirmations close when you leave a review.',
        ['owner'],
      ),
      note(
        'Appearance groups the palette controls beside a live preview and preserves unsaved choices between tabs. Activity History and Feedback have clearer filters, cards, status controls and pagination; revealed sender identities hide when you leave Feedback.',
        ['owner'],
      ),
      note('Records sort headings are larger, and Rows per Page stays on one line.', staff),
    ],
  },
  {
    version: 'Pre-Launch · Records Details v23',
    title: 'Refined Filters and Sorting',
    highlights: [
      note(
        'The QR guide dims the surrounding camera view in web and kiosk modes, keeping the placement area clear.',
        staff,
      ),
      note(
        'View Records matches the Add Member card’s proportions, corner accent and hover feedback, and moves keyboard focus to the attendance ledger.',
        staff,
      ),
      note(
        'Records has more distinct colored totals, a clean search border and aligned filter columns. Desktop column headings offer direct sort choices, while narrow screens retain the compact sort menu.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Scanner & Records v22',
    title: 'Clearer Attendance Tools',
    highlights: [
      note(
        'Scanner starts with quick access to ongoing and upcoming services. Web and kiosk previews have a subtle QR placement guide while keeping the full camera scanning area.',
        staff,
      ),
      note(
        'Records has a smaller banner description, compact report totals, grouped community and service details, direct sort choices, clearer filters and CSV export controls. Attendance details open in a side panel.',
        staff,
      ),
      note(
        'Check-in removal uses a 1.3-second hold and offers Undo for 10 seconds. The one-time install-attendance-delete-undo.sql update is required; it restores the original record and historical details without replacing a newer check-in.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Scanner & Kiosk v21',
    title: 'Clearer Scanning',
    highlights: [
      note(
        'Scanner uses shorter instructions and one service chooser. The empty summary and extra setup cards are removed.',
        staff,
      ),
      note(
        'The camera fills its preview area without the square scan mask. Check-in feedback groups the status, member name and time without repeated success messages.',
        staff,
      ),
      note(
        'Kiosk fits the viewport without scrolling, with most space reserved for the camera. Service details, the check-in total, scan results and Exit Kiosk stay visible.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Check-In Workspace v20',
    title: 'A Smoother Welcome',
    highlights: [
      note(
        'Services uses a custom calendar and time picker, with quarter-hour minute choices, keyboard navigation and clear required-field feedback. Existing service times stay unchanged until edited.',
        staff,
      ),
      note(
        'Inline service updates keep the current list visible while refreshed data arrives. A failed background update leaves the last loaded rows available with a retry message.',
        staff,
      ),
      note(
        'Scanner brings the service total, camera, check-in confirmation and manual member search into a coordinated workspace. A searchable service side panel groups ongoing and upcoming gatherings, while successful, duplicate and unsuccessful check-ins receive distinct feedback.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Service Essentials v19',
    title: 'Gatherings, Within Reach',
    highlights: [
      note(
        'Tech Stack drops the redundant Clear Filters action. Technology details keep wheel and keyboard scrolling without flashing an inner scrollbar.',
      ),
      note(
        'Sunday marking is visible directly on service rows, with the same confirmed change and Undo flow. A shared Check-In Desk chooses an upcoming or ongoing service and opens its scanner, while swipe actions focus on Edit and Delete, Archive or Restore.',
        staff,
      ),
      note(
        'The service form shares the member editor’s balanced layout, private note surface, selection cards and consistent actions. Required schedule fields, saved values, Guest Preview choices and saving feedback remain intact.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Workspace Rhythm v18',
    title: 'More Character, a Clearer Flow',
    highlights: [
      note(
        'Tech Stack has a full-width header and a more colorful discovery area, with category cards, layered accents and gentle hover feedback.',
      ),
      note(
        'Member search text is vertically aligned, profile tools avoid an unnecessary scrollbar, and bulk selection has a compact toolbar with a clear selection summary. CSV notifications use shorter wording.',
        staff,
      ),
      note(
        'Services shares the directory’s search, labeled filters, removable filter chips and typography. Calendar cards, clearer schedule and location details, attendance totals and refined swipe actions make each gathering easier to scan.',
        staff,
      ),
      note(
        'Services regains the folded title treatment and a teal New Service card. Navigation reveals the selected page, forms and confirmations stay below fixed controls, and Cancel and Hold to Delete share consistent sizing.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Stack Details v17',
    title: 'Connected Tools, Clearer Examples',
    highlights: [
      note(
        'The Tech Stack header brings React, Supabase and Vercel together in a connected display, with named logo tiles, soft hover feedback and integrated tool and layer totals.',
      ),
      note(
        'In Practice examples use three connected step cards with Start, Process and Result labels. Category colors and a responsive layout keep the flow clear in desktop inspectors and phone detail sheets.',
      ),
    ],
  },
  {
    version: 'Pre-Launch · Tech Stack v16',
    title: 'The Story Behind the Stack',
    highlights: [
      note(
        'Tech Stack now shares LifeCity’s teal surfaces, gradient framing and cleaner typography. Search and five category filters help explore all 31 tools and capabilities.',
      ),
      note(
        'An interactive app-flow map connects each layer to its tools. Updated detail cards explain what each technology does, where LifeCity uses it and a three-step example flow.',
      ),
      note(
        'Desktop details remain within reach as the library scrolls. Phones retain nine tools per page and focused detail sheets, with keyboard navigation, focus restoration and motion preferences supported.',
      ),
    ],
  },
  {
    version: 'Pre-Launch · Workspace Details v15',
    title: 'Better Balance, Finer Details',
    highlights: [
      note(
        'The member form pairs contact details with the private reminder, then Churches with Ministries, removing the lower-left gap. Fields start directly with First Name and Last Name; directory headings and controls use consistent Title Case.',
        staff,
      ),
      note(
        'Directory status circles are smaller, with comfortable click targets. Member QR access uses a compact scan icon with gentle hover feedback.',
        staff,
      ),
      note(
        'App feedback opens in a matching side panel with clearer categories, fields and submission states. The identity option reads Submit Anonymously without extra subtext.',
      ),
    ],
  },
  {
    version: 'Pre-Launch · Member Workspace v14',
    title: 'A Clearer View of Every Member',
    highlights: [
      note(
        'The member form groups identity, contact and private notes alongside searchable church and ministry choices, with clearer selection feedback and optional inline creation.',
        staff,
      ),
      note(
        'Directory status uses a compact circular teal/rose checkbox with a rotating white check/X disk. Visible status words are removed; keyboard labels, saving feedback and Undo remain available.',
        staff,
      ),
      note(
        'Profiles and private notes open in coordinated side panels. Notes can be edited directly with confirmed note-only saves, while Overview and Attendance tabs keep profiles easier to scan. A focused member ID dialog brings QR and download together.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Directory Flow v13',
    title: 'Keep Your Tools in View',
    highlights: [
      note(
        'Ministry and church feedback keeps Import, Ministries and Churches within reach below the header, including blocked deletion, name validation, saved changes and Undo. An already-visible tools row stays steady.',
        staff,
      ),
      note(
        'Inline rename and delete confirmation receive keyboard focus without scrolling the page. Late feedback from a closed panel leaves your current view in place.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Member Shortcuts v12',
    title: 'Everyday Actions Within Reach',
    highlights: [
      note(
        'Star and unstar members directly beside their names. Existing private notes and QR/ID access stay inline, while profile and edit actions remain in the member tools menu.',
        staff,
      ),
      note(
        'Member status uses a teal check for Active and a dotted-circle X for Inactive. Both stay clickable, with the existing saving feedback and Undo behavior.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Member Directory v11',
    title: 'People First, Fewer Distractions',
    highlights: [
      note(
        'Member rows bring names, community and status together. Open a name for the profile, or use one action menu for QR, editing, stars and private notes.',
        staff,
      ),
      note(
        'Active and inactive status can be changed directly in the list. Confirmed changes offer a short Undo while the directory remains open; later edits and bulk changes supersede earlier status actions.',
        staff,
      ),
      note(
        'Search, labeled filters, removable filter chips and a direct four-choice sort menu make the current directory view clearer. CSV export uses a smaller panel with a visible matching-member scope.',
        staff,
      ),
      note(
        'Opening Import, Ministries or Churches keeps the three directory tool buttons visible below the header, making it easier to switch panels.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Directory Feedback v10',
    title: 'Clear Actions, More Character',
    highlights: [
      note(
        'Notifications use softer themed surfaces, a clearer action button and a slim inset countdown. Undo, swipe dismissal and pause-on-focus remain available.',
      ),
      note(
        'Import, Ministries and Churches share a close control attached to the top edge of Directory Tools. The import download action sits in the same tab.',
        staff,
      ),
      note(
        'Directory feedback has distinct success, warning and error colors with clear icons. Rename uses aligned Save and Cancel controls; delete confirmation names the entry and offers Keep or Delete.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Directory Details v9',
    title: 'A Little Lift, a Familiar Tab',
    highlights: [
      note(
        'Import Members, Ministries and Churches keep their distinct icons, with gentle button lift and icon scaling on hover or keyboard focus. The teal Add Member card gains matching feedback.',
        staff,
      ),
      note(
        'Directory Tools returns to its compact hanging tab, with Download Template and Close aligned alongside it. Motion preferences still apply.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Directory Tools v8',
    title: 'Clearer Tools, Reversible Directory Changes',
    highlights: [
      note(
        'Members has a solid teal Add Member action and distinct, steady Import, Ministry and Church icons. Import places Download Template and Close together in the shared toolbar.',
        staff,
      ),
      note(
        'Ministries and churches use swipe rows for Rename and Delete, with inline add/rename forms and clear messages for blocked changes or errors.',
        staff,
      ),
      note(
        'Successful ministry and church deletions offer Undo for 10 seconds, restoring the original record without overwriting a conflicting ID or name.',
        staff,
      ),
      note(
        'Ministry deletion requires the included one-time Supabase update, install-directory-delete-undo.sql. Until installed, the app keeps the entry and shows setup guidance.',
        staff,
      ),
      note(
        'Dashboard calendars keep their red pushpins. Refresh uses a stable-width label and smooth loading feedback, without a duplicate Updating badge.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Dashboard & Flow v7',
    title: 'Clearer Gatherings, Quicker Navigation',
    highlights: [
      note(
        'What’s New has its soft green gradient again. Section entrances use a brief fade that keeps content steady and respects motion preferences.',
      ),
      note(
        'Desktop navigation regains spring hover feedback, while Dashboard period and refresh controls return to teal and lavender.',
        staff,
      ),
      note(
        'Dashboard gatherings use calendar-style dates, separate schedule and venue details, softer service notes and clearer attendance progress.',
        staff,
      ),
      note(
        'Common staff screens warm in the background when the connection allows. Opening a screen that is still loading keeps the current view visible.',
        staff,
      ),
      note(
        'Recent Dashboard and Members snapshots can appear immediately on return while live data reloads. These snapshots stay only in the signed-in workspace’s memory.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Layout & Entrances v6',
    title: 'A Balanced Header, a Gentler Flow',
    highlights: [
      note(
        'The desktop header has balanced spacing between the brand, navigation and account controls.',
        staff,
      ),
      note(
        'Sign-in, guest, member and administration pages use subtle AnimatedContent entrances as sections become visible.',
      ),
      note(
        'Navigation responds immediately, panels enter gently and close without waiting. Animation and reduced-motion settings still apply, while camera and QR areas keep their usable layout.',
      ),
    ],
  },
  {
    version: 'Pre-Launch · Controls & Counters v5',
    title: 'Smoother Choices and Live Totals',
    highlights: [
      note(
        'GlideSelect brings themed dropdowns to periods, filters and other selection fields, with keyboard controls and search for longer option lists.',
        signedIn,
      ),
      note(
        'Staff navigation and Dashboard detail switches now use a moving RubberSegment indicator.',
        staff,
      ),
      note(
        'The four Dashboard metrics count smoothly to their real totals. Filter updates keep the current snapshot visible, and motion-off shows final values immediately.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Color & Motion v4',
    title: 'LifeCity in Full Color',
    highlights: [
      note(
        'Moving teal, lavender and gold borders return to page headers, with a directional glow near the cursor.',
      ),
      note(
        'Dashboard metrics have their individual colors again. Magic Bento adds a cursor spotlight, neighboring edge glow, subtle particles and click waves around the real attendance data.',
        staff,
      ),
      note(
        'The comfortable page width, Inter typography and cleaner controls remain. Effects pause offscreen and respect animation and reduced-motion settings.',
      ),
    ],
  },
  {
    version: 'Pre-Launch · Interface Refresh v3',
    title: 'A Lighter LifeCity',
    highlights: [
      note(
        'Desktop pages now have a comfortable centered width, with smaller headings and calmer cards.',
      ),
      note(
        'Self-hosted Inter typography, softer borders, consistent form fields and clearer focus states bring the workspaces together.',
      ),
      note(
        'Page changes respond immediately, with gentle content entrances and smooth control feedback. Decorative loops and click ripples have been removed; motion preferences still apply.',
      ),
    ],
  },
  {
    version: 'Pre-Launch · Desktop Actions v2',
    title: 'More Room, Clearer Feedback',
    highlights: [
      note(
        'Desktop pages use more of the screen, with aligned content and navigation and smaller side margins.',
      ),
      note(
        'Action notifications now appear as dismissible swipe toasts. Hover or focus a notification to pause its countdown.',
      ),
      note(
        'Services has separated swipe controls and a quiet instruction at the right of its list header. Sunday marking, archive, restore and deletion offer Undo.',
        staff,
      ),
      note(
        'The final service deletion button requires a short hold. Services with attendance keep their history through Archive.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Services Swipe Actions',
    title: 'Cleaner Service Rows',
    highlights: [
      note(
        'Swipe or drag a service left to reveal Scanner, Sunday marking, Edit, and Delete, Archive or Restore. A small actions button offers the same controls.',
        staff,
      ),
      note(
        'A quiet hint explains the gesture. Rows fit phones, support keyboard controls, and keep confirmation steps for removing or archiving a service.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Mobile Services Polish',
    title: 'A Tighter Service Workspace',
    highlights: [
      note(
        'Services uses a thin gradient header, compact action rows, quieter search, and aligned page-size controls.',
        staff,
      ),
      note(
        'CSV choices use compact mobile layouts. Event forms have smaller helper text and keyboard-aware scrolling.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Phone Scanner Refinements',
    title: 'Easier Manual Check-In',
    highlights: [
      note(
        'Manual check-in stays hidden until a member is selected, with softer search styling and keyboard-aware scrolling.',
        staff,
      ),
      note('Mobile kiosk controls align consistently across the camera toolbar.', staff),
      note(
        'Phone viewport recovery now keeps the corrected width after sign-in instead of resetting it immediately.',
      ),
      note('The mobile welcome uses richer color and decorative rings, with less empty space.', [
        'guest',
      ]),
    ],
  },
  {
    version: 'Pre-Launch · Mobile Motion',
    title: 'Gentle Motion, Quieter Details',
    highlights: [
      note(
        'Mobile screens, cards, dialogs, and expandable controls have coordinated entrance effects that respect motion preferences.',
      ),
      note('The welcome header includes drifting decorative accents.', ['guest']),
      note(
        'Scanner and dashboard gradient borders are thinner, and service selection sheets animate into view.',
        staff,
      ),
      note(
        'Feedback placeholders are shorter and smaller, with clearer identity privacy wording.',
        signedIn,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Mobile Visual Balance',
    title: 'Color Where It Counts',
    highlights: [
      note(
        'The mobile welcome restores its colorful introduction while keeping sign-in copy short.',
        ['guest'],
      ),
      note(
        'The mobile dashboard has a gradient header border and an integrated period filter bar.',
        staff,
      ),
      note('Shared mobile footers use smaller, quieter text while keeping Tech Stack easy to tap.'),
    ],
  },
  {
    version: 'Pre-Launch · Simpler Mobile Welcome',
    title: 'Less Scrolling, Clearer Choices',
    highlights: [
      note(
        'Mobile welcome focuses on sign-in and guest access, with first-time account help available on demand.',
        ['guest'],
      ),
      note(
        'Shorter benefit labels align consistently, and guest service cards show the full schedule and venue in a tighter layout.',
        ['guest'],
      ),
    ],
  },
  {
    version: 'Pre-Launch · Guest Layout Polish',
    title: 'A More Balanced Guest View',
    highlights: [
      note(
        'The mobile service refresh button is aligned to the right, opposite the service count.',
        ['guest'],
      ),
      note('Member ID, attendance, and profile benefits now use three equally sized tiles.', [
        'guest',
      ]),
    ],
  },
  {
    version: 'Pre-Launch · Mobile Workspaces',
    title: 'More Room for What Matters',
    highlights: [
      note(
        'Members and Records use tighter mobile rows, compact filters, and option sheets with search for longer lists.',
        staff,
      ),
      note(
        'My Member Space puts attendance QR access first, with expandable profile details, feedback tickets, and attendance history.',
        signedIn,
      ),
      note(
        'Mobile Settings uses compact account actions, smaller appearance controls, and an expandable live preview.',
        ['owner'],
      ),
      note(
        'The app suggestion form has a compact mobile sheet with smaller category buttons and all existing submission options.',
        signedIn,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Mobile Services',
    title: 'Service Management, Made Compact',
    highlights: [
      note(
        'Mobile Services now uses compact rows with scanner shortcuts and expandable notes and management actions.',
        staff,
      ),
      note(
        'Mobile filters and page-size controls use custom pickers. Create and edit forms keep all fields in a tighter layout.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Phone Sign-In & Camera Controls',
    title: 'Simpler Camera Controls',
    highlights: [
      note(
        'Removed flashlight controls and the camera dropdown. Use the switch-camera icon to change cameras.',
        staff,
      ),
      note(
        'Added a phone viewport recovery check when returning from Google sign-in or resuming the app.',
      ),
    ],
  },
  {
    version: 'Pre-Launch · Camera & Startup Fixes',
    title: 'More Reliable Camera Controls',
    highlights: [
      note(
        'Flashlight control rechecks camera support after startup, verifies reported lamp settings, and offers camera selection for phones with multiple lenses.',
        staff,
      ),
      note(
        'Mobile presentation styles now load with the app’s initial styles instead of depending on page loading order.',
      ),
    ],
  },
  {
    version: 'Pre-Launch · Mobile Scanner',
    title: 'A Smaller Check-In Station',
    highlights: [
      note(
        'The mobile scanner now uses a compact service card, camera controls, and camera frame with check-in feedback directly below.',
        staff,
      ),
      note(
        'Open manual member search only when needed, and choose services from a mobile bottom sheet.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Mobile Tech Stack',
    title: 'The Tech Stack, Pocket-Sized',
    highlights: [
      note('Browse nine technology tiles at a time on phones, with simple page controls.'),
      note(
        'Tap any tool for its full explanation and usage diagram in a compact detail sheet. Desktop keeps its side-by-side layout.',
      ),
    ],
  },
  {
    version: 'Pre-Launch · Mobile Dashboard Polish',
    title: 'Small Details, Smoother Navigation',
    highlights: [
      note(
        'The mobile dashboard has a softly animated header and a custom period picker that matches the app.',
        staff,
      ),
      note(
        'The mobile dashboard footer now sits at the bottom of short pages without duplicate navigation spacing.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Mobile Dashboard Redesign',
    title: 'Your Dashboard, Built for Phones',
    highlights: [
      note(
        'Use quick Scanner and Records actions, compact totals, and one switchable panel for upcoming events, the latest event, and recent activity.',
        staff,
      ),
      note(
        'Expand service notes, additional check-ins, and What’s New only when needed. Desktop dashboard layouts stay the same.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Mobile Dashboard',
    title: 'A More Compact Overview',
    highlights: [
      note(
        'Mobile dashboard totals now sit beside their labels in compact rows, with readable event details and bottom navigation clearance.',
        staff,
      ),
    ],
  },
  {
    version: 'Pre-Launch · Landing Spacing Polish',
    title: 'A Little More Breathing Room',
    highlights: [
      note('Added a little more space between the desktop welcome card, logo, and footer.', [
        'guest',
      ]),
    ],
  },
  {
    version: 'Pre-Launch · Welcome Illustration',
    title: 'Room for Every Card',
    highlights: [
      note(
        'The welcome illustration now gives its floating cards separate spaces so the main card’s text stays readable.',
        ['guest'],
      ),
    ],
  },
  {
    version: 'Pre-Launch · Welcome Spacing',
    title: 'More Room to Welcome You',
    highlights: [
      note(
        'The desktop welcome panel now fills the available height between the brand and footer, with more breathing room for its content.',
        ['guest'],
      ),
    ],
  },
  {
    version: 'Pre-Launch · Welcome Layout',
    title: 'A More Compact Welcome',
    highlights: [
      note(
        'The welcome page uses height-aware spacing to keep sign-in, help text, and the footer together on standard desktop screens.',
        ['guest'],
      ),
    ],
  },
  {
    version: 'Pre-Launch · Tech Stack Redesign',
    title: 'A New View of the Tech Stack',
    highlights: [
      note(
        'Explore a compact technology index with a dedicated panel for each tool’s explanation and usage diagram.',
      ),
      note(
        'A fresh ivory and dark teal layout replaces the expanding card grid, with larger logos and subtle motion.',
      ),
    ],
  },
  {
    version: 'Pre-Launch · Interactive Tech Stack',
    title: 'See How Each Tool Helps',
    highlights: [
      note(
        'Explore colorful, compact technology cards with expandable explanations and simple usage diagrams.',
      ),
      note('The Tech Stack page now shows all tools directly, without search or category filters.'),
    ],
  },
  {
    version: 'Pre-Launch · Compact Tech Stack',
    title: 'Tech Stack at a Glance',
    highlights: [
      note(
        'Browse technology logos and short descriptions in compact groups organized by purpose.',
      ),
      note(
        'The footer Tech Stack link now uses a subtle underline animation with consistent text sizing.',
      ),
    ],
  },
  {
    version: 'Pre-Launch · Tech Stack Refinement',
    title: 'A Clearer Look Behind the App',
    highlights: [
      note('The Tech Stack page now has a more focused layout with recognizable technology logos.'),
      note(
        'Refined the footer Tech Stack hover and removed the page’s decorative entrance and floating effects.',
      ),
    ],
  },
  {
    version: 'Pre-Launch · Web Wrap-Up',
    title: 'Meet the Tools Behind LifeCity',
    highlights: [
      note(
        'Explore the new Tech Stack page from the footer, with searchable categories and optional animated graphics.',
      ),
      note(
        'The public repository now includes a detailed README and a source-based technology and backend inventory.',
      ),
    ],
  },
  {
    version: 'Pre-Launch · Updates That Fit Your Space',
    title: 'Made for Your View',
    highlights: [
      note('What’s New and Version History now show updates relevant to your access.'),
      note('A friendlier feedback confirmation takes you back to exploring the app.', signedIn),
      note(
        'Your feedback tickets use balanced cards and first, previous, next, and last page controls.',
        signedIn,
      ),
      note(
        'Member linking and account actions share one aligned row. Link reviews have clearer approval and decline controls.',
        ['owner'],
      ),
    ],
  },
  {
    version: 'Pre-Launch · Community Experience',
    title: 'A Warmer Welcome, a Calmer Workspace',
    highlights: [
      note(
        'Explore a refreshed guest page with illustrated headers, compact gathering cards, and optional playful motion.',
        ['guest'],
      ),
      note(
        'Enjoy a cleaner member space with balanced information and church and ministry selections.',
        signedIn,
      ),
      note(
        'Edit profile details without stretching the QR card, and expand request history only when needed.',
        signedIn,
      ),
      note('Find quieter account actions.', ['owner']),
      note('Feedback confirmations and sign-in notices have a softer, smaller layout.'),
      note('Open the scanner from a compact camera shortcut in Services.', staff),
    ],
  },
  {
    version: 'Pre-Launch · Feedback & Account Polish',
    title: 'Clearer Updates, Thoughtful Next Steps',
    highlights: [
      note(
        'Completed feedback means an improvement has been implemented. Considered ideas stay saved for possible future work.',
        signedIn,
      ),
      note(
        'Feedback confirmations point you to What’s New for completed requests and app improvements.',
        signedIn,
      ),
      note('Account actions have distinct controls for permissions, access, and member links.', [
        'owner',
      ]),
      note('Reduced the extra spacing between What’s New and the footer.'),
    ],
  },
  {
    version: 'Pre-Launch · Web Polish',
    title: 'Your Feedback Has a Home',
    highlights: [
      note('Send app feedback from a compact form with clearer categories.', signedIn),
      note(
        'Follow your feedback tickets from your member page. New status updates stay highlighted until you read them.',
        signedIn,
      ),
      note('See what changed in LifeCity Attendance from your space.'),
    ],
  },
  {
    version: 'Earlier Development · Appearance & Feedback',
    title: 'A More Personal LifeCity Attendance',
    highlights: [
      note('Customize app colors with a live preview and clearer color controls.', ['owner']),
      note('Use a quieter feedback shortcut and find the shared footer across the app.'),
      note('Enjoy refined layouts, readable colors, and optional decorative animations.'),
    ],
  },
  {
    version: 'Earlier Development · Check-In & Reporting',
    title: 'Smoother Check-Ins and Reports',
    highlights: [
      note('Use a full-screen kiosk with a large camera view and clear check-in feedback.', staff),
      note(
        'Export member lists, services, and attendance with quick or detailed CSV options.',
        staff,
      ),
      note('Find members and services with refined search, filters, and pagination.', staff),
    ],
  },
  {
    version: 'Earlier Development · Foundations',
    title: 'The Essentials, Together',
    highlights: [
      note('Register members and generate personal attendance QR codes.', staff),
      note('Manage services,ç record check-ins, and review attendance history.', staff),
      note('Open a member space for profile details and QR access.', signedIn),
      note('Browse public gatherings and service details without signing in.', ['guest']),
    ],
  },
];
export function getReleaseNotes(audience: ReleaseAudience) {
  return releaseNotes
    .map((entry) => ({
      ...entry,
      highlights: entry.highlights
        .filter((item) => item.audiences.includes(audience))
        .map((item) => item.text),
    }))
    .filter((entry) => entry.highlights.length > 0);
}
