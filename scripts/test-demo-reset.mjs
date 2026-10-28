// Version: LC-DEMO-RESET-v1. Tests only an isolated, in-memory PostgreSQL engine.
// The schema report is read locally; no Supabase URL, key or connection is used.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Papa from 'papaparse';
import { PGlite } from '@electric-sql/pglite';
import { buildDemoDataset } from './generate-demo-data.mjs';
import { buildResetSql, compactDatasetTransport, expandDatasetTransport, SQL_EDITOR_SAFE_BYTES } from './build-demo-reset.mjs';

const reportPath = process.argv[2];
if (!reportPath || process.argv.length !== 3) {
  console.error('Usage: node scripts/test-demo-reset.mjs "PATH_TO_PRIVATE_SCHEMA_REPORT.csv"');
  process.exit(1);
}

const parsed = Papa.parse(await readFile(reportPath, 'utf8'), { header: true, skipEmptyLines: true });
assert.equal(parsed.errors.length, 0, 'Schema CSV must parse without errors.');
const report = parsed.data.map(row => ({ ...row, value: JSON.parse(row.definition) }));
const section = name => report.filter(row => row.section === name);
const ident = value => '"' + value.replaceAll('"', '""') + '"';
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const qualified = name => name.split('.').map(ident).join('.');
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const OWNER_EMAIL = 'owner@example.com';
const db = new PGlite();
let passed = 0;

async function test(label, run) {
  await run();
  passed++;
  console.log(`PASS ${label}`);
}

async function scalar(sql, parameters = []) {
  const result = await db.query(sql, parameters);
  return Object.values(result.rows[0])[0];
}

async function expectFailure(sql, pattern) {
  let failure;
  try { await db.exec(sql); } catch (error) { failure = error; }
  // PostgreSQL keeps a failed explicit transaction aborted until ROLLBACK.
  await db.exec('ROLLBACK');
  assert.ok(failure, 'Expected the reset to abort.');
  if (pattern) assert.match(failure.message, pattern);
}

function resetCommands(sql) {
  const opening = /^DO (\$[a-z0-9_]+\$)/im.exec(sql);
  assert.ok(opening, 'The entire reset must be a single anonymous DO statement.');
  const delimiter = opening[1];
  const closing = sql.indexOf(delimiter, opening.index + opening[0].length);
  assert.ok(closing >= 0, 'The anonymous reset statement must have its closing delimiter.');
  const end = closing + delimiter.length + 1;
  assert.equal(sql[end - 1], ';');
  return [sql.slice(0, end), sql.slice(end).trim()];
}

async function schemaFingerprint() {
  return scalar(`SELECT md5(string_agg(definition, E'\\n' ORDER BY definition)) FROM (
    SELECT 'trigger:' || pg_get_triggerdef(t.oid) || ':' || t.tgenabled::text AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname='public'
    UNION ALL SELECT 'function:' || pg_get_functiondef(p.oid)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'
    UNION ALL SELECT 'constraint:' || c.conname || ':' || pg_get_constraintdef(c.oid)
    FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'
    UNION ALL SELECT 'rls:' || c.relname || ':' || c.relrowsecurity || ':' || c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'
  ) definitions`);
}

