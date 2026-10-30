import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GENERATED_DIR = path.join(REPO_ROOT, 'demo-data', 'generated');
const LABEL = 'DEMO DATA - fictional presentation record.';
const GIVEN_NAMES = [
  'Maria Clara',
  'Jose Miguel',
  'Angela Mae',
  'Juan Paolo',
  'Andrea Nicole',
  'Mark Anthony',
  'Camille',
  'Gabriel',
  'Patricia Anne',
  'Rafael',
  'Bianca',
  'Joshua',
  'Isabella',
  'Carlo',
  'Sofia',
  'Lorenzo',
  'Danielle',
  'Nathaniel',
  'Mikaela',
  'Francis',
  'Jasmine',
  'Adrian',
  'Kristine',
  'Daniel',
  'Alyssa',
  'Christian',
  'Beatrice',
  'Vincent',
  'Chloe',
  'Dominic',
  'Eliza',
  'Emmanuel',
  'Francesca',
  'Jericho',
  'Grace',
  'Kenneth',
  'Hannah',
  'Luis',
  'Irene',
  'Matthew',
  'Julia',
  'Nico',
  'Katrina',
  'Oliver',
  'Lara',
  'Patrick',
  'Mariel',
  'Quentin',
  'Noelle',
  'Renzo',
  'Olivia',
  'Samuel',
  'Pauline',
  'Timothy',
  'Queenie',
  'Victor',
  'Rachelle',
  'Warren',
  'Samantha',
  'Xavier',
  'Trisha',
  'Yohan',
  'Veronica',
  'Zachary',
  'Ysabel',
  'Albert',
  'Angelica',
  'Benedict',
  'Cassandra',
  'Diego',
  'Eunice',
  'Felix',
  'Giselle',
  'Harvey',
  'Ingrid',
  'Joaquin',
  'Leanne',
  'Marco',
  'Nathalie',
  'Oscar',
];
const SURNAMES = [
  'Dela Cruz',
  'Santos',
  'Reyes',
  'Garcia',
  'Ramos',
  'Mendoza',
  'Torres',
  'Flores',
  'Villanueva',
  'Gonzales',
  'Rivera',
  'Castro',
  'Bautista',
  'Aquino',
  'Navarro',
  'Mercado',
  'Salazar',
  'Valdez',
  'Cruz',
  'Santiago',
  'Domingo',
  'Fernandez',
  'Morales',
  'Lim',
  'Tan',
  'Uy',
  'Chua',
  'Go',
  'Sy',
  'Ang',
  'Co',
  'Ong',
  'Soriano',
  'Pascual',
  'Manalo',
  'Tolentino',
  'De Leon',
  'Alvarez',
  'Francisco',
  'Del Rosario',
  'Panganiban',
  'Padilla',
  'Rosales',
  'Enriquez',
  'Abad',
  'Aguilar',
  'Alcantara',
  'Arellano',
  'Avila',
  'Bernardo',
  'Borja',
  'Cabrera',
  'Castañeda',
  'David',
  'De Guzman',
  'Estrella',
  'Fabian',
  'Galang',
  'Hernandez',
  'Ignacio',
  'Jacinto',
  'Lacsamana',
  'Magbanua',
  'Natividad',
  'Ocampo',
  'Palma',
  'Quijano',
  'Regalado',
  'Samson',
  'Trinidad',
  'Umali',
  'Velasco',
  'Yap',
  'Zamora',
  'Abella',
  'Buenaventura',
  'Cabral',
  'Dizon',
  'Escobar',
  'Fajardo',
];
const CHURCHES = [
  'LifeCity - Main',
  'LifeCity - North',
  'LifeCity - South',
  'LifeCity - East',
  'LifeCity - West',
  'LifeCity - Riverside',
  'LifeCity - Hillside',
  'LifeCity - Lakeside',
];
const MINISTRIES = [
  'Worship',
  'Media',
  'Youth',
  'Kids',
  'Hospitality',
  'Outreach',
  'Prayer',
  'Discipleship',
  'Young Adults',
  'Women',
  'Men',
  'Care and Counseling',
  'Production',
  'Missions',
];

