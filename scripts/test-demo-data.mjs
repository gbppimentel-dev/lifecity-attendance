// Version: LC-DEMO-v1. Standard-library checks; no database connection or destructive operation.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemoDataset, buildDemoFiles, csvCell, eventState, GENERATED_DIR } from './generate-demo-data.mjs';

const AS_OF = '2026-10-28T08:00:00Z';
const AS_OF_STAMP = Date.parse(AS_OF);
const HOUR = 3_600_000;
const dataset = buildDemoDataset({ asOf: AS_OF });
const tests = [];
function test(name, run) { tests.push({ name, run }); }
function unique(rows, field, label = field) {
  assert.equal(new Set(rows.map(row => row[field])).size, rows.length, `${label} must be unique`);
}
function withoutTokens(data) { return { ...data, members: data.members.map(({ qr_token, ...member }) => member) }; }

function parseCsv(contents) {
  assert.equal(contents.charCodeAt(0), 0xfeff, 'Windows CSV must begin with UTF-8 BOM');
  const rows = [];
  let row = [], cell = '', quoted = false;
  const text = contents.slice(1);
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (char === '\r' && text[i + 1] === '\n' && !quoted) {
      row.push(cell); rows.push(row); row = []; cell = ''; i++;
    } else cell += char;
  }
  assert.equal(quoted, false, 'CSV must have balanced quotes');
  assert.equal(cell, '');
  assert.equal(row.length, 0);
  return rows;
}

test('default fixtures cover the directory, affiliations and reporting screens', () => {
  assert.equal(dataset.metadata.version, 'LC-DEMO-v1');
  assert.equal(dataset.metadata.timezone, 'Asia/Manila');
  assert.equal(dataset.members.length, 600);
  assert.equal(dataset.members.filter(member => member.status === 'active').length, 540);
  assert.equal(dataset.members.filter(member => member.status === 'inactive').length, 60);
  assert.equal(dataset.branches.length, 8);
  assert.equal(dataset.ministries.length, 14);
  assert.equal(dataset.events.length, 82);
  assert.ok(dataset.attendance.length >= 10_000 && dataset.attendance.length <= 20_000);
  assert.ok(dataset.metadata.counts.corrected_attendance > 100);
  assert.ok(dataset.metadata.counts.public_upcoming_events >= 12);
  assert.ok(dataset.metadata.counts.event_states.completed > 0);
  assert.ok(dataset.metadata.counts.event_states.archived > 0);
  assert.ok(dataset.metadata.counts.event_states.upcoming > 0);
  assert.ok(dataset.events.some(event => !event.is_public));
  assert.ok(dataset.members.some(member => member.is_starred));
  assert.ok(dataset.members.some(member => !member.is_starred));
  for (const member of dataset.members) {
    assert.ok(dataset.member_branches.some(row => row.member_id === member.id), 'Every importable member has a church');
  }
  assert.ok(dataset.members.some(member => dataset.member_branches.filter(row => row.member_id === member.id).length > 1));
  assert.ok(dataset.members.some(member => dataset.member_ministries.filter(row => row.member_id === member.id).length > 1));
  assert.ok(dataset.members.some(member => !dataset.member_ministries.some(row => row.member_id === member.id)));
  for (const ministry of dataset.ministries) assert.ok(dataset.member_ministries.some(row => row.ministry_id === ministry.id));
});

