import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENERATED_DIR } from './generate-demo-data.mjs';

export const EXPECTED_PUBLIC_TABLES = [
  'app_accounts',
  'attendance',
  'branches',
  'events',
  'lc_account_access_log',
  'lc_appearance',
  'lc_appearance_log',
  'lc_appearance_tokens_v2',
  'lc_entity_activity',
  'lc_feedback',
  'lc_member_import_runs',
  'lc_member_link_log',
  'lc_member_requests',
  'lc_profile_edit_log',
  'lc_profile_requests',
  'member_branches',
  'member_ministries',
  'members',
  'ministries',
];
export const RESET_SQL_PATH = path.join(GENERATED_DIR, '02-reset-and-seed.sql');

export function sqlLiteral(value) {
  if (typeof value !== 'string' || value.includes('\0'))
    throw new Error('SQL literal must be a string without NUL.');
  return "'" + value.replaceAll("'", "''") + "'";
}

export function dollarQuote(value, label = 'lc_demo_payload') {
  if (!/^[a-z_][a-z0-9_]*$/i.test(label)) throw new Error('Invalid dollar-quote label.');
  let index = 0;
  let delimiter = `$${label}$`;
  while (value.includes(delimiter)) delimiter = `$${label}_${++index}$`;
  return delimiter + value + delimiter;
}

const TRANSPORT_KEY = '_lc_demo_attendance_transport';
const LINKS_KEY = '_lc_demo_links_transport';
const ATTENDANCE_FIELDS = [
  'id',
  'member_id',
  'event_id',
  'checked_in_at',
  'status',
  'notes',
  'scanned_by',
  'created_at',
];

export const SQL_EDITOR_SAFE_BYTES = 900_000;

function encodedUuid(value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new Error('Attendance IDs must be UUIDs.');
  }
  return Buffer.from(value.replaceAll('-', ''), 'hex').toString('base64');
}

