import {
  affiliations,
  captureAttendance,
  createDemoState,
  defaultDemoAppearance,
  demoId,
} from './data';
import type { DemoRole, DemoRow, DemoState, DemoStorage } from './types';

export const DEMO_STORAGE_KEY = 'lifecity-demo:database:v1';
type Result = { data: any; error: { message: string; code: string } | null; count?: number | null };
type Options = { storage?: DemoStorage | null; now?: () => number };
const clone = <T>(value: T): T => structuredClone(value);
const good = (data: any, count?: number | null): Result => ({
  data: clone(data),
  error: null,
  ...(count === undefined ? {} : { count }),
});
const bad = (message: string, code = 'P0001'): Result => ({ data: null, error: { message, code } });
const compare = (a: any, b: any) =>
  typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a ?? '').localeCompare(String(b ?? ''), 'en', { numeric: true, sensitivity: 'base' });
const equal = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
const text = (row: any) => JSON.stringify(row).toLowerCase();
const id = () => crypto.randomUUID();
const day = 86_400_000;
let shared: ReturnType<typeof makeClient> | undefined;

export function createDemoClient(options?: Options) {
  if (options) return makeClient(options);
  return (shared ??= makeClient({}));
}
export function getDemoRole(): DemoRole {
  return createDemoClient().__demo.role();
}
export function setDemoRole(role: DemoRole) {
  createDemoClient().__demo.setRole(role);
}
export function resetDemoData() {
  createDemoClient().__demo.reset();
}