try {
  // Auth/Storage stand-ins model user cascades and owner preservation only.
  // Business tables, constraints, triggers and selected RPCs below come directly
  // from the deployed schema report, rather than a hand-written approximation.
  await db.exec(`
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text UNIQUE, raw_user_meta_data jsonb DEFAULT '{}', created_at timestamptz DEFAULT now());
    CREATE TABLE auth.identities (id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, identity_data jsonb NOT NULL);
    CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, token text NOT NULL);
    CREATE TABLE auth.scim_users (id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL);
    CREATE TABLE storage.objects (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'anon') $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    SET check_function_bodies = off;
  `);
  for (const row of section('15-enums')) {
    await db.exec(`CREATE TYPE ${qualified(row.object_name)} AS ENUM (${row.value.labels.map(literal).join(',')})`);
  }
  const tables = section('10-relations').filter(row => row.value.kind === 'table');
  assert.equal(tables.length, 19, 'Expected the audited 19 application tables.');
  for (const table of tables) {
    const columns = section('11-columns').filter(row => row.object_name.startsWith(table.object_name + '.'));
    columns.sort((a, b) => a.value.ordinal_position - b.value.ordinal_position);
    const definitions = columns.map(row => {
      const column = row.object_name.slice(table.object_name.length + 1);
      const value = row.value;
      let ddl = `${ident(column)} ${value.data_type}`;
      if (value.identity !== 'none') ddl += ` GENERATED ${value.identity === 'always' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY`;
      else if (value.default_expression) ddl += ` DEFAULT ${value.default_expression}`;
      if (!value.nullable) ddl += ' NOT NULL';
      return ddl;
    });
    await db.exec(`CREATE TABLE ${qualified(table.object_name)} (${definitions.join(',')})`);
    if (table.value.row_security_enabled) await db.exec(`ALTER TABLE ${qualified(table.object_name)} ENABLE ROW LEVEL SECURITY`);
  }
  for (const row of section('12-constraints').sort((a, b) => Number(a.value.type === 'f') - Number(b.value.type === 'f'))) {
    if (!row.value.relation?.startsWith('public.')) continue;
    const name = row.object_name.slice(row.value.relation.length + 1);
    await db.exec(`ALTER TABLE ${qualified(row.value.relation)} ADD CONSTRAINT ${ident(name)} ${row.value.definition}`);
  }
  for (const row of section('14-view-definitions')) {
    await db.exec(`CREATE VIEW ${qualified(row.object_name)} AS ${row.value.definition}`);
  }
  const functionNames = new Set([
    'capture_attendance_snapshot_v3', 'protect_attended_service_v3', 'lc_create_account',
    'lc_attendance_audit_values', 'lc_capture_attendance_activity', 'lc_entity_audit_values',
    'lc_capture_entity_activity', 'lc_capture_assignment_activity', 'lc_write_operational_activity',
    'lc_has_admin_access', 'lc_my_account', 'lc_my_member_portal', 'lc_my_attendance_history',
    'lc_dashboard_snapshot', 'lc_members_page', 'lc_member_directory_matches',
    'attendance_catalog_v4', 'attendance_report_v4', 'lc_guest_services', 'lc_scanner_services',
    'lc_scanner_member_search', 'lc_get_appearance', 'lc_get_appearance_v2',
    'lc_service_directory_matches', 'lc_services_page',
  ]);
  for (const row of section('20-functions')) {
    const name = row.object_name.split('(')[0].replace(/^public\./, '');
    if (functionNames.has(name)) await db.exec(row.value.definition);
  }
  for (const row of section('21-triggers')) {
    if (!row.value.internal && (row.object_name.startsWith('public.') || row.object_name.startsWith('auth.users.'))) {
      await db.exec(row.value.definition);
    }
  }
  await db.exec('SET check_function_bodies = on');
  await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ($1,$2,$3),($4,$5,$6)', [
    OWNER, OWNER_EMAIL, { full_name: 'Fictional Owner' }, OTHER, 'old.user@example.com', { full_name: 'Old Account' },
  ]);
  await db.query("UPDATE public.app_accounts SET role='owner', status='active' WHERE user_id=$1", [OWNER]);
  await db.query("INSERT INTO auth.identities VALUES ($1,$2,'{\"provider\":\"google\"}'),($3,$4,'{\"provider\":\"google\"}')", [OWNER, OWNER, OTHER, OTHER]);
  await db.query("INSERT INTO auth.sessions VALUES ($1,$2,'owner-session-to-retain'),($3,$4,'old-session')", [OWNER, OWNER, OTHER, OTHER]);
  const priorMember = '33333333-3333-4333-8333-333333333333';
  await db.query("INSERT INTO public.members(id,member_number,first_name,last_name,email) VALUES ($1,'OLD-001','Old','Member','old.member@example.com')", [priorMember]);
  await db.query('UPDATE public.app_accounts SET member_id=$1 WHERE user_id=$2', [priorMember, OWNER]);
  const initialFingerprint = await schemaFingerprint();
  // Local fixture validation dates precede wall time; future presentation events
  // remain empty in the reset, as they will in the production dataset.
  const dataset = buildDemoDataset({ asOf: '2026-10-28T02:00:00Z' });
  const sql = buildResetSql(dataset, { ownerEmail: OWNER_EMAIL });
  const guardDataset = buildDemoDataset({ memberCount: 20, asOf: '2026-10-28T02:00:00Z' });
  const guardSql = buildResetSql(guardDataset, { ownerEmail: OWNER_EMAIL });

  await test('the complete 600-member script fits the Supabase SQL Editor byte limit', async () => {
    // Match Studio's actual UTF-8 Blob measurement, including Unicode names.
    assert.ok(new Blob([sql]).size <= SQL_EDITOR_SAFE_BYTES);
    assert.ok(new Blob([sql]).size < 0.98 * 1024 * 1024);
    const oversized = structuredClone(guardDataset);
    oversized.metadata.notes.push('漢'.repeat(400_000));
    assert.throws(() => buildResetSql(oversized, { ownerEmail: OWNER_EMAIL }), /byte.*budget/i);
  });
  await test('smaller transport preserves all IDs, QR codes, timestamps, affiliations and custom values', async () => {
    assert.deepEqual(expandDatasetTransport(compactDatasetTransport(dataset)), dataset);
    const customized = structuredClone(guardDataset);
    const row = customized.attendance[0];
    row.id = row.id.toUpperCase();
    row.checked_in_at = row.checked_in_at.replace('Z', '+00:00');
    row.created_at = new Date(Date.parse(row.checked_in_at) + 1000).toISOString();
    row.notes = null;
    row.scanned_by = OWNER;
    row.extra = { detail: 'Fictional Unicode sample: ñ 漢', nested: [true, null] };
    customized.member_branches[0].extra = { note: 'Fictional affiliation metadata' };
    assert.deepEqual(expandDatasetTransport(compactDatasetTransport(customized)), customized);
  });

  await test('missing Owner aborts before changing any existing member or login', async () => {
    await expectFailure(buildResetSql(guardDataset, { ownerEmail: 'missing@example.com' }), /owner/i);
    assert.equal(Number(await scalar('SELECT count(*) FROM public.members')), 1);
    assert.equal(Number(await scalar('SELECT count(*) FROM auth.users')), 2);
  });
  await test('unexpected application tables stop the reset without data loss', async () => {
    await db.exec('CREATE TABLE public.unreviewed_table(id integer)');
    await expectFailure(guardSql, /table|schema/i);
    assert.equal(Number(await scalar('SELECT count(*) FROM public.members')), 1);
    await db.exec('DROP TABLE public.unreviewed_table');
  });
  await test('Storage objects stop the reset before deleting accounts', async () => {
    await db.query('INSERT INTO storage.objects VALUES ($1)', [OTHER]);
    await expectFailure(guardSql, /storage/i);
    assert.equal(Number(await scalar('SELECT count(*) FROM auth.users')), 2);
    await db.exec('DELETE FROM storage.objects');
  });
  await test('an ordinary account cannot be mistaken for the retained Owner', async () => {
    await db.query("UPDATE public.app_accounts SET role='user' WHERE user_id=$1", [OWNER]);
    await expectFailure(guardSql, /owner/i);
    assert.equal(Number(await scalar('SELECT count(*) FROM auth.users')), 2);
    await db.query("UPDATE public.app_accounts SET role='owner' WHERE user_id=$1", [OWNER]);
  });
  await test('managed SCIM identities stop the reset before any deletion', async () => {
    await db.query('INSERT INTO auth.scim_users VALUES ($1,$2)', [OTHER, OTHER]);
    await expectFailure(guardSql, /SCIM/i);
    assert.equal(Number(await scalar('SELECT count(*) FROM public.members')), 1);
    await db.exec('DELETE FROM auth.scim_users');
  });
  await test('a disabled attendance snapshot trigger stops the reset', async () => {
    await db.exec('ALTER TABLE public.attendance DISABLE TRIGGER attendance_snapshot_v3');
    await expectFailure(guardSql, /snapshot|trigger/i);
    assert.equal(Number(await scalar('SELECT count(*) FROM public.members')), 1);
    await db.exec('ALTER TABLE public.attendance ENABLE TRIGGER attendance_snapshot_v3');
  });
  await test('separate autocommit requests load the full batch without temporary helper tables', async () => {
    const [reset, summary] = resetCommands(sql);
    assert.doesNotMatch(reset, /CREATE\s+(?:TEMP|TEMPORARY)\s+TABLE/i);
    assert.doesNotMatch(reset, /\b(?:FROM|INTO)\s+_lc_demo_(?:payload|owner)\b/i);
    // Use single-statement requests, rather than one multi-statement .exec.
    // A restricted search path also catches unqualified application references.
    await db.exec("SET search_path=''; SET statement_timeout='60s'");
    await db.query(reset);
    const result = await db.query(summary);
    assert.equal(Number(result.rows[0].members), 600);
    assert.equal(Number(result.rows[0].historical_check_ins), dataset.attendance.length);
    await db.exec('SET search_path=public; RESET statement_timeout');
    assert.equal(Number(await scalar('SELECT count(*) FROM public.members')), 600);
    assert.equal(Number(await scalar('SELECT count(*) FROM public.events')), 82);
    assert.equal(Number(await scalar('SELECT count(*) FROM public.attendance')), dataset.attendance.length);
    assert.equal(Number(await scalar('SELECT count(*) FROM auth.users')), 1);
    assert.equal(Number(await scalar('SELECT count(*) FROM public.app_accounts')), 1);
    assert.equal(await scalar('SELECT role FROM public.app_accounts'), 'owner');
    assert.equal(await scalar('SELECT status FROM public.app_accounts'), 'active');
    assert.equal(await scalar('SELECT member_id FROM public.app_accounts'), dataset.members[0].id);
    assert.equal(await scalar('SELECT token FROM auth.sessions'), 'owner-session-to-retain');
    assert.equal(Number(await scalar('SELECT count(*) FROM auth.identities')), 1);
    assert.equal(Number(await scalar("SELECT count(*) FROM public.lc_entity_activity WHERE coalesce(before_value::text,'') LIKE '%old.member@example.com%' OR coalesce(after_value::text,'') LIKE '%old.member@example.com%'")), 0);
    assert.ok(Number(await scalar('SELECT count(*) FROM public.lc_entity_activity')) > dataset.attendance.length);
    assert.equal(await schemaFingerprint(), initialFingerprint);
  });
  await test('the reset respects a caller transaction and never commits it internally', async () => {
    const [reset] = resetCommands(guardSql);
    await db.exec('BEGIN');
    await db.query(reset);
    assert.equal(Number(await scalar('SELECT count(*) FROM public.members')), 20);
    await db.exec('ROLLBACK');
    assert.equal(Number(await scalar('SELECT count(*) FROM public.members')), 600);
    assert.equal(await scalar('SELECT token FROM auth.sessions'), 'owner-session-to-retain');
  });
  await test('actual deployed snapshot trigger records affiliations and protects historical details', async () => {
    const sample = await db.query('SELECT id,report_snapshot FROM public.attendance LIMIT 1');
    const snapshot = sample.rows[0].report_snapshot;
    assert.equal(snapshot.source, 'captured_at_check_in');
    assert.ok(snapshot.churches.length >= 1);
    assert.ok(snapshot.service_name);
    await assert.rejects(db.query("UPDATE public.attendance SET checked_in_at=checked_in_at+interval '1 minute' WHERE id=$1", [sample.rows[0].id]), /cannot be overwritten/i);
  });
  await test('deployed dashboard, directory, guest schedule and member portal RPCs accept the seeded data', async () => {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [OWNER]);
    await db.exec("SELECT set_config('request.jwt.claim.role','authenticated',false)");
    const account = await scalar('SELECT public.lc_my_account()');
    assert.equal(account.role, 'owner');
    const portal = await scalar('SELECT public.lc_my_member_portal(1)');
    assert.equal(portal.profile.member_number, 'DEMO-0001');
    assert.equal(portal.profile.qr_token, dataset.members[0].qr_token);
    const directory = await scalar("SELECT public.lc_members_page('','all','all','all','name-asc',1,25)");
    assert.ok(Array.isArray(directory.rows) && directory.rows.length === 25);
    const dashboard = await scalar("SELECT public.lc_dashboard_snapshot('all',NULL)");
    assert.equal(dashboard.total_members, 600);
    assert.ok(dashboard.total_check_ins > 0);
    const guest = await scalar('SELECT public.lc_guest_services(1)');
    assert.ok(guest);
    const history = await scalar("SELECT public.attendance_report_v4('{\"scope\":\"history\"}'::jsonb,'check_in',true,0,25,now())");
    assert.equal(history.report_version, 4);
    assert.ok(history.total > 0 && history.rows.length === 25);
    assert.ok(history.rows[0].churches.length > 0);
    const appearance = await scalar('SELECT public.lc_get_appearance_v2()');
    assert.equal(appearance.use_default, true);
  });
  await test('a post-truncate failure rolls back all profiles and preserves the Owner session', async () => {
    await db.exec(`CREATE FUNCTION public.demo_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected seed failure'; END $$;
      CREATE TRIGGER demo_test_failure BEFORE INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION public.demo_test_fail()`);
    await expectFailure(guardSql, /Injected seed failure/);
    assert.equal(Number(await scalar('SELECT count(*) FROM public.members')), 600);
    assert.equal(Number(await scalar('SELECT count(*) FROM auth.users')), 1);
    assert.equal(await scalar('SELECT token FROM auth.sessions'), 'owner-session-to-retain');
    await db.exec('DROP TRIGGER demo_test_failure ON public.events; DROP FUNCTION public.demo_test_fail()');
  });
  console.log(`All ${passed} demo reset integration checks passed using the deployed schema report in isolated PostgreSQL.`);
} catch (error) {
  console.error(error.message);
  if (error.detail) console.error(error.detail);
  if (error.where) console.error(error.where);
  process.exitCode = 1;
} finally {
  await db.close();
}