function stableId(label) {
  const bytes = createHash('sha1')
    .update('LifeCity-demo-v1:' + label)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function fraction(label) {
  return createHash('sha256').update(label).digest().readUInt32BE(0) / 0x1_0000_0000;
}

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('presentationDate must be a real date in YYYY-MM-DD format.');
  }
  const parsed = new Date(`${value}T00:00:00+08:00`);
  if (
    !Number.isFinite(parsed.valueOf()) ||
    new Date(parsed.valueOf() + 8 * HOUR).toISOString().slice(0, 10) !== value
  ) {
    throw new Error('presentationDate must be a real date in YYYY-MM-DD format.');
  }
  return parsed.valueOf();
}

function timeMinutes(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error('presentationTime must use HH:MM in Manila time.');
  }
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function parseAsOf(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    throw new Error(
      'asOf must be an ISO timestamp with seconds and an explicit timezone (Z or +08:00).',
    );
  }
  parseDate(value.slice(0, 10));
  const stamp = Date.parse(value);
  if (
    !Number.isFinite(stamp) ||
    Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 ||
    Number(value.slice(17, 19)) > 59
  ) {
    throw new Error('asOf must be a valid ISO timestamp.');
  }
  return stamp;
}

function iso(stamp) {
  return new Date(stamp).toISOString();
}
function manila(stamp) {
  return new Date(stamp + 8 * HOUR).toISOString().slice(0, 16).replace('T', ' ') + ' +08:00';
}

export function eventState(event, asOf) {
  if (event.archived_at) return 'archived';
  const start = Date.parse(event.starts_at);
  if (asOf < start) return 'upcoming';

  return asOf >= start + 3 * HOUR ? 'completed' : 'in-progress';
}