function decodedUuid(value) {
  const hex = Buffer.from(value, 'base64').toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function compactDatasetTransport(dataset) {
  if (Object.hasOwn(dataset, TRANSPORT_KEY) || Object.hasOwn(dataset, LINKS_KEY))
    throw new Error('Dataset contains a reserved SQL transport key.');
  const memberIndices = new Map(dataset.members.map((member, index) => [member.id, index]));
  const eventIndices = new Map(dataset.events.map((event, index) => [event.id, index]));
  const notes = [],
    noteIndices = new Map();
  const noteCounts = new Map();
  for (const record of dataset.attendance) {
    const key = JSON.stringify(record.notes);
    noteCounts.set(key, (noteCounts.get(key) ?? 0) + 1);
  }
  const defaultNote = [...noteCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (defaultNote !== undefined) {
    notes.push(JSON.parse(defaultNote));
    noteIndices.set(defaultNote, 0);
  }
  const rows = dataset.attendance.map((record, index) => {
    if (ATTENDANCE_FIELDS.some((key) => !Object.hasOwn(record, key) || record[key] === undefined)) {
      throw new Error(`Attendance row ${index} must contain all eight base fields.`);
    }
    const member = memberIndices.get(record.member_id),
      event = eventIndices.get(record.event_id);
    if (!Number.isSafeInteger(member) || !Number.isSafeInteger(event))
      throw new Error(`Attendance row ${index} has an unknown member or event reference.`);
    const noteKey = JSON.stringify(record.notes);
    if (!noteIndices.has(noteKey)) {
      noteIndices.set(noteKey, notes.length);
      notes.push(record.notes);
    }
    const checkedAt = Date.parse(record.checked_in_at);
    const offset = checkedAt - Date.parse(dataset.events[event].starts_at);
    if (!Number.isSafeInteger(offset))
      throw new Error(`Attendance row ${index} has an invalid timestamp.`);
    const id = encodedUuid(record.id);
    const row = [id, member, event, offset];
    const overrides = {};
    if (record.id !== decodedUuid(id)) overrides.i = record.id;
    if (record.checked_in_at !== new Date(checkedAt).toISOString())
      overrides.t = record.checked_in_at;
    if (record.status !== 'present') overrides.s = record.status;
    if (noteIndices.get(noteKey) !== 0) overrides.n = noteIndices.get(noteKey);
    if (record.scanned_by !== null) overrides.b = record.scanned_by;
    if (record.created_at !== record.checked_in_at) overrides.c = record.created_at;
    const extra = Object.fromEntries(
      Object.entries(record).filter(([key]) => !ATTENDANCE_FIELDS.includes(key)),
    );
    if (Object.keys(extra).length) overrides.x = extra;
    if (Object.keys(overrides).length) row.push(overrides);
    return row;
  });
  const packLinks = (records, key, targets) => {
    const indices = new Map(targets.map((record, index) => [record.id, index]));
    return records.map((record) => {
      const member = memberIndices.get(record.member_id),
        target = indices.get(record[key]);
      if (!Number.isSafeInteger(member) || !Number.isSafeInteger(target))
        throw new Error(`Unknown ${key} affiliation reference.`);
      const row = [member, target];
      const extra = Object.fromEntries(
        Object.entries(record).filter(([field]) => !['member_id', key].includes(field)),
      );
      if (Object.keys(extra).length) row.push(extra);
      return row;
    });
  };
  const { attendance, member_branches, member_ministries, ...rest } = dataset;
  return {
    ...rest,
    [TRANSPORT_KEY]: { version: 2, notes, rows },
    [LINKS_KEY]: {
      member_branches: packLinks(member_branches, 'branch_id', dataset.branches),
      member_ministries: packLinks(member_ministries, 'ministry_id', dataset.ministries),
    },
  };
}

export function expandDatasetTransport(transport) {
  const { [TRANSPORT_KEY]: packed, [LINKS_KEY]: links, ...rest } = transport;
  if (packed?.version !== 2) throw new Error('Unsupported attendance transport version.');
  const expandLinks = (rows, key, targets) =>
    rows.map((row) => ({
      member_id: rest.members[row[0]].id,
      [key]: targets[row[1]].id,
      ...(row[2] ?? {}),
    }));
  return {
    ...rest,
    member_branches: expandLinks(links.member_branches, 'branch_id', rest.branches),
    member_ministries: expandLinks(links.member_ministries, 'ministry_id', rest.ministries),
    attendance: packed.rows.map((row) => {
      const overrides = row[4] ?? {};
      const checkedAt =
        overrides.t ?? new Date(Date.parse(rest.events[row[2]].starts_at) + row[3]).toISOString();
      return {
        id: overrides.i ?? decodedUuid(row[0]),
        member_id: rest.members[row[1]].id,
        event_id: rest.events[row[2]].id,
        checked_in_at: checkedAt,
        status: overrides.s ?? 'present',
        notes: packed.notes[overrides.n ?? 0],
        scanned_by: overrides.b ?? null,
        created_at: overrides.c ?? checkedAt,
        ...(overrides.x ?? {}),
      };
    }),
  };
}

const REQUIRED_COLUMNS = {
  app_accounts: {
    user_id: 'uuid',
    role: 'text',
    status: 'text',
    member_id: 'uuid',
    created_at: 'timestamptz',
    updated_at: 'timestamptz',
  },
  branches: { id: 'uuid', name: 'text', created_at: 'timestamptz' },
  ministries: { id: 'uuid', name: 'text', created_at: 'timestamptz' },
  member_branches: { member_id: 'uuid', branch_id: 'uuid' },
  member_ministries: { member_id: 'uuid', ministry_id: 'uuid', created_at: 'timestamptz' },
  members: {
    id: 'uuid',
    member_number: 'text',
    first_name: 'text',
    last_name: 'text',
    email: 'text',
    mobile: 'text',
    member_group: 'text',
    status: 'public.member_status',
    qr_token: 'uuid',
    created_at: 'timestamptz',
    updated_at: 'timestamptz',
    is_starred: 'boolean',
    admin_note: 'text',
  },
  events: {
    id: 'uuid',
    name: 'text',
    starts_at: 'timestamptz',
    ends_at: 'timestamptz',
    location: 'text',
    is_sunday_service: 'boolean',
    created_at: 'timestamptz',
    admin_note: 'text',
    archived_at: 'timestamptz',
    is_public: 'boolean',
  },
  attendance: {
    id: 'uuid',
    member_id: 'uuid',
    event_id: 'uuid',
    checked_in_at: 'timestamptz',
    status: 'public.attendance_status',
    scanned_by: 'uuid',
    notes: 'text',
    created_at: 'timestamptz',
    report_snapshot: 'jsonb',
  },
  lc_appearance: {
    id: 'boolean',
    use_default: 'boolean',
    primary_color: 'text',
    secondary_color: 'text',
    highlight_color: 'text',
    revision: 'integer',
    updated_at: 'timestamptz',
  },
  lc_appearance_tokens_v2: { singleton: 'boolean', tokens: 'jsonb', revision: 'bigint' },
};

export function buildResetSql(dataset, { ownerEmail } = {}) {
  if (
    typeof ownerEmail !== 'string' ||
    !/^[^\s@\u0000-\u001f]+@[^\s@\u0000-\u001f]+\.[^\s@\u0000-\u001f]+$/.test(ownerEmail.trim())
  ) {
    throw new Error(
      'A valid --owner-email is required; it must match the one active Owner account to preserve.',
    );
  }
  ownerEmail = ownerEmail.trim().toLowerCase();
  if (
    !dataset?.metadata?.fictional ||
    dataset.metadata.version !== 'LC-DEMO-v1' ||
    !Number.isFinite(Date.parse(dataset.metadata.as_of))
  ) {
    throw new Error(
      'Expected a generated LC-DEMO-v1 fictional dataset with a valid as_of timestamp.',
    );
  }
  for (const key of [
    'branches',
    'ministries',
    'members',
    'member_branches',
    'member_ministries',
    'events',
    'attendance',
  ]) {
    if (!Array.isArray(dataset[key]) || dataset[key].length === 0)
      throw new Error(`Dataset ${key} must be a non-empty array.`);
  }
  if (
    !dataset.members.some((member) => member.member_number === 'DEMO-0001') ||
    !dataset.scenarios?.live_event?.event_id
  ) {
    throw new Error('Dataset must include DEMO-0001 and a reserved live presentation event.');
  }
  const expected = EXPECTED_PUBLIC_TABLES.map(sqlLiteral).join(',');
  const allTables = EXPECTED_PUBLIC_TABLES.map((name) => `public.${name}`).join(',\n  ');
  const required = Object.entries(REQUIRED_COLUMNS)
    .flatMap(([table, columns]) =>
      Object.entries(columns).map(
        ([column, type]) => `(${sqlLiteral(table)},${sqlLiteral(column)},${sqlLiteral(type)})`,
      ),
    )
    .join(',\n    ');
  const payload = dollarQuote(JSON.stringify(compactDatasetTransport(dataset)));
  const body = `DECLARE
  demo_payload jsonb := ${payload}::jsonb;
  retained_user_id uuid;
  retained_account jsonb;
  retained_auth_record jsonb;
BEGIN
PERFORM set_config('lock_timeout','5s',true);
PERFORM set_config('standard_conforming_strings','on',true);
PERFORM pg_advisory_xact_lock(1279477588, 20261101);
-- Recover complete original attendance records once; subsequent statements use the normal dataset shape.
-- All state lives in this one atomic statement, with no temporary helper tables.
DECLARE payload jsonb; member_data jsonb; event_data jsonb; branch_data jsonb; ministry_data jsonb;
  note_data jsonb; row_data jsonb; expanded jsonb; branch_links jsonb; ministry_links jsonb;
BEGIN
  payload:=demo_payload;
  member_data:=payload->'members'; event_data:=payload->'events';
  branch_data:=payload->'branches'; ministry_data:=payload->'ministries';
  note_data:=payload#>'{${TRANSPORT_KEY},notes}'; row_data:=payload#>'{${TRANSPORT_KEY},rows}';
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',coalesce(packed.entry#>'{4,i}',to_jsonb(encode(decode(packed.entry->>0,'base64'),'hex')::uuid)),
    'member_id',member_data->((packed.entry->>1)::integer)->'id',
    'event_id',event_data->((packed.entry->>2)::integer)->'id',
    'checked_in_at',coalesce(packed.entry#>'{4,t}',to_jsonb((event_data->((packed.entry->>2)::integer)->>'starts_at')::timestamptz+(packed.entry->>3)::double precision*interval '1 millisecond')),
    'status',coalesce(packed.entry#>'{4,s}','"present"'::jsonb),
    'notes',note_data->coalesce((packed.entry#>>'{4,n}')::integer,0),
    'scanned_by',coalesce(packed.entry#>'{4,b}','null'::jsonb),
    'created_at',coalesce(packed.entry#>'{4,c}',packed.entry#>'{4,t}',to_jsonb((event_data->((packed.entry->>2)::integer)->>'starts_at')::timestamptz+(packed.entry->>3)::double precision*interval '1 millisecond'))
  ) || coalesce(packed.entry#>'{4,x}','{}'::jsonb) ORDER BY packed.seq),'[]'::jsonb)
    INTO expanded FROM jsonb_array_elements(row_data) WITH ORDINALITY AS packed(entry,seq);
  SELECT coalesce(jsonb_agg(jsonb_build_object('member_id',member_data->((entry->>0)::integer)->'id',
    'branch_id',branch_data->((entry->>1)::integer)->'id') || coalesce(entry->2,'{}'::jsonb) ORDER BY seq),'[]'::jsonb)
    INTO branch_links FROM jsonb_array_elements(payload#>'{${LINKS_KEY},member_branches}') WITH ORDINALITY AS link(entry,seq);
  SELECT coalesce(jsonb_agg(jsonb_build_object('member_id',member_data->((entry->>0)::integer)->'id',
    'ministry_id',ministry_data->((entry->>1)::integer)->'id') || coalesce(entry->2,'{}'::jsonb) ORDER BY seq),'[]'::jsonb)
    INTO ministry_links FROM jsonb_array_elements(payload#>'{${LINKS_KEY},member_ministries}') WITH ORDINALITY AS link(entry,seq);
  demo_payload:=(payload-'${TRANSPORT_KEY}'-'${LINKS_KEY}') || jsonb_build_object(
    'attendance',expanded,'member_branches',branch_links,'member_ministries',ministry_links);
END;

-- All compatibility, ownership and managed-service guards run before destructive statements.
DECLARE actual text[]; expected text[] := ARRAY[${expected}]::text[];
  owner_id uuid; matched integer; bad boolean; payload jsonb;
BEGIN
  payload:=demo_payload;
  SELECT array_agg(c.relname::text ORDER BY c.relname::text COLLATE "C") INTO actual
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p','f');
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Public table inventory differs from audited schema. Expected %, found %. Nothing was reset.', expected, actual;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('p','f')) THEN
    RAISE EXCEPTION 'Partitioned or foreign application tables require a fresh schema audit.';
  END IF;
  IF EXISTS(
    SELECT 1 FROM (VALUES
    ${required}
    ) AS wanted(table_name,column_name,type_name)
    LEFT JOIN pg_namespace n ON n.nspname='public'
    LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=wanted.table_name
    LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname=wanted.column_name AND a.attnum>0 AND NOT a.attisdropped
    WHERE a.attnum IS NULL OR a.atttypid IS DISTINCT FROM to_regtype(wanted.type_name)::oid
  ) THEN RAISE EXCEPTION 'Required application columns or their types differ from the audited schema.'; END IF;
  IF (SELECT count(*) FROM pg_attribute WHERE attrelid='public.app_accounts'::regclass AND attnum>0 AND NOT attisdropped)<>6 THEN
    RAISE EXCEPTION 'Owner application account has unaudited columns. Audit them before restoring its snapshot.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.attendance'::regclass
    AND t.tgname='attendance_snapshot_v3' AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
    AND t.tgtype=23 AND t.tgfoid=to_regprocedure('public.capture_attendance_snapshot_v3()')) THEN
    RAISE EXCEPTION 'Required attendance snapshot BEFORE INSERT/UPDATE trigger is missing, disabled or changed.';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_constraint k
    JOIN pg_class target ON target.oid=k.confrelid JOIN pg_namespace target_ns ON target_ns.oid=target.relnamespace
    JOIN pg_class source ON source.oid=k.conrelid JOIN pg_namespace source_ns ON source_ns.oid=source.relnamespace
    WHERE k.contype='f' AND target_ns.nspname='public' AND source_ns.nspname<>'public') THEN
    RAISE EXCEPTION 'An external schema references application tables. Audit those dependencies before resetting.';
  END IF;
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM storage.objects)' INTO bad;
    IF bad THEN RAISE EXCEPTION 'Storage objects exist. Remove or migrate them using the Storage API before resetting Auth users; SQL must not orphan stored files.'; END IF;
  END IF;
  IF to_regclass('auth.scim_users') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM auth.scim_users)' INTO bad;
    IF bad THEN RAISE EXCEPTION 'SCIM-managed users exist. Resolve managed provisioning before this presentation reset.'; END IF;
  END IF;
  IF (payload#>>'{metadata,as_of}')::timestamptz > clock_timestamp() THEN
    RAISE EXCEPTION 'Dataset as_of is in the future. Regenerate with the actual current time.';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(payload->'members') m WHERE m->>'member_number'='DEMO-0001')<>1 THEN
    RAISE EXCEPTION 'Dataset needs exactly one DEMO-0001 owner-linked member.';
  END IF;
  SELECT count(*),min(id::text)::uuid INTO matched,owner_id FROM auth.users WHERE lower(email)=${sqlLiteral(ownerEmail)};
  IF matched<>1 THEN RAISE EXCEPTION 'Nominated Owner email must identify exactly one Auth user; found %.', matched; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.app_accounts WHERE user_id=owner_id AND role='owner' AND status='active') THEN
    RAISE EXCEPTION 'Nominated login is not an active Owner account. Nothing was reset.';
  END IF;
  SELECT u.id,to_jsonb(a),to_jsonb(u) INTO STRICT retained_user_id,retained_account,retained_auth_record
    FROM auth.users u JOIN public.app_accounts a ON a.user_id=u.id WHERE u.id=owner_id;
END;

-- Keep other signups and account edits out until this transaction finishes.
LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.app_accounts IN SHARE ROW EXCLUSIVE MODE;
  IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.app_accounts a ON a.user_id=u.id
    WHERE u.id=retained_user_id AND to_jsonb(u)=retained_auth_record AND to_jsonb(a)=retained_account) THEN
    RAISE EXCEPTION 'Owner account changed during preflight; rerun after reviewing the account.';
  END IF;

-- Explicit audited allowlist: no CASCADE, no system-schema truncation and no disabled triggers.
TRUNCATE TABLE
  ${allTables}
RESTART IDENTITY;
DELETE FROM auth.users WHERE id<>retained_user_id;

INSERT INTO public.branches (id,name)
SELECT r.id,r.name FROM jsonb_to_recordset(demo_payload->'branches') r(id uuid,name text);
INSERT INTO public.ministries (id,name)
SELECT r.id,r.name FROM jsonb_to_recordset(demo_payload->'ministries') r(id uuid,name text);
INSERT INTO public.members (id,member_number,first_name,last_name,email,mobile,member_group,status,qr_token,created_at,updated_at,is_starred,admin_note)
SELECT r.id,r.member_number,r.first_name,r.last_name,r.email,r.mobile,r.member_group,r.status,r.qr_token,r.created_at,r.updated_at,r.is_starred,r.admin_note
FROM jsonb_to_recordset(demo_payload->'members')
  r(id uuid,member_number text,first_name text,last_name text,email text,mobile text,member_group text,status public.member_status,qr_token uuid,created_at timestamptz,updated_at timestamptz,is_starred boolean,admin_note text);
INSERT INTO public.member_branches (member_id,branch_id)
SELECT r.member_id,r.branch_id FROM jsonb_to_recordset(demo_payload->'member_branches') r(member_id uuid,branch_id uuid);
INSERT INTO public.member_ministries (member_id,ministry_id)
SELECT r.member_id,r.ministry_id FROM jsonb_to_recordset(demo_payload->'member_ministries') r(member_id uuid,ministry_id uuid);
INSERT INTO public.events (id,name,starts_at,ends_at,location,is_sunday_service,created_at,admin_note,archived_at,is_public)
SELECT r.id,r.name,r.starts_at,r.ends_at,r.location,r.is_sunday_service,r.created_at,r.admin_note,r.archived_at,r.is_public
FROM jsonb_to_recordset(demo_payload->'events')
  r(id uuid,name text,starts_at timestamptz,ends_at timestamptz,location text,is_sunday_service boolean,created_at timestamptz,admin_note text,archived_at timestamptz,is_public boolean);

-- Attendance snapshots are created by the existing enabled trigger after affiliations exist.
INSERT INTO public.attendance (id,member_id,event_id,checked_in_at,status,scanned_by,notes,created_at)
SELECT r.id,r.member_id,r.event_id,r.checked_in_at,r.status,r.scanned_by,r.notes,r.created_at
FROM jsonb_to_recordset(demo_payload->'attendance')
  r(id uuid,member_id uuid,event_id uuid,checked_in_at timestamptz,status public.attendance_status,scanned_by uuid,notes text,created_at timestamptz);
INSERT INTO public.app_accounts (user_id,role,status,member_id,created_at,updated_at)
SELECT retained_user_id,'owner','active',(SELECT id FROM public.members WHERE member_number='DEMO-0001'),
  (retained_account->>'created_at')::timestamptz,(retained_account->>'updated_at')::timestamptz;
INSERT INTO public.lc_appearance (id,use_default,primary_color,secondary_color,highlight_color,revision)
VALUES (true,true,'#147d73','#8f7cd1','#e6ad4c',1);

DECLARE payload jsonb; item text; expected_count bigint; actual_count bigint; keep_id uuid; bad boolean;
BEGIN
  payload:=demo_payload;
  keep_id:=retained_user_id;
  FOREACH item IN ARRAY ARRAY['branches','ministries','members','member_branches','member_ministries','events','attendance'] LOOP
    expected_count:=jsonb_array_length(payload->item);
    EXECUTE format('SELECT count(*) FROM public.%I',item) INTO actual_count;
    IF actual_count<>expected_count THEN RAISE EXCEPTION 'Seed count mismatch in %: expected %, found %.',item,expected_count,actual_count; END IF;
  END LOOP;
  FOREACH item IN ARRAY ARRAY['branches','ministries','members','events','attendance'] LOOP
    EXECUTE format('SELECT EXISTS(SELECT id FROM public.%I EXCEPT SELECT (fixture->>''id'')::uuid FROM jsonb_array_elements($1->$2) AS fixture)',item)
      INTO bad USING payload,item;
    IF bad THEN RAISE EXCEPTION 'Unexpected pre-existing ID remains in %.',item; END IF;
  END LOOP;
  IF (SELECT count(*) FROM auth.users)<>1 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=keep_id)
    OR (SELECT count(*) FROM public.app_accounts)<>1 THEN RAISE EXCEPTION 'Owner must be the only remaining authentication/application account.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=retained_user_id AND to_jsonb(u)=retained_auth_record) THEN
    RAISE EXCEPTION 'Preserved Owner authentication row changed.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.app_accounts a WHERE a.user_id=retained_user_id
    AND a.role='owner' AND a.status='active' AND a.member_id=(SELECT id FROM public.members WHERE member_number='DEMO-0001')
    AND (to_jsonb(a)-'member_id')=(retained_account-'member_id')) THEN RAISE EXCEPTION 'Owner application account was not restored correctly.'; END IF;
  IF EXISTS(SELECT 1 FROM public.members GROUP BY regexp_replace(lower(first_name||' '||last_name),'[^a-z0-9]+','','g') HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Fictional full names must be unique after normalization.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.attendance a LEFT JOIN public.members m ON m.id=a.member_id LEFT JOIN public.events e ON e.id=a.event_id
    WHERE m.id IS NULL OR e.id IS NULL OR a.scanned_by IS NOT NULL OR a.checked_in_at<m.created_at
    OR a.checked_in_at<e.starts_at OR a.checked_in_at>=e.ends_at
    OR a.checked_in_at>(payload#>>'{metadata,as_of}')::timestamptz OR a.checked_in_at>clock_timestamp()) THEN
    RAISE EXCEPTION 'Attendance contains an orphan, invented scanner identity or invalid/future timestamp.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.member_branches mb LEFT JOIN public.members m ON m.id=mb.member_id LEFT JOIN public.branches b ON b.id=mb.branch_id WHERE m.id IS NULL OR b.id IS NULL)
    OR EXISTS(SELECT 1 FROM public.member_ministries mm LEFT JOIN public.members m ON m.id=mm.member_id LEFT JOIN public.ministries n ON n.id=mm.ministry_id WHERE m.id IS NULL OR n.id IS NULL) THEN
    RAISE EXCEPTION 'An affiliation has an orphaned reference.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.attendance WHERE event_id=(payload#>>'{scenarios,live_event,event_id}')::uuid) THEN
    RAISE EXCEPTION 'The live presentation event must start with zero check-ins.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.attendance a JOIN public.members m ON m.id=a.member_id JOIN public.events e ON e.id=a.event_id
    WHERE a.report_snapshot IS NULL OR jsonb_typeof(a.report_snapshot)<>'object'
    OR NOT (a.report_snapshot @> jsonb_build_object('version',1,'source','captured_at_check_in',
      'first_name',m.first_name,'last_name',m.last_name,'member_number',m.member_number,'email',m.email,'mobile',m.mobile,
      'member_status',m.status,'member_group',m.member_group,'service_name',e.name,'service_date',e.starts_at,
      'service_end',e.ends_at,'service_location',e.location,'sunday_service',e.is_sunday_service))
    OR (a.report_snapshot->>'captured_at')::timestamptz IS DISTINCT FROM transaction_timestamp()
    OR a.report_snapshot->'churches' IS DISTINCT FROM (SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) ORDER BY lower(b.name),b.id),'[]'::jsonb) FROM public.member_branches mb JOIN public.branches b ON b.id=mb.branch_id WHERE mb.member_id=m.id)
    OR a.report_snapshot->'ministries' IS DISTINCT FROM (SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'name',n.name) ORDER BY lower(n.name),n.id),'[]'::jsonb) FROM public.member_ministries mm JOIN public.ministries n ON n.id=mm.ministry_id WHERE mm.member_id=m.id)) THEN
    RAISE EXCEPTION 'An attendance snapshot does not match its seeded member, service and affiliations.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.attendance'::regclass AND tgname='attendance_snapshot_v3'
    AND tgenabled IN ('O','A') AND tgtype=23 AND tgfoid=to_regprocedure('public.capture_attendance_snapshot_v3()')) THEN
    RAISE EXCEPTION 'Attendance snapshot protection must remain enabled.';
  END IF;
  IF (SELECT count(*) FROM public.lc_appearance)<>1 OR EXISTS(SELECT 1 FROM public.lc_appearance_tokens_v2)
    OR NOT EXISTS(SELECT 1 FROM public.lc_appearance WHERE id AND use_default AND revision=1) THEN
    RAISE EXCEPTION 'Default appearance was not restored.';
  END IF;
END;
END;
`;
  const sql = `-- Retained Owner login: ${ownerEmail}
-- DESTRUCTIVE: clears the 19 application tables and removes every other Auth user.
-- Preserves the Owner login and links its application account to fictional DEMO-0001.
-- Run the complete file as the database owner. Any failing guard rolls back the reset statement.
DO ${dollarQuote(body, 'lc_demo_reset')};

SELECT 'Demo reset complete' AS result,
  (SELECT count(*) FROM auth.users) AS retained_auth_users,
  (SELECT count(*) FROM public.app_accounts) AS retained_app_accounts,
  (SELECT count(*) FROM public.members) AS members,
  (SELECT count(*) FROM public.branches) AS churches,
  (SELECT count(*) FROM public.ministries) AS ministries,
  (SELECT count(*) FROM public.events) AS events,
  (SELECT count(*) FROM public.attendance) AS historical_check_ins,
  (SELECT count(*) FROM public.lc_entity_activity) AS seed_activity_records;
`;
  if (Buffer.byteLength(sql, 'utf8') > SQL_EDITOR_SAFE_BYTES) {
    throw new Error(
      `Generated SQL exceeds the ${SQL_EDITOR_SAFE_BYTES}-byte editor safety budget. Reduce the batch before writing; no replacement SQL was saved.`,
    );
  }
  return sql;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') {
      console.log('Usage: node scripts/build-demo-reset.mjs --owner-email owner@example.com');
      console.log(
        `Reads ${path.join(GENERATED_DIR, 'dataset.json')} and writes ${RESET_SQL_PATH}. Never connects to Supabase.`,
      );
    } else {
      if (args.length !== 2 || args[0] !== '--owner-email')
        throw new Error('Use --owner-email EMAIL. No input/output path overrides are supported.');
      const dataset = JSON.parse(await readFile(path.join(GENERATED_DIR, 'dataset.json'), 'utf8'));
      const sql = buildResetSql(dataset, { ownerEmail: args[1] });
      await writeFile(RESET_SQL_PATH, sql, { encoding: 'utf8', mode: 0o600 });
      console.log(
        `Created ${RESET_SQL_PATH}. Review and back up before executing this destructive reset in Supabase SQL Editor.`,
      );
      console.log('No database was contacted or changed.');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