function makeClient(options: Options) {
  const clock = options.now ?? (() => Date.now());
  let storage: DemoStorage | null = null;
  try {
    storage =
      options.storage === undefined
        ? typeof sessionStorage === 'undefined'
          ? null
          : sessionStorage
        : options.storage;
  } catch {}
  let saved: any = null;
  try {
    saved = JSON.parse(storage?.getItem(DEMO_STORAGE_KEY) ?? 'null');
  } catch {}
  const savedDate = saved?.version === 1 ? Date.parse(saved.seededAt) : NaN;
  let state: DemoState = createDemoState(Number.isFinite(savedDate) ? savedDate : clock());
  let seedAttendance = new Map(state.tables.attendance.map((row) => [row.id, JSON.stringify(row)]));
  if (
    saved?.version === 1 &&
    Object.keys(state.tables).every(
      (key) => (key === 'attendance' && saved.compact) || Array.isArray(saved.tables?.[key]),
    )
  ) {
    if (saved.compact) {
      const removed = new Set(saved.attendance_delta?.removed ?? []),
        changed = saved.attendance_delta?.rows ?? [],
        changedIds = new Set(changed.map((row: DemoRow) => row.id));
      state = {
        ...state,
        ...saved,
        tables: {
          ...state.tables,
          ...saved.tables,
          attendance: [
            ...state.tables.attendance.filter(
              (row) => !removed.has(row.id) && !changedIds.has(row.id),
            ),
            ...changed,
          ],
        },
      };
    } else state = saved;
  }
  const listeners = new Set<(event: string, session: any) => void>(),
    channels = new Set<any>();
  let batchDepth = 0,
    dirty = false;
  function currentAccount() {
    return state.role === 'guest'
      ? null
      : state.tables.accounts.find(
          (row) =>
            row.user_id === demoId(6, state.role === 'owner' ? 1 : state.role === 'admin' ? 2 : 3),
        )!;
  }
  function session() {
    const account = currentAccount();
    return account
      ? {
          access_token: 'local-showcase-session',
          refresh_token: 'local-showcase-refresh',
          token_type: 'bearer',
          expires_in: 86400,
          expires_at: Math.floor(clock() / 1000) + 86400,
          user: {
            id: account.user_id,
            email: account.email,
            role: 'authenticated',
            aud: 'authenticated',
            app_metadata: { provider: 'demo' },
            user_metadata: { full_name: account.display_name },
            created_at: state.seededAt,
          },
        }
      : null;
  }
  function stamp() {
    return new Date(clock() + state.revision).toISOString();
  }
  function storageState() {
    const ids = new Set(state.tables.attendance.map((row) => row.id));
    return {
      ...state,
      compact: true,
      tables: { ...state.tables, attendance: undefined },
      attendance_delta: {
        removed: [...seedAttendance.keys()].filter((key) => !ids.has(key)),
        rows: state.tables.attendance.filter(
          (row) => seedAttendance.get(row.id) !== JSON.stringify(row),
        ),
      },
    };
  }
  function persist() {
    if (batchDepth) {
      dirty = true;
      return;
    }
    dirty = false;
    try {
      storage?.setItem(DEMO_STORAGE_KEY, JSON.stringify(storageState()));
    } catch {}
  }
  function notifyAuth(event = 'SIGNED_IN') {
    const value = session();
    queueMicrotask(() => listeners.forEach((listener) => listener(event, value)));
  }
  function emit(
    table: string,
    event = 'UPDATE',
    old: DemoRow | null = null,
    next: DemoRow | null = null,
  ) {
    for (const channel of channels)
      for (const binding of channel.bindings)
        if (binding.filter?.table === table || !binding.filter?.table)
          queueMicrotask(() =>
            binding.callback({
              eventType: event,
              table,
              schema: 'public',
              old: old ?? {},
              new: next ?? {},
            }),
          );
  }
  function save(
    table?: string,
    event = 'UPDATE',
    old: DemoRow | null = null,
    next: DemoRow | null = null,
  ) {
    state.revision++;
    persist();
    if (table) emit(table, event, old, next);
  }
  function guard(owner = false) {
    const a = currentAccount();
    if (
      !a ||
      a.status !== 'active' ||
      (owner ? a.role !== 'owner' : !['owner', 'admin'].includes(a.role))
    )
      throw Object.assign(new Error('This demo role does not have permission for that action.'), {
        code: '42501',
      });
    return a;
  }
  function actor() {
    const a = currentAccount();
    if (!a || a.status !== 'active')
      throw Object.assign(new Error('Sign in to the demo to continue.'), { code: '42501' });
    return a;
  }
  function log(
    category: string,
    action: string,
    target: DemoRow,
    before: DemoRow = {},
    after: DemoRow = {},
  ) {
    const a = currentAccount();
    state.tables.activity.unshift({
      id: id(),
      actor_id: a?.user_id ?? null,
      actor_name: a?.display_name ?? 'Demo Visitor',
      actor_email: a?.email ?? null,
      target_id: target.user_id ?? target.id ?? null,
      target_name:
        target.name ??
        target.display_name ??
        [target.first_name, target.last_name].filter(Boolean).join(' ') ??
        'Demo Record',
      target_email: target.email ?? null,
      target_member_number: target.member_number ?? null,
      category,
      action,
      created_at: stamp(),
      before_value: clone(before),
      after_value: clone(after),
    });
  }
  function eventState(event: DemoRow, asOf = clock()): string {
    return event.archived_at
      ? 'archived'
      : Date.parse(event.starts_at) > asOf
        ? 'upcoming'
        : Date.parse(
              event.ends_at ?? new Date(Date.parse(event.starts_at) + 3 * 3_600_000).toISOString(),
            ) > asOf
          ? 'in-progress'
          : 'completed';
  }
  function member(row: DemoRow) {
    return {
      ...row,
      member_ministries: state.tables.member_ministries
        .filter((link) => link.member_id === row.id)
        .map((link) => ({
          ...link,
          ministries: state.tables.ministries.find((n) => n.id === link.ministry_id) ?? null,
        })),
      member_branches: state.tables.member_branches
        .filter((link) => link.member_id === row.id)
        .map((link) => ({
          ...link,
          branches: state.tables.branches.find((n) => n.id === link.branch_id) ?? null,
        })),
    };
  }
  function event(row: DemoRow) {
    const attendance = state.tables.attendance.filter((a) => a.event_id === row.id);
    return {
      ...row,
      check_ins: attendance.length,
      unique_members: new Set(attendance.map((a) => a.member_id)).size,
      state: eventState(row),
      available_until:
        row.ends_at ?? new Date(Date.parse(row.starts_at) + 3 * 3_600_000).toISOString(),
    };
  }
  function decorate(table: string, row: DemoRow): DemoRow {
    return table === 'members'
      ? member(row)
      : table === 'events'
        ? event(row)
        : table === 'attendance'
          ? {
              ...row,
              members: state.tables.members.find((m) => m.id === row.member_id) ?? null,
              events: state.tables.events.find((e) => e.id === row.event_id) ?? null,
            }
          : clone(row);
  }
  function accountRow(a: DemoRow): DemoRow {
    const m = state.tables.members.find((m) => m.id === a.member_id);
    return {
      ...a,
      member_name: m ? `${m.first_name} ${m.last_name}` : null,
      member_number: m?.member_number ?? null,
    };
  }
  function profileValues(m: DemoRow) {
    return {
      first_name: m.first_name,
      last_name: m.last_name,
      email: m.email ?? '',
      churches: affiliations(state, m.id, 'churches')
        .map((n) => n.id)
        .sort(),
      ministries: affiliations(state, m.id, 'ministries')
        .map((n) => n.id)
        .sort(),
    };
  }
  function validateProfileChoices(values: DemoRow) {
    for (const [key, table] of [
      ['churches', 'branches'],
      ['ministries', 'ministries'],
    ] as const)
      if (
        !Array.isArray(values[key]) ||
        values[key].some((selected: string) => !state.tables[table].some((n) => n.id === selected))
      )
        throw new Error(
          'A selected church or ministry no longer exists. Refresh before reviewing this request.',
        );
  }
  function requireMember() {
    const a = actor(),
      m = state.tables.members.find((m) => m.id === a.member_id);
    if (!m) throw new Error('Link this demo account to a member profile first.');
    return m;
  }
  function setLinks(memberId: string, values: DemoRow) {
    for (const [kind, table, key] of [
      ['churches', 'member_branches', 'branch_id'],
      ['ministries', 'member_ministries', 'ministry_id'],
    ] as const)
      if (Array.isArray(values[kind])) {
        state.tables[table] = state.tables[table].filter((link) => link.member_id !== memberId);
        for (const selected of new Set<string>(values[kind]))
          state.tables[table].push({ member_id: memberId, [key]: selected });
      }
  }
  function page(rows: DemoRow[], p = 1, size = 25) {
    size = Math.max(1, Math.min(1000, Number(size) || 25));
    p = Math.max(1, Math.min(Math.ceil(rows.length / size) || 1, Number(p) || 1));
    return {
      rows: rows.slice((p - 1) * size, p * size),
      total: rows.length,
      page: p,
      page_size: size,
    };
  }
  function searchRows(rows: DemoRow[], query: any, fields?: string[]) {
    const words = String(query ?? '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    return words.length
      ? rows.filter((row) => {
          const haystack = fields
            ? fields
                .map((key) => String(row[key] ?? ''))
                .join(' ')
                .toLowerCase()
            : text(row);
          return words.every((word) => haystack.includes(word));
        })
      : rows;
  }
  function filteredMembers(p: DemoRow) {
    let rows = searchRows(state.tables.members, p.p_search, [
      'first_name',
      'last_name',
      'member_number',
      'email',
      'mobile',
    ]);
    if (p.p_status && p.p_status !== 'all')
      rows = rows.filter((m) => (p.p_status === 'vip' ? m.is_starred : m.status === p.p_status));
    if (p.p_ministry && p.p_ministry !== 'all')
      rows = rows.filter((m) => {
        const links = state.tables.member_ministries.filter((l) => l.member_id === m.id);
        return p.p_ministry === 'none'
          ? !links.length
          : links.some((l) => l.ministry_id === p.p_ministry);
      });
    if (p.p_church && p.p_church !== 'all')
      rows = rows.filter((m) =>
        state.tables.member_branches.some(
          (l) => l.member_id === m.id && l.branch_id === p.p_church,
        ),
      );
    return rows
      .slice()
      .sort((a, b) =>
        a.is_starred !== b.is_starred
          ? a.is_starred
            ? -1
            : 1
          : p.p_sort === 'added-oldest'
            ? compare(a.created_at, b.created_at)
            : p.p_sort === 'added-newest'
              ? compare(b.created_at, a.created_at)
              : p.p_sort === 'name-desc'
                ? compare(b.first_name + ' ' + b.last_name, a.first_name + ' ' + a.last_name)
                : compare(a.first_name + ' ' + a.last_name, b.first_name + ' ' + b.last_name),
      );
  }
  function filteredServices(p: DemoRow) {
    return searchRows(state.tables.events, p.p_search, ['name', 'location'])
      .filter(
        (e) =>
          (p.p_archive === 'all' ||
            (p.p_archive === 'archived' ? !!e.archived_at : !e.archived_at)) &&
          (!p.p_month ||
            new Date(Date.parse(e.starts_at) + 8 * 3_600_000).getUTCMonth() + 1 ===
              Number(p.p_month)) &&
          (!p.p_year ||
            new Date(Date.parse(e.starts_at) + 8 * 3_600_000).getUTCFullYear() ===
              Number(p.p_year)),
      )
      .sort((a, b) => compare(a.starts_at, b.starts_at) * (p.p_sort === 'oldest' ? 1 : -1));
  }
  function reportRows(asOf = clock()) {
    return state.tables.attendance
      .map((a) => {
        const m = state.tables.members.find((m) => m.id === a.member_id),
          e = state.tables.events.find((e) => e.id === a.event_id);
        if (!m || !e) return null;
        const snapshot = a.report_snapshot ?? captureAttendance(state, m, e, a.checked_in_at);
        return {
          ...snapshot,
          id: a.id,
          member_id: a.member_id,
          event_id: a.event_id,
          checked_in_at: a.checked_in_at,
          attendance_status: a.status ?? 'present',
          service_state: eventState(e, asOf),
          archived_at: e.archived_at,
          created_at: a.created_at ?? a.checked_in_at,
          scanned_by: a.scanned_by ?? null,
          notes: a.notes ?? snapshot.notes ?? null,
        };
      })
      .filter(Boolean) as DemoRow[];
  }
  function scopeMatches(e: DemoRow, scope: any, asOf = clock()) {
    const s = e.service_state ?? eventState(e, asOf);
    return scope === 'all'
      ? s !== 'upcoming'
      : scope === 'history'
        ? s === 'completed' || s === 'archived'
        : s === (scope ?? 'completed');
  }

  class Query implements PromiseLike<Result> {
    operation = 'select';
    payload: any;
    filters: ((row: DemoRow) => boolean)[] = [];
    sorts: { key: string; ascending: boolean }[] = [];
    start = 0;
    end = Infinity;
    singular = 0;
    head = false;
    counted = false;
    returning = false;
    private result?: Promise<Result>;
    readonly table: string;
    constructor(table: string) {
      this.table = table;
    }
    select(_columns = '*', options: DemoRow = {}) {
      this.returning = true;
      this.head = !!options.head;
      this.counted = !!options.count;
      return this;
    }
    insert(values: any) {
      this.operation = 'insert';
      this.payload = values;
      return this;
    }
    upsert(values: any) {
      this.operation = 'upsert';
      this.payload = values;
      return this;
    }
    update(values: any) {
      this.operation = 'update';
      this.payload = values;
      return this;
    }
    delete() {
      this.operation = 'delete';
      return this;
    }
    eq(key: string, value: any) {
      this.filters.push((row) => row[key] === value);
      return this;
    }
    neq(key: string, value: any) {
      this.filters.push((row) => row[key] !== value);
      return this;
    }
    is(key: string, value: any) {
      this.filters.push((row) => (value === null ? row[key] == null : row[key] === value));
      return this;
    }
    in(key: string, values: any[]) {
      this.filters.push((row) => values.includes(row[key]));
      return this;
    }
    not(key: string, operator: string, value: any) {
      this.filters.push((row) => (operator === 'is' ? row[key] !== value : row[key] !== value));
      return this;
    }
    gt(key: string, value: any) {
      this.filters.push((row) => row[key] > value);
      return this;
    }
    gte(key: string, value: any) {
      this.filters.push((row) => row[key] >= value);
      return this;
    }
    lt(key: string, value: any) {
      this.filters.push((row) => row[key] < value);
      return this;
    }
    lte(key: string, value: any) {
      this.filters.push((row) => row[key] <= value);
      return this;
    }
    ilike(key: string, value: string) {
      const needle = value.replaceAll('%', '').toLowerCase();
      this.filters.push((row) =>
        String(row[key] ?? '')
          .toLowerCase()
          .includes(needle),
      );
      return this;
    }
    order(key: string, options: DemoRow = {}) {
      this.sorts.push({ key, ascending: options.ascending !== false });
      return this;
    }
    range(start: number, end: number) {
      this.start = start;
      this.end = end;
      return this;
    }
    limit(size: number) {
      this.end = this.start + size - 1;
      return this;
    }
    single() {
      this.singular = 1;
      return this;
    }
    maybeSingle() {
      this.singular = 2;
      return this;
    }
    abortSignal(_signal: AbortSignal) {
      return this;
    }
    then<TResult1 = Result, TResult2 = never>(
      resolve?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
      reject?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return (this.result ??= Promise.resolve().then(() => this.execute())).then(resolve, reject);
    }
    execute(): Result {
      batchDepth++;
      try {
        const a = actor();
        if (
          ![
            'members',
            'events',
            'attendance',
            'branches',
            'ministries',
            'member_branches',
            'member_ministries',
          ].includes(this.table)
        )
          return bad('This demo table is not available.', '42P01');
        if (a.role === 'user')
          return bad('Use the member portal to read your linked profile.', '42501');
        if (this.operation !== 'select') guard();
        let table = state.tables[this.table],
          rows = table.filter((row) => this.filters.every((filter) => filter(row)));
        if (this.operation === 'insert' || this.operation === 'upsert') {
          const values = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((v) =>
            clone(v),
          );
          const pending: DemoRow[] = [];
          for (const value of values) {
            const row = { ...value };
            if (!['member_branches', 'member_ministries'].includes(this.table)) {
              row.id ??= id();
              row.created_at ??= stamp();
            }
            if (this.table === 'members') {
              row.qr_token ??= id();
              row.member_number ??= `M-${id().slice(0, 8).toUpperCase()}`;
              row.is_starred ??= false;
              row.status ??= 'active';
              row.admin_note ??= null;
              row.email ??= null;
              row.mobile ??= null;
              row.updated_at ??= stamp();
              if (!row.first_name?.trim() || !row.last_name?.trim())
                throw new Error('First and last names are required.');
            }
            if (this.table === 'events') {
              row.archived_at ??= null;
              row.ends_at ??= null;
              row.is_sunday_service ??= false;
              row.is_public ??= false;
              row.admin_note ??= null;
              row.updated_at ??= stamp();
              if (!row.name?.trim() || !Number.isFinite(Date.parse(row.starts_at)))
                throw new Error('A valid name and schedule are required.');
            }
            if (this.table === 'attendance') {
              const m = state.tables.members.find((m) => m.id === row.member_id),
                e = state.tables.events.find((e) => e.id === row.event_id);
              if (!m || !e) return bad('The member or service no longer exists.', '23503');
              if (m.status !== 'active') return bad('This member is inactive.');
              if (e.archived_at) return bad('This service is archived.');
              row.checked_in_at ??= stamp();
              row.status ??= 'present';
              row.scanned_by ??= a.user_id;
              row.report_snapshot ??= captureAttendance(state, m, e, row.checked_in_at);
            }
            if (['branches', 'ministries'].includes(this.table) && !String(row.name ?? '').trim())
              throw new Error('A name is required.');
            const all = [...table, ...pending],
              duplicate = all.find(
                (existing) =>
                  (row.id && existing.id === row.id) ||
                  (this.table === 'attendance' &&
                    existing.member_id === row.member_id &&
                    existing.event_id === row.event_id) ||
                  (['branches', 'ministries'].includes(this.table) &&
                    String(existing.name).toLowerCase() ===
                      String(row.name).trim().toLowerCase()) ||
                  (['member_branches', 'member_ministries'].includes(this.table) &&
                    existing.member_id === row.member_id &&
                    existing[this.table === 'member_branches' ? 'branch_id' : 'ministry_id'] ===
                      row[this.table === 'member_branches' ? 'branch_id' : 'ministry_id']),
              );
            if (duplicate) {
              if (this.operation === 'upsert') {
                pending.push({ ...duplicate, ...row });
                continue;
              }
              return bad('This record already exists.', '23505');
            }
            if (
              this.table === 'members' &&
              all.some(
                (existing) =>
                  existing.member_number === row.member_number ||
                  (row.email && existing.email?.toLowerCase() === row.email.toLowerCase()) ||
                  (row.mobile && existing.mobile === row.mobile),
              )
            )
              return bad('A member already uses this number or contact information.', '23505');
            if (
              ['member_branches', 'member_ministries'].includes(this.table) &&
              (!state.tables.members.some((m) => m.id === row.member_id) ||
                !state.tables[this.table === 'member_branches' ? 'branches' : 'ministries'].some(
                  (n) =>
                    n.id === row[this.table === 'member_branches' ? 'branch_id' : 'ministry_id'],
                ))
            )
              return bad('The member or directory entry no longer exists.', '23503');
            pending.push(row);
          }
          for (const row of pending) {
            const at = table.findIndex((existing) => existing.id && existing.id === row.id);
            if (at >= 0) table[at] = row;
            else table.push(row);
            log(
              this.table === 'attendance'
                ? 'attendance'
                : this.table === 'events'
                  ? 'services'
                  : 'directory',
              this.table === 'attendance'
                ? 'attendance_insert'
                : this.table === 'events'
                  ? 'service_insert'
                  : 'member_insert',
              row,
              {},
              row,
            );
            save(this.table, 'INSERT', null, row);
          }
          rows = pending;
        } else if (this.operation === 'update') {
          const projected = table.map((row) =>
            rows.includes(row) ? { ...row, ...this.payload } : row,
          );
          for (const row of projected) {
            if (
              this.table === 'members' &&
              projected.some(
                (other) =>
                  other !== row &&
                  other.id !== row.id &&
                  ((row.email &&
                    String(other.email ?? '').toLowerCase() === String(row.email).toLowerCase()) ||
                    (row.mobile && other.mobile === row.mobile) ||
                    (row.member_number && other.member_number === row.member_number)),
              )
            )
              return bad('A member already uses this number or contact information.', '23505');
            if (
              ['branches', 'ministries'].includes(this.table) &&
              projected.some(
                (other) =>
                  other !== row &&
                  other.id !== row.id &&
                  String(other.name).trim().toLowerCase() === String(row.name).trim().toLowerCase(),
              )
            )
              return bad('That directory name already exists.', '23505');
          }
          for (const row of rows) {
            const old = clone(row);
            Object.assign(row, clone(this.payload), { updated_at: stamp() });
            log(
              this.table === 'events' ? 'services' : 'profiles',
              this.table === 'events' ? 'service_update' : 'member_update',
              row,
              old,
              row,
            );
            save(this.table, 'UPDATE', old, row);
          }
        } else if (this.operation === 'delete') {
          if (
            this.table === 'events' &&
            rows.some((row) => state.tables.attendance.some((a) => a.event_id === row.id))
          )
            return bad('Archive services with attendance instead.', '23503');
          if (
            this.table === 'members' &&
            rows.some((row) => state.tables.attendance.some((a) => a.member_id === row.id))
          )
            return bad('This member has attendance history and cannot be deleted.', '23503');
          if (['branches', 'ministries'].includes(this.table)) {
            const link = this.table === 'branches' ? 'member_branches' : 'member_ministries',
              key = this.table === 'branches' ? 'branch_id' : 'ministry_id';
            if (rows.some((row) => state.tables[link].some((l) => l[key] === row.id)))
              return bad('This entry is assigned to members.', '23503');
          }
          state.tables[this.table] = table.filter((row) => !rows.includes(row));
          if (this.table === 'members') {
            for (const link of ['member_branches', 'member_ministries'])
              state.tables[link] = state.tables[link].filter(
                (l) => !rows.some((m) => m.id === l.member_id),
              );
            for (const account of state.tables.accounts)
              if (rows.some((m) => m.id === account.member_id)) account.member_id = null;
          }
          for (const row of rows) {
            log(
              this.table === 'events' ? 'services' : 'directory',
              this.table === 'events' ? 'service_delete' : 'member_delete',
              row,
              row,
              {},
            );
            save(this.table, 'DELETE', row, null);
          }
        }
        const count = rows.length;
        rows = rows
          .slice()
          .sort((a, b) => {
            for (const sort of this.sorts) {
              const n = compare(a[sort.key], b[sort.key]);
              if (n) return n * (sort.ascending ? 1 : -1);
            }
            return 0;
          })
          .slice(this.start, this.end === Infinity ? undefined : this.end + 1)
          .map((row) => decorate(this.table, row));
        if (this.head) return good(null, this.counted ? count : undefined);
        if (this.singular) {
          if (rows.length > 1 || (this.singular === 1 && !rows.length))
            return bad('Expected one row.', 'PGRST116');
          return good(rows[0] ?? null, this.counted ? count : undefined);
        }
        return good(
          this.operation === 'select' || this.returning ? rows : null,
          this.counted ? count : undefined,
        );
      } catch (error) {
        return bad((error as Error).message, (error as any).code ?? 'P0001');
      } finally {
        batchDepth--;
        if (!batchDepth && dirty) persist();
      }
    }
  }

  async function rpc(name: string, p: DemoRow = {}): Promise<Result> {
    try {
      return good(runRpc(name, p));
    } catch (error) {
      return bad((error as Error).message, (error as any).code ?? 'P0001');
    }
  }
  function runRpc(name: string, p: DemoRow): any {
    if (name === 'lc_get_appearance_v2' || name === 'lc_get_appearance') return state.appearance;
    if (name === 'lc_my_account') {
      const a = currentAccount();
      return a ? accountRow(a) : null;
    }
    if (name === 'lc_guest_services') {
      const rows = state.tables.events
        .filter(
          (e) =>
            e.is_public && !e.archived_at && ['upcoming', 'in-progress'].includes(eventState(e)),
        )
        .sort((a, b) => compare(a.starts_at, b.starts_at))
        .map((e) => ({
          id: e.id,
          name: e.name,
          starts_at: e.starts_at,
          location: e.location,
          is_sunday_service: e.is_sunday_service,
          state: eventState(e),
        }));
      const result = page(rows, p.p_page, 9);
      return { ...result, service_total: rows.length, server_time: stamp() };
    }
    return runAuthenticatedRpc(name, p);
  }
  function runAuthenticatedRpc(name: string, p: DemoRow): any {
    actor();
    switch (name) {
      case 'lc_members_page': {
        guard();
        const rows = filteredMembers(p).map(member);
        return {
          ...page(rows, p.p_page, p.p_size),
          registered: state.tables.members.length,
          active: state.tables.members.filter((m) => m.status === 'active').length,
          ministries: state.tables.ministries,
          branches: state.tables.branches,
          ministry_counts: Object.fromEntries(
            state.tables.ministries.map((n) => [
              n.id,
              state.tables.member_ministries.filter((l) => l.ministry_id === n.id).length,
            ]),
          ),
          branch_counts: Object.fromEntries(
            state.tables.branches.map((n) => [
              n.id,
              state.tables.member_branches.filter((l) => l.branch_id === n.id).length,
            ]),
          ),
        };
      }
      case 'lc_export_members_v2':
        guard();
        return {
          rows: filteredMembers(p).map((m) => ({
            ...m,
            churches: affiliations(state, m.id, 'churches'),
            ministries: affiliations(state, m.id, 'ministries'),
          })),
          as_of: stamp(),
        };
      case 'lc_services_page': {
        guard();
        return {
          ...page(filteredServices(p).map(event), p.p_page, p.p_size),
          registered: state.tables.events.length,
          years: [
            ...new Set(
              state.tables.events.map((e) =>
                new Date(Date.parse(e.starts_at) + 8 * 3_600_000).getUTCFullYear(),
              ),
            ),
          ].sort(),
          active_members: state.tables.members.filter((m) => m.status === 'active').length,
        };
      }
      case 'lc_export_services_v2':
        guard();
        return { rows: filteredServices(p).map(event), as_of: stamp() };
      case 'lc_scanner_services':
        guard();
        return {
          rows: state.tables.events
            .filter((e) => !e.archived_at && ['upcoming', 'in-progress'].includes(eventState(e)))
            .sort((a, b) => compare(a.starts_at, b.starts_at))
            .map(event),
          server_time: stamp(),
        };
      case 'lc_scanner_member_search': {
        guard();
        const rows = searchRows(state.tables.members, p.p_search, [
          'first_name',
          'last_name',
          'member_number',
          'email',
          'mobile',
        ]);
        return { rows: rows.slice(0, 25), total: rows.length };
      }
      case 'lc_delete_empty_ministry': {
        guard();
        const row = state.tables.ministries.find((n) => n.id === p.p_id);
        if (!row) throw new Error('Ministry no longer exists.');
        if (state.tables.member_ministries.some((l) => l.ministry_id === row.id))
          throw Object.assign(new Error('This ministry is assigned to members.'), {
            code: '23503',
          });
        state.tables.ministries = state.tables.ministries.filter((n) => n !== row);
        log('assignments', 'ministry_delete', row, row, {});
        save('ministries', 'DELETE', row, null);
        return row;
      }
      case 'lc_save_appearance_v2': {
        guard(true);
        if (p.p_revision !== state.appearance.revision)
          throw new Error('The palette changed. Refresh before saving.');
        state.appearance = p.p_default
          ? defaultDemoAppearance(state.appearance.revision + 1)
          : {
              ...state.appearance,
              use_default: false,
              tokens: clone(p.p_tokens),
              primary_color: p.p_tokens.primary,
              secondary_color: p.p_tokens.secondary,
              highlight_color: p.p_tokens.highlight,
              revision: state.appearance.revision + 1,
              updated_at: stamp(),
            };
        log(
          'appearance',
          p.p_default ? 'restore_defaults' : 'save_appearance',
          { name: 'Workspace Appearance' },
          {},
          state.appearance,
        );
        save('app_appearance');
        return state.appearance;
      }
      default:
        return runFeatureRpc(name, p);
    }
  }
  function runFeatureRpc(name: string, p: DemoRow): any {
    switch (name) {
      case 'lc_dashboard_snapshot': {
        guard();
        const now = clock(),
          period = p.p_period ?? 'all',
          start =
            period === 'all'
              ? -Infinity
              : Date.parse(
                  new Date(now + 8 * 3_600_000).toISOString().slice(0, period === 'month' ? 7 : 4) +
                    (period === 'month' ? '-01' : '-01-01') +
                    'T00:00:00+08:00',
                );
        const events = state.tables.events.filter((e) => Date.parse(e.starts_at) >= start),
          attendance = state.tables.attendance.filter((a) => Date.parse(a.checked_in_at) >= start),
          completed = state.tables.events
            .filter((e) => !e.archived_at && eventState(e) === 'completed')
            .sort((a, b) => compare(b.starts_at, a.starts_at)),
          latest = completed[0] ?? null,
          sunday = completed.find((e) => e.is_sunday_service) ?? null,
          upcoming =
            state.tables.events
              .filter((e) => !e.archived_at && eventState(e) === 'upcoming')
              .sort((a, b) => compare(a.starts_at, b.starts_at))[0] ?? null,
          scanner = state.tables.events.find((e) => e.id === p.p_scanner_event_id) ?? null;
        return {
          period,
          as_of: stamp(),
          total_members: state.tables.members.length,
          active_members: state.tables.members.filter((m) => m.status === 'active').length,
          total_events: events.length,
          total_check_ins: attendance.length,
          latest_event: latest,
          latest_event_check_ins: latest ? event(latest).check_ins : 0,
          latest_sunday_service: sunday,
          latest_sunday_check_ins: sunday ? event(sunday).check_ins : 0,
          upcoming_event: upcoming,
          active_scanner_event: scanner,
          active_scanner_state: scanner ? eventState(scanner) : null,
          active_scanner_check_ins: scanner ? event(scanner).check_ins : 0,
          recent_check_ins: state.tables.attendance
            .slice()
            .sort((a, b) => compare(b.checked_in_at, a.checked_in_at))
            .slice(0, 8)
            .map((a) => ({
              id: a.id,
              event_id: a.event_id,
              checked_in_at: a.checked_in_at,
              members: state.tables.members.find((m) => m.id === a.member_id) ?? null,
              events: state.tables.events.find((e) => e.id === a.event_id) ?? null,
            })),
        };
      }
      case 'attendance_catalog_v4': {
        guard();
        const asOf = p.p_as_of ? Date.parse(p.p_as_of) : clock(),
          events = state.tables.events.filter((e) => scopeMatches(e, p.p_scope, asOf));
        const rows =
          p.p_kind === 'events'
            ? events.map((e) => ({
                id: e.id,
                name: e.name,
                service_date: e.starts_at,
                service_state: eventState(e, asOf),
              }))
            : state.tables[p.p_kind === 'churches' ? 'branches' : 'ministries'];
        return rows.slice(
          Number(p.p_offset) || 0,
          (Number(p.p_offset) || 0) + (Number(p.p_limit) || 500),
        );
      }
      case 'attendance_report_v4': {
        guard();
        const f = p.p_filters ?? {},
          asOf = p.p_as_of ? Date.parse(p.p_as_of) : clock();
        let rows = reportRows(asOf).filter(
          (r) =>
            Date.parse(r.checked_in_at) <= asOf &&
            scopeMatches(r, f.scope, asOf) &&
            (!f.event_id || r.event_id === f.event_id) &&
            (!f.church_id || r.churches.some((n: DemoRow) => n.id === f.church_id)) &&
            (!f.ministry_id || r.ministries.some((n: DemoRow) => n.id === f.ministry_id)) &&
            (!f.sunday_only || r.sunday_service),
        );
        if (f.query)
          rows = searchRows(rows, f.query, [
            'first_name',
            'last_name',
            'member_number',
            'email',
            'mobile',
          ]);
        rows = rows.filter((r) => {
          const date = new Date(Date.parse(r.checked_in_at) + 8 * 3_600_000)
            .toISOString()
            .slice(0, 10);
          return (!f.start || date >= f.start) && (!f.end || date <= f.end);
        });
        const sortKey = (r: DemoRow) =>
          p.p_sort === 'member'
            ? r.first_name + ' ' + r.last_name
            : p.p_sort === 'church'
              ? r.churches.map((n: DemoRow) => n.name).join(', ')
              : p.p_sort === 'ministry'
                ? r.ministries.map((n: DemoRow) => n.name).join(', ')
                : p.p_sort === 'service'
                  ? r.service_name
                  : r.checked_in_at;
        rows.sort(
          (a, b) =>
            (compare(sortKey(a), sortKey(b)) || compare(a.id, b.id)) *
            (p.p_desc === false ? 1 : -1),
        );
        const counts = new Map<string, number>();
        for (const r of rows)
          for (const c of r.churches) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
        const top = [...counts].sort((a, b) => b[1] - a[1]),
          best = top[0];
        return {
          report_version: 4,
          revision: String(state.revision),
          total: rows.length,
          members: new Set(rows.map((r) => r.member_id)).size,
          services: new Set(rows.map((r) => r.event_id)).size,
          top_group: best
            ? {
                name: best[0],
                kind: 'church',
                check_ins: best[1],
                ties: top.filter((c) => c[1] === best[1]).length - 1,
              }
            : null,
          rows: rows.slice(
            Number(p.p_offset) || 0,
            (Number(p.p_offset) || 0) + (Number(p.p_limit) || 25),
          ),
        };
      }
      case 'lc_remove_attendance_with_undo': {
        const a = guard(),
          row = state.tables.attendance.find((r) => r.id === p.p_id);
        if (!row) throw new Error('This check-in no longer exists.');
        const token = id();
        state.undo[token] = { row: clone(row), actor: a.user_id, expires: clock() + 15 * 60_000 };
        state.tables.attendance = state.tables.attendance.filter((r) => r !== row);
        log('attendance', 'attendance_delete', row, row, {});
        save('attendance', 'DELETE', row, null);
        return { attendance: row, undo_token: token };
      }
      case 'lc_restore_attendance': {
        const a = guard(),
          receipt = state.undo[p.p_undo_token];
        if (!receipt || receipt.actor !== a.user_id || receipt.expires < clock())
          throw new Error('This Undo has expired.');
        const r = receipt.row,
          existing = state.tables.attendance.find(
            (row) =>
              row.id === r.id || (row.member_id === r.member_id && row.event_id === r.event_id),
          );
        if (existing) {
          if (equal(existing, r)) return existing;
          throw new Error('A newer check-in exists. Undo will not overwrite it.');
        }
        if (
          !state.tables.members.some((m) => m.id === r.member_id) ||
          !state.tables.events.some((e) => e.id === r.event_id)
        )
          throw new Error('The member or service is no longer available.');
        state.tables.attendance.push(clone(r));
        log('attendance', 'attendance_insert', r, {}, r);
        save('attendance', 'INSERT', null, r);
        return r;
      }
      case 'lc_my_member_portal': {
        const m = requireMember(),
          services = state.tables.events
            .filter(
              (e) =>
                e.is_public &&
                !e.archived_at &&
                ['upcoming', 'in-progress'].includes(eventState(e)),
            )
            .sort((a, b) => compare(a.starts_at, b.starts_at))
            .map((e) => ({
              id: e.id,
              name: e.name,
              starts_at: e.starts_at,
              location: e.location,
              is_sunday_service: e.is_sunday_service,
              state: eventState(e),
              available_until:
                e.ends_at ?? new Date(Date.parse(e.starts_at) + 3 * 3_600_000).toISOString(),
            })),
          result = page(services, p.p_service_page, 9);
        return {
          profile: {
            id: m.id,
            member_number: m.member_number,
            first_name: m.first_name,
            last_name: m.last_name,
            email: m.email,
            mobile: m.mobile,
            status: m.status,
            qr_token: m.qr_token,
            churches: affiliations(state, m.id, 'churches').map((n) => n.name),
            ministries: affiliations(state, m.id, 'ministries').map((n) => n.name),
          },
          services: result.rows,
          service_total: result.total,
          service_page: result.page,
          server_time: stamp(),
        };
      }
      case 'lc_my_attendance_history': {
        const m = requireMember();
        let rows = reportRows()
          .filter(
            (r) =>
              r.member_id === m.id &&
              scopeMatches(r, 'history') &&
              (!p.p_search ||
                r.service_name.toLowerCase().includes(String(p.p_search).toLowerCase())) &&
              (!p.p_start ||
                new Date(Date.parse(r.checked_in_at) + 8 * 3_600_000).toISOString().slice(0, 10) >=
                  p.p_start) &&
              (!p.p_end ||
                new Date(Date.parse(r.checked_in_at) + 8 * 3_600_000).toISOString().slice(0, 10) <=
                  p.p_end),
          )
          .sort(
            (a, b) => compare(a.checked_in_at, b.checked_in_at) * (p.p_order === 'oldest' ? 1 : -1),
          );
        const result = page(rows, p.p_page, 20);
        return {
          ...result,
          member_id: m.id,
          services: new Set(rows.map((r) => r.event_id)).size,
          latest:
            rows
              .map((r) => r.checked_in_at)
              .sort()
              .at(-1) ?? null,
          rows: result.rows.map((r) => ({
            id: r.id,
            event_id: r.event_id,
            checked_in_at: r.checked_in_at,
            service_name: r.service_name,
            service_date: r.service_date,
            service_location: r.service_location,
            archived: !!r.archived_at,
          })),
        };
      }
      case 'lc_profile_editor': {
        const m = requireMember();
        return {
          member_id: m.id,
          values: profileValues(m),
          mobile: m.mobile ?? '',
          requests: state.tables.profile_requests
            .filter((r) => r.user_id === actor().user_id)
            .sort((a, b) => compare(b.created_at, a.created_at)),
          churches: state.tables.branches,
          ministries: state.tables.ministries,
        };
      }
      case 'lc_update_my_mobile': {
        const m = requireMember();
        if (m.id !== p.p_member_id || String(m.mobile ?? '') !== String(p.p_expected_mobile ?? ''))
          throw new Error('The saved mobile number changed. Refresh first.');
        const next = String(p.p_mobile ?? '').trim() || null;
        if (next && !/^09\d{9}$/.test(next))
          throw new Error('Use a valid 11-digit mobile number starting with 09.');
        if (next && state.tables.members.some((n) => n.id !== m.id && n.mobile === next))
          throw new Error('This mobile number is already in use.');
        const before = { mobile: m.mobile };
        m.mobile = next;
        m.updated_at = stamp();
        log('profiles', 'mobile_updated', m, before, { mobile: next });
        save('members');
        return { mobile: m.mobile };
      }
      case 'lc_request_profile_changes': {
        const m = requireMember();
        if (m.id !== p.p_member_id || !equal(profileValues(m), p.p_expected))
          throw new Error('The profile changed. Refresh before requesting an update.');
        if (
          state.tables.profile_requests.some(
            (r) => r.user_id === actor().user_id && r.status === 'pending',
          )
        )
          throw new Error('Review or cancel the pending request first.');
        const row = {
          id: id(),
          user_id: actor().user_id,
          member_id: m.id,
          base: profileValues(m),
          requested: clone(p.p_requested),
          status: 'pending',
          review_note: '',
          created_at: stamp(),
          updated_at: stamp(),
        };
        state.tables.profile_requests.unshift(row);
        log('profiles', 'profile_request_submitted', m, {}, row.requested);
        save();
        return row;
      }
      case 'lc_cancel_profile_request': {
        const row = state.tables.profile_requests.find(
          (r) => r.id === p.p_id && r.user_id === actor().user_id,
        );
        if (!row || row.status !== 'pending' || row.updated_at !== p.p_expected_updated_at)
          throw new Error('The request changed. Refresh first.');
        row.status = 'cancelled';
        row.updated_at = stamp();
        save();
        return row;
      }
      case 'lc_owner_profile_requests_search': {
        guard(true);
        const all: DemoRow[] = state.tables.profile_requests.map((r) => {
          const a = state.tables.accounts.find((a) => a.user_id === r.user_id),
            m = state.tables.members.find((m) => m.id === r.member_id);
          return {
            ...r,
            current_values: m ? profileValues(m) : null,
            account_email: a?.email,
            account_status: a?.status,
            linked_member_id: a?.member_id,
          };
        });
        return {
          ...page(
            searchRows(
              all.filter((r) => p.p_status === 'all' || r.status === p.p_status),
              p.p_search,
            ),
            p.p_page,
            20,
          ),
          churches: state.tables.branches,
          ministries: state.tables.ministries,
        };
      }
      case 'lc_review_profile_request': {
        guard(true);
        const row = state.tables.profile_requests.find((r) => r.id === p.p_id),
          a = state.tables.accounts.find((a) => a.user_id === row?.user_id),
          m = state.tables.members.find((m) => m.id === row?.member_id);
        if (!row || row.status !== 'pending' || row.updated_at !== p.p_expected_updated_at)
          throw new Error('The request changed. Refresh before reviewing.');
        if (p.p_decision === 'approved') {
          if (!m || a?.status !== 'active' || a.member_id !== m.id)
            throw new Error('The account or profile changed. Refresh before approving.');
          const current = profileValues(m),
            changed = Object.keys(row.requested).filter(
              (key) => !equal(row.base[key], row.requested[key]),
            );
          if (changed.some((key) => !equal((current as DemoRow)[key], row.base[key])))
            throw new Error('A requested field changed. Ask for a new request.');
          const next = {
            ...current,
            ...Object.fromEntries(changed.map((key) => [key, row.requested[key]])),
          };
          if (!next.first_name?.trim() || !next.last_name?.trim() || !next.churches?.length)
            throw new Error('Required profile details are missing.');
          if (
            next.email &&
            state.tables.members.some((n) => n.id !== m.id && n.email === next.email)
          )
            throw new Error('The requested email is already in use.');
          validateProfileChoices(next);
          Object.assign(m, {
            first_name: next.first_name,
            last_name: next.last_name,
            email: next.email || null,
            updated_at: stamp(),
          });
          setLinks(m.id, next);
        }
        row.status = p.p_decision === 'approved' ? 'approved' : 'declined';
        row.review_note = p.p_note ?? '';
        row.updated_at = stamp();
        log(
          'profiles',
          row.status === 'approved' ? 'profile_request_approved' : 'profile_request_declined',
          m ?? { id: row.member_id, name: 'Removed Demo Member' },
          row.base,
          row.requested,
        );
        save('members');
        return row;
      }
      case 'lc_my_member_requests':
        return state.tables.member_requests
          .filter((r) => r.user_id === actor().user_id)
          .sort((a, b) => compare(b.created_at, a.created_at));
      case 'lc_submit_member_request': {
        const a = actor();
        if (a.member_id) throw new Error('This account already has a linked member.');
        if (
          state.tables.member_requests.some(
            (r) => r.user_id === a.user_id && r.status === 'pending',
          )
        )
          throw new Error('This account already has a pending request.');
        const row = {
          id: id(),
          user_id: a.user_id,
          full_name: p.p_full_name,
          member_number: p.p_member_number,
          contact: p.p_contact,
          church: p.p_church,
          status: 'pending',
          review_note: '',
          created_at: stamp(),
          updated_at: stamp(),
        };
        state.tables.member_requests.unshift(row);
        save();
        return row;
      }
      case 'lc_cancel_member_request': {
        const row = state.tables.member_requests.find(
          (r) => r.id === p.p_id && r.user_id === actor().user_id,
        );
        if (!row || row.status !== 'pending' || row.updated_at !== p.p_expected_updated_at)
          throw new Error('The request changed. Refresh first.');
        row.status = 'cancelled';
        row.updated_at = stamp();
        save();
        return row;
      }
      case 'lc_owner_member_requests_search': {
        guard(true);
        const rows: DemoRow[] = state.tables.member_requests.map((r) => {
          const a = state.tables.accounts.find((a) => a.user_id === r.user_id);
          return {
            ...r,
            email: a?.email,
            account_status: a?.status,
            account_updated_at: a?.updated_at,
            linked_member_id: a?.member_id,
          };
        });
        return {
          ...page(
            searchRows(
              rows.filter((r) => p.p_status === 'all' || r.status === p.p_status),
              p.p_search,
            ),
            p.p_page,
            25,
          ),
          pending: rows.filter((r) => r.status === 'pending').length,
        };
      }
      case 'lc_owner_member_candidates': {
        guard(true);
        const rows = searchRows(state.tables.members, p.p_search, [
          'first_name',
          'last_name',
          'member_number',
          'email',
          'mobile',
        ]).map((m) => ({
          ...m,
          already_linked: state.tables.accounts.some((a) => a.member_id === m.id),
        }));
        return page(rows, p.p_page, 25);
      }
      case 'lc_review_member_request': {
        guard(true);
        const row = state.tables.member_requests.find((r) => r.id === p.p_id),
          a = state.tables.accounts.find((a) => a.user_id === row?.user_id),
          m = state.tables.members.find((m) => m.id === p.p_member_id);
        if (!row || row.status !== 'pending' || row.updated_at !== p.p_expected_updated_at)
          throw new Error('The request changed. Refresh first.');
        if (p.p_decision === 'approved') {
          if (
            !a ||
            a.updated_at !== p.p_expected_account_updated_at ||
            a.status !== 'active' ||
            a.member_id
          )
            throw new Error('The account changed. Refresh before approving.');
          if (
            !m ||
            m.updated_at !== p.p_expected_member_updated_at ||
            state.tables.accounts.some((n) => n.member_id === m.id)
          )
            throw new Error('This member is linked or has changed. Choose a different candidate.');
          a.member_id = m.id;
          a.updated_at = stamp();
          log('links', 'link_member', m, {}, a);
        }
        row.status = p.p_decision === 'approved' ? 'approved' : 'declined';
        row.updated_at = stamp();
        row.review_note = p.p_note ?? '';
        save();
        return row;
      }
      case 'lc_owner_accounts_page': {
        guard(true);
        let rows = state.tables.accounts
          .map(accountRow)
          .filter(
            (a) =>
              (!p.p_role || p.p_role === 'all' || a.role === p.p_role) &&
              (!p.p_status || p.p_status === 'all' || a.status === p.p_status) &&
              (!p.p_link ||
                p.p_link === 'all' ||
                (p.p_link === 'linked' ? !!a.member_id : !a.member_id)),
          );
        return page(searchRows(rows, p.p_search), p.p_page, p.p_size);
      }
      case 'lc_owner_change_access': {
        const a = guard(true),
          target = state.tables.accounts.find((a) => a.user_id === p.p_user_id);
        if (!target || target.role === 'owner' || target.user_id === a.user_id)
          throw new Error('Owner access is protected.');
        if (target.updated_at !== p.p_expected_updated_at)
          throw new Error('The account changed. Refresh first.');
        const before = clone(target);
        if (p.p_action === 'grant_admin') target.role = 'admin';
        else if (p.p_action === 'revoke_admin') target.role = 'user';
        else if (p.p_action === 'suspend') target.status = 'suspended';
        else if (p.p_action === 'reactivate') target.status = 'active';
        else throw new Error('Unknown access action.');
        target.updated_at = stamp();
        log('access', p.p_action, target, before, target);
        save();
        return target;
      }
      case 'lc_owner_set_member_link': {
        guard(true);
        const target = state.tables.accounts.find((a) => a.user_id === p.p_user_id),
          m = state.tables.members.find((m) => m.id === p.p_member_id);
        if (!target || target.updated_at !== p.p_expected_updated_at)
          throw new Error('The account changed. Refresh first.');
        if (
          p.p_member_id &&
          (!m ||
            m.updated_at !== p.p_expected_member_updated_at ||
            state.tables.accounts.some((a) => a.user_id !== target.user_id && a.member_id === m.id))
        )
          throw new Error('The selected member is linked or has changed.');
        const before = clone(target);
        target.member_id = p.p_member_id ?? null;
        target.updated_at = stamp();
        log('links', target.member_id ? 'link_member' : 'unlink_member', target, before, target);
        save();
        return target;
      }
      case 'lc_submit_feedback': {
        const a = actor();
        if (state.tables.feedback.some((r) => r.request_id === p.p_request_id))
          return { submitted: true };
        if (!String(p.p_subject ?? '').trim() || !String(p.p_message ?? '').trim())
          throw new Error('A subject and message are required.');
        const row = {
          id: id(),
          request_id: p.p_request_id,
          user_id: a.user_id,
          subject: String(p.p_subject).slice(0, 200),
          message: String(p.p_message).slice(0, 5000),
          category: p.p_category,
          anonymous: !!p.p_anonymous,
          page: p.p_page,
          status: 'new',
          created_at: stamp(),
          updated_at: stamp(),
          status_revision: 1,
          read_revision: 1,
        };
        state.tables.feedback.unshift(row);
        save();
        return { submitted: true, id: row.id };
      }
      case 'lc_feedback_page': {
        guard(true);
        const rows = searchRows(
          state.tables.feedback.filter(
            (r) =>
              (p.p_status === 'all' || r.status === p.p_status) &&
              (p.p_category === 'all' || r.category === p.p_category),
          ),
          p.p_query,
          ['subject', 'message'],
        ).map((r) => {
          const a = state.tables.accounts.find((a) => a.user_id === r.user_id);
          return {
            ...r,
            identity: r.anonymous
              ? null
              : { name: a?.display_name ?? 'Demo Member', email: a?.email ?? null },
          };
        });
        return page(rows, p.p_page, 20);
      }
      case 'lc_feedback_identity': {
        guard(true);
        const row = state.tables.feedback.find((r) => r.id === p.p_id),
          a = state.tables.accounts.find((a) => a.user_id === row?.user_id);
        if (!row) throw new Error('Feedback no longer exists.');
        return { name: a?.display_name ?? 'Demo Member', email: a?.email ?? null };
      }
      case 'lc_feedback_set_status': {
        guard(true);
        const row = state.tables.feedback.find((r) => r.id === p.p_id);
        if (!row || !['new', 'reviewing', 'resolved', 'closed'].includes(p.p_status))
          throw new Error('Choose a valid ticket status.');
        row.status = p.p_status;
        row.status_revision++;
        row.updated_at = stamp();
        save();
        return row;
      }
      case 'lc_my_feedback': {
        const rows = state.tables.feedback
          .filter((r) => r.user_id === actor().user_id)
          .map((r) => ({ ...r, unread: r.status_revision > r.read_revision }));
        return { ...page(rows, p.p_page, 10), unread: rows.filter((r) => r.unread).length };
      }
      case 'lc_read_feedback': {
        const row = state.tables.feedback.find(
          (r) => r.id === p.p_id && r.user_id === actor().user_id,
        );
        if (!row) throw new Error('This ticket is unavailable.');
        row.read_revision = Math.min(p.p_revision, row.status_revision);
        save();
        return row;
      }
      case 'lc_owner_activity':
      case 'lc_export_activity': {
        guard(true);
        let rows = searchRows(state.tables.activity, p.p_search)
          .filter(
            (r) =>
              (!p.p_category || p.p_category === 'all' || r.category === p.p_category) &&
              (!p.p_days || Date.parse(r.created_at) >= clock() - Number(p.p_days) * day),
          )
          .sort((a, b) => compare(a.created_at, b.created_at) * (p.p_oldest ? 1 : -1));
        return name === 'lc_export_activity'
          ? { rows, as_of: stamp() }
          : page(rows, p.p_page, p.p_size);
      }
      case 'lc_import_contacts':
        guard();
        return {
          rows: state.tables.members.map(({ email, mobile, first_name, last_name }) => ({
            email,
            mobile,
            first_name,
            last_name,
          })),
        };
      case 'lc_import_members': {
        guard();
        if (state.imports[p.p_request_id]) return state.imports[p.p_request_id];
        if (!Array.isArray(p.p_rows) || !p.p_rows.length || p.p_rows.length > 2000)
          throw new Error('Choose 1–2,000 valid member rows.');
        const before = clone(state);
        batchDepth++;
        try {
          for (const row of p.p_rows) {
            if (!row.firstName?.trim() || !row.lastName?.trim() || !row.branchNames?.length)
              throw new Error('Required member details are missing.');
            const inserted = new Query('members')
              .insert({
                first_name: row.firstName.trim(),
                last_name: row.lastName.trim(),
                email: row.email?.trim().toLowerCase() || null,
                mobile: row.mobile?.trim() || null,
                admin_note: row.adminNote?.trim() || null,
              })
              .select('*')
              .single()
              .execute();
            if (inserted.error) throw new Error(inserted.error.message);
            for (const [key, table, link, fk] of [
              ['branchNames', 'branches', 'member_branches', 'branch_id'],
              ['ministryNames', 'ministries', 'member_ministries', 'ministry_id'],
            ] as const)
              for (const name of row[key] ?? []) {
                let named = state.tables[table].find(
                  (n) => n.name.toLowerCase() === String(name).trim().toLowerCase(),
                );
                if (!named) {
                  named = { id: id(), name: String(name).trim(), created_at: stamp() };
                  state.tables[table].push(named);
                }
                if (
                  !state.tables[link].some(
                    (l) => l.member_id === inserted.data.id && l[fk] === named!.id,
                  )
                )
                  state.tables[link].push({ member_id: inserted.data.id, [fk]: named.id });
              }
          }
          const result = { imported: p.p_rows.length };
          state.imports[p.p_request_id] = result;
          save('members');
          return result;
        } catch (error) {
          state = before;
          persist();
          throw error;
        } finally {
          batchDepth--;
          if (!batchDepth && dirty) persist();
        }
      }
      default:
        throw Object.assign(new Error(`The demo operation ${name} is not available.`), {
          code: 'PGRST202',
        });
    }
  }

  const client = {
    auth: {
      getSession: async () => ({ data: { session: session() }, error: null }),
      getUser: async () => ({ data: { user: session()?.user ?? null }, error: null }),
      onAuthStateChange: (callback: (event: string, session: any) => void) => {
        listeners.add(callback);
        return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
      },
      signInWithOAuth: async (_options: any) => {
        if (state.role === 'guest') state.role = 'member';
        persist();
        notifyAuth();
        return { data: { provider: 'google', url: null }, error: null };
      },
      signOut: async () => {
        state.role = 'guest';
        persist();
        notifyAuth('SIGNED_OUT');
        return { error: null };
      },
    },
    from: (table: string) => new Query(table),
    rpc,
    channel: (name: string) => {
      const channel: any = {
        name,
        bindings: [],
        on(_type: string, filter: any, callback: any) {
          this.bindings.push({ filter, callback });
          return this;
        },
        subscribe(callback?: any) {
          channels.add(this);
          callback?.('SUBSCRIBED');
          return this;
        },
        unsubscribe() {
          channels.delete(this);
          return Promise.resolve('ok');
        },
      };
      return channel;
    },
    removeChannel: async (channel: any) => {
      channels.delete(channel);
      return 'ok';
    },
    __demo: {
      role: () => state.role,
      setRole: (role: DemoRole) => {
        if (!['owner', 'admin', 'member', 'guest'].includes(role)) return;
        state.role = role;
        persist();
        notifyAuth(role === 'guest' ? 'SIGNED_OUT' : 'SIGNED_IN');
      },
      reset: () => {
        state = createDemoState(clock());
        seedAttendance = new Map(
          state.tables.attendance.map((row) => [row.id, JSON.stringify(row)]),
        );
        persist();
        notifyAuth();
      },
      serializedBytes: () => JSON.stringify(storageState()).length,
    },
  };
  persist();
  return client;
}