export function buildDemoDataset({
  presentationDate = '2026-11-01',
  presentationTime = '12:30',
  memberCount = 600,
  asOf = new Date().toISOString(),
} = {}) {
  const presentation = parseDate(presentationDate);
  const presentationMinute = timeMinutes(presentationTime);
  const asOfStamp = parseAsOf(asOf);
  if (new Date(presentation + 8 * HOUR).getUTCDay() !== 0)
    throw new Error('presentationDate must be a Sunday.');
  if (!Number.isSafeInteger(memberCount) || memberCount < 20 || memberCount > 5000) {
    throw new Error('memberCount must be an integer from 20 through 5000.');
  }
  if (asOfStamp < presentation - 7 * DAY) {
    throw new Error('asOf must be on or after the Sunday before the presentation date.');
  }
  const branches = CHURCHES.map((name, i) => ({ id: stableId(`branch:${i}`), name }));
  const ministries = MINISTRIES.map((name, i) => ({ id: stableId(`ministry:${i}`), name }));
  const activeCount = Math.floor(memberCount * 0.9);
  const members = [];
  const member_branches = [];
  const member_ministries = [];
  for (let i = 0; i < memberCount; i++) {
    const first_name = GIVEN_NAMES[i % GIVEN_NAMES.length];
    const last_name =
      SURNAMES[
        (Math.floor(i / GIVEN_NAMES.length) + 17 * (i % GIVEN_NAMES.length)) % SURNAMES.length
      ];
    const member_number = `DEMO-${String(i + 1).padStart(4, '0')}`;
    const id = stableId(`member:${i}`);

    const age =
      i > 3 && i % 17 === 0
        ? 8 + Math.floor(fraction(`new:${i}`) * 55)
        : 130 + Math.floor(fraction(`age:${i}`) * 300);
    const created = Math.min(presentation - age * DAY + 8 * HOUR, asOfStamp - HOUR);
    members.push({
      id,
      member_number,
      first_name,
      last_name,
      email: `lifecity.demo.${String(i + 1).padStart(4, '0')}@example.com`,
      mobile: null,
      member_group: null,
      status: i < activeCount ? 'active' : 'inactive',
      qr_token: randomUUID(),
      is_starred: i < 3 || i % 11 === 0,
      admin_note: `${LABEL} ${i >= activeCount ? 'Inactive member for status filters.' : i % 17 === 0 ? 'Recently joined; welcome-team follow-up example.' : i % 5 === 0 ? 'Volunteer serving across church teams.' : 'Member directory and attendance demonstration.'}`,
      created_at: iso(created),
      updated_at: iso(created),
    });
    const primary = i % branches.length;
    member_branches.push({ member_id: id, branch_id: branches[primary].id });
    if (i % 9 === 0)
      member_branches.push({
        member_id: id,
        branch_id: branches[(primary + 3) % branches.length].id,
      });
    if (i % 7 !== 0) {
      const ministry = (i + Math.floor(i / ministries.length)) % ministries.length;
      member_ministries.push({ member_id: id, ministry_id: ministries[ministry].id });
      if (i % 4 === 0)
        member_ministries.push({
          member_id: id,
          ministry_id: ministries[(ministry + 5) % ministries.length].id,
        });
      if (i % 13 === 0)
        member_ministries.push({
          member_id: id,
          ministry_id: ministries[(ministry + 9) % ministries.length].id,
        });
    }
  }

  const events = [];
  const eventKinds = new Map();
  const weekly = [
    {
      kind: 'celebration',
      title: 'Sunday Celebration',
      day: 0,
      hour: 16,
      minute: 0,
      sunday: true,
      public: true,
      place: 'LifeCity - Main Worship Hall',
      rate: 0.75,
    },
    {
      kind: 'prayer',
      title: 'Midweek Prayer Gathering',
      day: 3,
      hour: 18,
      minute: 30,
      sunday: false,
      public: true,
      place: 'LifeCity - Riverside Prayer Hall',
      rate: 0.38,
    },
    {
      kind: 'youth',
      title: 'Youth Night',
      day: 5,
      hour: 18,
      minute: 0,
      sunday: false,
      public: true,
      place: 'LifeCity - North Youth Center',
      rate: 0.28,
    },
    {
      kind: 'outreach',
      title: 'Community Care Saturday',
      day: 6,
      hour: 9,
      minute: 0,
      sunday: false,
      public: true,
      place: 'LifeCity - South Community Hall',
      rate: 0.32,
    },
    {
      kind: 'training',
      title: 'Volunteer Team Workshop',
      day: 6,
      hour: 13,
      minute: 0,
      sunday: false,
      public: false,
      place: 'LifeCity - Main Training Room',
      rate: 0.3,
    },
  ];
  for (let week = -12; week <= 3; week++) {
    for (const template of weekly) {
      const start =
        presentation +
        (week * 7 + template.day) * DAY +
        template.hour * HOUR +
        template.minute * 60_000;
      const end = start + 3 * HOUR;
      const archived = week <= -10 && end < asOfStamp;
      const event = {
        id: stableId(`event:${week}:${template.kind}`),
        name: `${template.title} - ${new Date(start + 8 * HOUR).toISOString().slice(0, 10)}`,
        starts_at: iso(start),
        ends_at: iso(end),
        location: template.place,
        is_sunday_service: template.sunday,
        is_public: template.public,
        archived_at: archived ? iso(Math.min(end + DAY, asOfStamp)) : null,
        created_at: iso(Math.min(start - 21 * DAY, asOfStamp - HOUR)),
        admin_note: `${LABEL} ${template.kind === 'training' ? 'Private team development schedule.' : 'Public community gathering for the presentation.'}`,
      };
      events.push(event);
      eventKinds.set(event.id, { ...template, week });
    }
  }
  const morningStart = presentation + 9 * HOUR;
  const morningEvent = {
    id: stableId('event:presentation-morning'),
    name: `Sunday Morning Celebration - ${presentationDate}`,
    starts_at: iso(morningStart),
    ends_at: iso(morningStart + 3 * HOUR),
    location: 'LifeCity - Main Worship Hall',
    is_sunday_service: true,
    is_public: true,
    archived_at: null,
    created_at: iso(Math.min(presentation - 21 * DAY, asOfStamp - HOUR)),
    admin_note: `${LABEL} Morning Sunday service; completed by the afternoon presentation. Attendance is generated only after its actual check-in time.`,
  };
  events.push(morningEvent);
  eventKinds.set(morningEvent.id, { kind: 'celebration', rate: 0.75, week: 0 });
  const liveStart = presentation + presentationMinute * 60_000;
  const liveEvent = {
    id: stableId('event:live-presentation'),
    name: 'Live Presentation Check-In',
    starts_at: iso(liveStart),
    ends_at: iso(liveStart + 3 * HOUR),
    location: 'LifeCity - Main Presentation Hall',
    is_sunday_service: true,
    is_public: true,
    archived_at: null,
    created_at: iso(Math.min(presentation - 14 * DAY, asOfStamp - HOUR)),
    admin_note: `${LABEL} Scanner demonstration. Open for three hours from the configured presentation time. No attendance is preloaded for this event.`,
  };
  events.push(liveEvent);
  events.sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.name.localeCompare(b.name));

  const attendance = [];
  for (const event of events) {
    const template = eventKinds.get(event.id);
    if (!template || Date.parse(event.starts_at) > asOfStamp) continue;
    const start = Date.parse(event.starts_at);
    const cutoff = Math.min(Date.parse(event.ends_at) - 1, asOfStamp);
    for (let i = 0; i < members.length; i++) {
      const member = members[i];
      if (Date.parse(member.created_at) > cutoff) continue;

      if (member.status === 'inactive' && template.week > -5) continue;
      const trend = 0.86 + ((template.week + 12) / 15) * 0.2;
      const loyalty = 0.77 + fraction(`loyalty:${i}`) * 0.46;
      const rate = template.rate * trend * loyalty * (member.status === 'inactive' ? 0.55 : 1);
      if (fraction(`attend:${event.id}:${member.id}`) >= rate) continue;
      const checkIn = Math.max(
        start + Math.floor(fraction(`time:${event.id}:${member.id}`) * 65 * 60_000),
        Date.parse(member.created_at),
      );
      if (checkIn > cutoff) continue;
      const corrected = fraction(`corrected:${event.id}:${member.id}`) < 0.018;
      attendance.push({
        id: stableId(`attendance:${event.id}:${member.id}`),
        member_id: member.id,
        event_id: event.id,
        checked_in_at: iso(checkIn),
        status: corrected ? 'corrected' : 'present',
        scanned_by: null,
        notes: corrected ? `${LABEL} Corrected check-in example for report filters.` : LABEL,
        created_at: iso(checkIn),
      });
    }
  }
  const memberLabel = (member) => ({
    member_number: member.member_number,
    member_id: member.id,
    name: `${member.first_name} ${member.last_name}`,
  });
  const historyMember =
    members.find((member) =>
      attendance.some((row) => row.member_id === member.id && row.status === 'corrected'),
    ) ?? members[2];
  const historyRow = attendance.find(
    (row) => row.member_id === historyMember.id && row.status === 'corrected',
  );
  const historyEvent = events.find((event) => event.id === historyRow?.event_id);
  const scenarios = {
    live_event: {
      event_id: liveEvent.id,
      name: liveEvent.name,
      starts_at: liveEvent.starts_at,
      ends_at: liveEvent.ends_at,
      manila_time: `${manila(liveStart)} to ${manila(liveStart + 3 * HOUR)}`,
      requires_time_confirmation: true,
    },
    successful_scan: {
      ...memberLabel(members[0]),
      instruction:
        'During the live event, open this member QR in Members and scan it once. This member has no preloaded attendance in the live event.',
    },
    second_successful_scan: {
      ...memberLabel(members[1]),
      instruction: 'Use this second member to show another successful live check-in.',
    },
    duplicate_scan: {
      ...memberLabel(members[0]),
      instruction:
        'After the successful first scan, scan the same QR again to demonstrate duplicate detection. No future check-in has been fabricated.',
    },
    inactive_member: {
      ...memberLabel(members.at(-1)),
      instruction:
        'Show the inactive badge and directory filter. During the live event, try this QR to demonstrate the deployed inactive-member scanner policy; confirm its actual behavior in rehearsal.',
    },
    member_history: {
      ...memberLabel(historyMember),
      event_id: historyEvent?.id ?? null,
      event_name: historyEvent?.name ?? null,
      instruction:
        'Open attendance history and inspect a corrected historical check-in, then compare the report filters.',
    },
    multi_church_member: {
      ...memberLabel(members[0]),
      instruction: 'Open details to show more than one church assignment and the starred badge.',
    },
    multi_ministry_member: {
      ...memberLabel(members[4]),
      instruction: 'Open details to show several ministry assignments.',
    },
    no_ministry_member: {
      ...memberLabel(members[7]),
      instruction: 'Show that a member can belong to a church without a ministry assignment.',
    },
    public_schedule: {
      instruction:
        'Open guest preview to show upcoming public gatherings and pagination; private Volunteer Team Workshop events remain in the administrator schedule.',
    },
  };
  const stateCounts = Object.fromEntries(
    ['completed', 'archived', 'upcoming', 'in-progress'].map((state) => [
      state,
      events.filter((event) => eventState(event, asOfStamp) === state).length,
    ]),
  );
  const metadata = {
    version: 'LC-DEMO-v1',
    fictional: true,
    timezone: 'Asia/Manila',
    presentation_date: presentationDate,
    presentation_time: presentationTime,
    as_of: iso(asOfStamp),
    qr_tokens:
      'Fresh cryptographically random tokens on every build; member IDs and assignments remain stable. Keep generated artifacts private because QR values permit demo check-ins.',
    counts: {
      branches: branches.length,
      ministries: ministries.length,
      members: members.length,
      active_members: activeCount,
      inactive_members: memberCount - activeCount,
      starred_members: members.filter((member) => member.is_starred).length,
      member_branches: member_branches.length,
      member_ministries: member_ministries.length,
      events: events.length,
      attendance: attendance.length,
      corrected_attendance: attendance.filter((row) => row.status === 'corrected').length,
      public_upcoming_events: events.filter(
        (event) => event.is_public && eventState(event, asOfStamp) === 'upcoming',
      ).length,
      event_states: stateCounts,
    },
    notes: [
      'Entirely fictional fixtures. Natural-looking names can coincidentally match real people; no real contacts are used.',
      "Emails use the reserved example.com domain to satisfy this application's .com-only validator. All mobile numbers are null.",
      'No authentication users or credentials are created. All attendance.scanned_by values are null.',
      'No future attendance is generated. The live presentation event always starts with zero attendance, even when rebuilding after its opening time.',
      'Three-hour windows match the current service/scanner UI. Confirm presentationTime before preparing the final seed.',
      'member-import.csv uses the current UI import columns only. It cannot preserve demo member numbers, IDs, QR tokens, inactive status, starred flags or attendance. Do not import it on top of the full seeded dataset.',
      'Attendance contains base columns only. Database triggers/report_snapshot and the deployed schema must be reviewed before seeding.',
      'This generator writes local files only. It does not delete, connect to or modify any Supabase project.',
    ],
  };
  return {
    metadata,
    branches,
    ministries,
    members,
    member_branches,
    member_ministries,
    events,
    attendance,
    scenarios,
  };
}