test('fictional identities are unique, clearly labeled and do not contain real contacts', () => {
  unique(dataset.members, 'id');
  unique(dataset.members, 'member_number');
  unique(dataset.members, 'email');
  unique(dataset.members, 'qr_token');
  const normalizedNames = dataset.members.map(member => `${member.first_name} ${member.last_name}`.normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').toLowerCase());
  assert.equal(new Set(normalizedNames).size, 600);
  assert.equal(dataset.members[0].member_number, 'DEMO-0001');
  assert.equal(dataset.members.at(-1).member_number, 'DEMO-0600');
  for (const member of dataset.members) {
    assert.match(member.email, /^lifecity\.demo\.\d{4}@example\.com$/);
    assert.equal(member.mobile, null);
    assert.match(member.admin_note, /^DEMO DATA/);
    assert.match(member.qr_token, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.doesNotMatch(member.first_name + member.last_name, /\d/);
    assert.ok(Date.parse(member.created_at) <= AS_OF_STAMP);
  }
});

test('IDs, names, assignments and history reproduce while QR secrets rotate each build', () => {
  const again = buildDemoDataset({ asOf: AS_OF });
  assert.deepEqual(withoutTokens(again), withoutTokens(dataset));
  assert.ok(dataset.members.every((member, i) => member.qr_token !== again.members[i].qr_token));
  const small = buildDemoDataset({ asOf: AS_OF, memberCount: 20 });
  assert.deepEqual(small.members.map(member => member.id), dataset.members.slice(0, 20).map(member => member.id));
});

test('join references and all attendance pairs are valid and unique', () => {
  const members = new Map(dataset.members.map(member => [member.id, member]));
  const branches = new Set(dataset.branches.map(row => row.id));
  const ministries = new Set(dataset.ministries.map(row => row.id));
  const events = new Map(dataset.events.map(row => [row.id, row]));
  const pairs = new Set();
  for (const row of dataset.member_branches) {
    assert.ok(members.has(row.member_id)); assert.ok(branches.has(row.branch_id));
    const key = `${row.member_id}:${row.branch_id}`;
    assert.ok(!pairs.has(key)); pairs.add(key);
  }
  pairs.clear();
  for (const row of dataset.member_ministries) {
    assert.ok(members.has(row.member_id)); assert.ok(ministries.has(row.ministry_id));
    const key = `${row.member_id}:${row.ministry_id}`;
    assert.ok(!pairs.has(key)); pairs.add(key);
  }
  pairs.clear();
  unique(dataset.attendance, 'id');
  unique(dataset.events, 'id');
  unique(dataset.events, 'name');
  for (const row of dataset.attendance) {
    assert.ok(members.has(row.member_id)); assert.ok(events.has(row.event_id));
    const pair = `${row.member_id}:${row.event_id}`;
    assert.ok(!pairs.has(pair)); pairs.add(pair);
    assert.equal(row.scanned_by, null);
    assert.ok(['present', 'corrected'].includes(row.status));
    assert.match(row.notes, /^DEMO DATA/);
    assert.ok(!('report_snapshot' in row), 'Do not invent a deployed report snapshot structure');
    assert.deepEqual(Object.keys(row).sort(), ['id', 'member_id', 'event_id', 'checked_in_at', 'status', 'scanned_by', 'notes', 'created_at'].sort());
  }
});

test('check-ins respect actual time, event windows, member creation and archive chronology', () => {
  const members = new Map(dataset.members.map(row => [row.id, row]));
  const events = new Map(dataset.events.map(row => [row.id, row]));
  for (const row of dataset.attendance) {
    const event = events.get(row.event_id);
    const stamp = Date.parse(row.checked_in_at);
    assert.ok(stamp <= AS_OF_STAMP, 'No fabricated future check-in');
    assert.ok(stamp >= Date.parse(event.starts_at));
    assert.ok(stamp < Date.parse(event.ends_at));
    assert.ok(stamp >= Date.parse(members.get(row.member_id).created_at));
    assert.equal(row.created_at, row.checked_in_at);
  }
  for (const event of dataset.events) {
    assert.equal(Date.parse(event.ends_at) - Date.parse(event.starts_at), 3 * HOUR);
    assert.ok(Date.parse(event.created_at) <= AS_OF_STAMP);
    if (Date.parse(event.starts_at) > AS_OF_STAMP) assert.ok(!dataset.attendance.some(row => row.event_id === event.id));
    if (event.archived_at) {
      assert.ok(Date.parse(event.archived_at) > Date.parse(event.ends_at));
      assert.ok(Date.parse(event.archived_at) <= AS_OF_STAMP);
    }
  }
  assert.ok(dataset.attendance.some(row => members.get(row.member_id).status === 'inactive'), 'Inactive members keep older attendance history');
});

test('Sunday 1–2 PM Manila has a completed morning service, live scanner window and upcoming service', () => {
  const sunday = buildDemoDataset({ asOf: '2026-11-01T13:30:00+08:00' });
  const now = Date.parse(sunday.metadata.as_of);
  const live = sunday.events.find(event => event.id === sunday.scenarios.live_event.event_id);
  const morning = sunday.events.find(event => event.name.startsWith('Sunday Morning Celebration'));
  const afternoon = sunday.events.find(event => event.name === 'Sunday Celebration - 2026-11-01');
  assert.equal(live.starts_at, '2026-11-01T04:30:00.000Z');
  assert.equal(live.ends_at, '2026-11-01T07:30:00.000Z');
  assert.equal(eventState(live, now), 'in-progress');
  assert.equal(eventState(morning, now), 'completed');
  assert.equal(eventState(afternoon, now), 'upcoming');
  assert.ok(sunday.attendance.some(row => row.event_id === morning.id));
  assert.ok(sunday.attendance.every(row => Date.parse(row.checked_in_at) <= now));
  assert.ok(sunday.attendance.every(row => row.event_id !== live.id), 'All live QR demo members start unchecked');
  assert.ok(sunday.attendance.every(row => row.event_id !== afternoon.id));
  assert.equal(sunday.scenarios.successful_scan.member_number, 'DEMO-0001');
  assert.equal(sunday.scenarios.second_successful_scan.member_number, 'DEMO-0002');
  assert.equal(sunday.scenarios.duplicate_scan.member_number, 'DEMO-0001');
  assert.equal(sunday.scenarios.inactive_member.member_number, 'DEMO-0600');
  for (const [scenario, multipleChurches, multipleMinistries] of [
    [sunday.scenarios.multi_church_member, true, false], [sunday.scenarios.multi_ministry_member, false, true],
  ]) {
    if (multipleChurches) assert.ok(sunday.member_branches.filter(row => row.member_id === scenario.member_id).length > 1);
    if (multipleMinistries) assert.ok(sunday.member_ministries.filter(row => row.member_id === scenario.member_id).length > 1);
  }
  assert.ok(!sunday.member_ministries.some(row => row.member_id === sunday.scenarios.no_ministry_member.member_id));
});

test('Windows CSV files round-trip with supported import headers and unique values', () => {
  const files = buildDemoFiles(dataset);
  assert.deepEqual(Object.keys(files).sort(), ['dataset.json', 'member-import.csv', 'schedule.csv', 'scenarios.json', 'summary.json'].sort());
  assert.deepEqual(JSON.parse(files['dataset.json']), dataset);
  assert.deepEqual(JSON.parse(files['scenarios.json']), dataset.scenarios);
  const rows = parseCsv(files['member-import.csv']);
  assert.deepEqual(rows[0], ['first_name', 'last_name', 'email', 'mobile', 'churches', 'ministries', 'admin_note']);
  assert.equal(rows.length, 601);
  assert.ok(rows.every(row => row.length === 7));
  assert.equal(rows[1][0], dataset.members[0].first_name);
  assert.equal(rows[1][3], '');
  assert.ok(rows.slice(1).every(row => row[4].startsWith('LifeCity - ')));
  const schedule = parseCsv(files['schedule.csv']);
  assert.equal(schedule.length, 83);
  assert.ok(schedule.every(row => row.length === 8));
  assert.ok(schedule.slice(1).every(row => / \+08:00$/.test(row[1])));
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell('=SUM(1,2)'), '"\'=SUM(1,2)"');
  assert.equal(csvCell('  +command'), '"\'  +command"');
});

test('invalid generation dates, counts and CLI paths are rejected before writing', () => {
  for (const options of [
    { presentationDate: '2026-02-30' }, { presentationDate: '2026-10-31' },
    { presentationDate: '../dataset.json' }, { presentationDate: '2026-1-01' },
    { presentationTime: '24:00' }, { presentationTime: '12:60' }, { presentationTime: '1PM' },
    { memberCount: 19 }, { memberCount: 5001 }, { memberCount: 600.5 }, { memberCount: '600' },
    { asOf: '2026-10-28T13:00:00' }, { asOf: '2026-02-30T13:00:00Z' },
    { asOf: '2026-10-28T25:00:00Z' }, { asOf: '2026-10-10T13:00:00Z' },
  ]) assert.throws(() => buildDemoDataset({ asOf: AS_OF, ...options }), `Must reject ${JSON.stringify(options)}`);
  const script = fileURLToPath(new URL('./generate-demo-data.mjs', import.meta.url));
  for (const args of [['--output', '../outside'], ['--members', '12.5'], ['--members'], ['--members', '600', '--members', '700']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr);
    assert.ok(result.stderr.length > 0);
  }
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /12:30 Asia\/Manila/);
  assert.equal(GENERATED_DIR, path.resolve(path.dirname(script), '..', 'demo-data', 'generated'));
});

let failures = 0;
for (const { name, run } of tests) {
  try { run(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}\n${error.stack}`); }
}
if (failures) process.exitCode = 1;
else console.log(`All ${tests.length} demo fixture tests passed (${dataset.attendance.length.toLocaleString('en-US')} historical check-ins).`);