export function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

function csv(rows) {
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function buildDemoFiles(dataset) {
  const branchNames = new Map(dataset.branches.map((row) => [row.id, row.name]));
  const ministryNames = new Map(dataset.ministries.map((row) => [row.id, row.name]));
  const assignments = (rows, key, names) => {
    const map = new Map();
    for (const row of rows) {
      if (!map.has(row.member_id)) map.set(row.member_id, []);
      map.get(row.member_id).push(names.get(row[key]));
    }
    return map;
  };
  const churches = assignments(dataset.member_branches, 'branch_id', branchNames);
  const ministries = assignments(dataset.member_ministries, 'ministry_id', ministryNames);
  const asOf = Date.parse(dataset.metadata.as_of);
  return {
    'dataset.json': JSON.stringify(dataset, null, 2) + '\n',
    'member-import.csv': csv([
      ['first_name', 'last_name', 'email', 'mobile', 'churches', 'ministries', 'admin_note'],
      ...dataset.members.map((member) => [
        member.first_name,
        member.last_name,
        member.email,
        member.mobile,
        churches.get(member.id)?.join(' | '),
        ministries.get(member.id)?.join(' | '),
        member.admin_note,
      ]),
    ]),
    'schedule.csv': csv([
      [
        'Event',
        'Starts (Manila)',
        'Ends (Manila)',
        'State',
        'Public',
        'Sunday Service',
        'Location',
        'Event ID',
      ],
      ...dataset.events.map((event) => [
        event.name,
        manila(Date.parse(event.starts_at)),
        manila(Date.parse(event.ends_at)),
        eventState(event, asOf),
        event.is_public ? 'Yes' : 'No',
        event.is_sunday_service ? 'Yes' : 'No',
        event.location,
        event.id,
      ]),
    ]),
    'scenarios.json': JSON.stringify(dataset.scenarios, null, 2) + '\n',
    'summary.json': JSON.stringify(dataset.metadata, null, 2) + '\n',
  };
}

export async function writeDemoFiles(dataset) {
  await mkdir(GENERATED_DIR, { recursive: true });
  const files = buildDemoFiles(dataset);
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(path.join(GENERATED_DIR, name), contents, { encoding: 'utf8', mode: 0o600 });
  }
  return Object.keys(files).map((name) => path.join(GENERATED_DIR, name));
}

function parseCli(args) {
  const options = {};
  const keys = {
    '--presentation-date': 'presentationDate',
    '--presentation-time': 'presentationTime',
    '--members': 'memberCount',
    '--as-of': 'asOf',
  };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (
      !keys[flag] ||
      seen.has(flag) ||
      args[index + 1] == null ||
      args[index + 1].startsWith('--')
    ) {
      throw new Error(
        `Invalid or repeated argument: ${flag}. Use --presentation-date YYYY-MM-DD --presentation-time HH:MM --members 600 --as-of ISO_TIMESTAMP.`,
      );
    }
    seen.add(flag);
    const value = args[index + 1];
    if (flag === '--members' && !/^\d+$/.test(value))
      throw new Error('--members must be a whole number.');
    options[keys[flag]] = flag === '--members' ? Number(value) : value;
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length === 3 && process.argv[2] === '--help') {
      console.log(
        'Usage: node scripts/generate-demo-data.mjs [--presentation-date YYYY-MM-DD] [--presentation-time HH:MM] [--members 600] [--as-of ISO_TIMESTAMP]',
      );
      console.log(
        'Defaults: Sunday 2026-11-01, 12:30 Asia/Manila, 600 members, actual current time.',
      );
      console.log(
        `Output is fixed to ${GENERATED_DIR}. Local fixture generation only; Supabase is never contacted.`,
      );
      process.exit(0);
    }
    const dataset = buildDemoDataset(parseCli(process.argv.slice(2)));
    const files = await writeDemoFiles(dataset);
    console.log(
      `Created ${dataset.members.length} fictional members, ${dataset.events.length} events and ${dataset.attendance.length} historical check-ins.`,
    );
    console.log(
      `Presentation: ${dataset.metadata.presentation_date} ${dataset.metadata.presentation_time} Asia/Manila. Confirm the time before seeding.`,
    );
    console.log(`As of: ${dataset.metadata.as_of}. Supabase was not contacted.`);
    files.forEach((file) => console.log(file));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
