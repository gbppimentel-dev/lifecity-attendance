import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import {
  deleteDirectoryEntryWithUndo,
  DirectoryEntryInUseError,
} from '../src/lib/directoryActions.ts';

const copy = (value) => structuredClone(value);
const tables = ['ministries', 'branches'];
const fixture = (table) => ({
  id: `${table}-1`,
  name: table === 'ministries' ? 'Welcome Team' : 'LifeCity North',
  created_at: '2026-10-28T00:00:00Z',
  extra_column: { source: 'presentation', tags: ['a', 'b'], count: 7 },
});
const mutationFor = (table) => (table === 'ministries' ? 'rpc' : 'delete');

function fakeClient({
  table = 'ministries',
  rows = [fixture(table)],
  assigned = 0,
  faults = [],
  before,
} = {}) {
  const state = {
    rows: new Map(rows.map((row) => [row.id, copy(row)])),
    assigned,
    requests: [],
    faults: [...faults],
  };
  const execute = async (query) => {
    const request = copy(query);
    state.requests.push(request);
    await before?.(request, state);
    const faultAt = state.faults.findIndex(
      (fault) => fault.table === request.table && fault.operation === request.operation,
    );
    if (faultAt >= 0) return state.faults.splice(faultAt, 1)[0].result;
    if (request.table === (table === 'ministries' ? 'member_ministries' : 'member_branches')) {
      return { data: null, count: state.assigned, error: null };
    }
    assert.equal(request.table, table);
    if (request.operation === 'insert') {
      if (
        [...state.rows.values()].some(
          (row) => row.id === request.values.id || row.name === request.values.name,
        )
      ) {
        return { data: null, error: { code: '23505', message: 'duplicate ID or name' } };
      }
      state.rows.set(request.values.id, copy(request.values));
      return { data: copy(request.values), error: null };
    }
    if (request.operation === 'rpc') {
      assert.equal(table, 'ministries');
      assert.equal(request.rpc, 'lc_delete_empty_ministry');
      assert.deepEqual(request.values, { p_id: fixture(table).id });
    }
    const row = [...state.rows.values()].find((item) =>
      request.filters.every((filter) => item[filter.field] === filter.value),
    );
    if (!row) return { data: null, error: null };
    if (request.operation === 'delete' || request.operation === 'rpc') {
      if (state.assigned > 0)
        return {
          data: null,
          error: { code: '23503', message: 'New member assignment prevents deletion' },
        };
      state.rows.delete(row.id);
    }
    return { data: copy(row), error: null };
  };
  class Query {
    constructor(table) {
      this.query = {
        table,
        operation: 'read',
        columns: '*',
        options: null,
        values: null,
        filters: [],
      };
    }
    select(columns = '*', options = null) {
      Object.assign(this.query, { columns, options });
      return this;
    }
    delete() {
      this.query.operation = 'delete';
      return this;
    }
    insert(values) {
      Object.assign(this.query, { operation: 'insert', values });
      return this;
    }
    eq(field, value) {
      this.query.filters.push({ field, value });
      return this;
    }
    run() {
      return (this.result ??= Promise.resolve().then(() => execute(this.query)));
    }
    maybeSingle() {
      return this.run();
    }
    single() {
      return this.run();
    }
    then(resolve, reject) {
      return this.run().then(resolve, reject);
    }
  }

  const client = {
    from: (name) => new Query(name),
    rpc: (name, values) =>
      execute({
        table: 'ministries',
        operation: 'rpc',
        rpc: name,
        values,
        columns: '*',
        filters: [{ field: 'id', value: values.p_id }],
      }),
  };
  return { client, state };
}

for (const table of tables) {
  const entry = fixture(table);
  test(`${table}: captures the full deleted row, restores its ID and deduplicates Undo`, async () => {
    const { client, state } = fakeClient({ table });
    const change = await deleteDirectoryEntryWithUndo(client, table, entry.id);
    assert.deepEqual(change.entry, entry);
    assert.equal(state.rows.size, 0);
    assert.deepEqual(state.requests[0].options, { count: 'exact', head: true });
    assert.deepEqual(state.requests[0].filters, [
      { field: table === 'ministries' ? 'ministry_id' : 'branch_id', value: entry.id },
    ]);
    assert.equal(state.requests[1].operation, mutationFor(table));
    assert.equal(state.requests[1].columns, '*');

    change.entry.name = 'Changed only in UI';
    change.entry.extra_column.tags.reverse();
    await Promise.all([change.undo(), change.undo(), change.undo()]);
    await change.undo();
    assert.deepEqual(state.rows.get(entry.id), entry);
    assert.deepEqual(
      state.requests.find((request) => request.operation === 'insert').values,
      entry,
    );
    assert.equal(state.requests.filter((request) => request.operation === 'insert').length, 1);
  });

  test(`${table}: assigned records cannot be deleted, including an assignment racing the fresh count`, async () => {
    for (const race of [false, true]) {
      const { client, state } = fakeClient({
        table,
        assigned: race ? 0 : 2,
        before(request, current) {
          if (race && request.operation === mutationFor(table)) current.assigned = 1;
        },
      });
      await assert.rejects(
        deleteDirectoryEntryWithUndo(client, table, entry.id),
        (error) => error instanceof DirectoryEntryInUseError && error.code === '23503',
      );
      assert.deepEqual(state.rows.get(entry.id), entry);
      assert.ok(state.assigned > 0);
      assert.equal(
        state.requests.filter((request) => request.operation === mutationFor(table)).length,
        race ? 1 : 0,
      );
    }
  });

  test(`${table}: an unknown assignment count or denied check never permits a mutation`, async () => {
    const unknown = fakeClient({ table, assigned: null });
    await assert.rejects(
      deleteDirectoryEntryWithUndo(unknown.client, table, entry.id),
      /could not be checked/,
    );
    assert.equal(unknown.state.requests.length, 1);
    const linkTable = table === 'ministries' ? 'member_ministries' : 'member_branches';
    const denied = fakeClient({
      table,
      faults: [
        {
          table: linkTable,
          operation: 'read',
          result: { data: null, error: { code: '42501', message: 'Assignment check denied' } },
        },
      ],
    });
    await assert.rejects(
      deleteDirectoryEntryWithUndo(denied.client, table, entry.id),
      /Assignment check denied/,
    );
    assert.equal(denied.state.requests.length, 1);
  });

  test(`${table}: missing/RLS-hidden rows and explicit delete errors are not success`, async () => {
    const absent = fakeClient({ table, rows: [] });
    await assert.rejects(
      deleteDirectoryEntryWithUndo(absent.client, table, entry.id),
      /was not deleted/,
    );
    const denied = fakeClient({
      table,
      faults: [
        {
          table,
          operation: mutationFor(table),
          result: { data: null, error: { code: '42501', message: 'Delete denied' } },
        },
      ],
    });
    await assert.rejects(
      deleteDirectoryEntryWithUndo(denied.client, table, entry.id),
      /Delete denied/,
    );
    assert.deepEqual(denied.state.rows.get(entry.id), entry);
  });

  test(`${table}: Undo cannot replace an ID collision or another row with the same name`, async () => {
    for (const conflict of [
      { ...entry, name: 'A different record' },
      { ...entry, id: 'another-id' },
    ]) {
      const { client, state } = fakeClient({ table });
      const change = await deleteDirectoryEntryWithUndo(client, table, entry.id);
      state.rows.set(conflict.id, copy(conflict));
      await assert.rejects(change.undo(), /will not overwrite/);
      assert.equal(state.rows.size, 1);
      assert.deepEqual(state.rows.get(conflict.id), conflict);
    }
  });

  test(`${table}: read/insert errors surface and a failed Undo stays retryable`, async () => {
    for (const operation of ['read', 'insert']) {
      const { client, state } = fakeClient({ table });
      const change = await deleteDirectoryEntryWithUndo(client, table, entry.id);
      state.faults.push({
        table,
        operation,
        result: { data: null, error: { code: '42501', message: `${operation} denied` } },
      });
      await assert.rejects(change.undo(), new RegExp(`${operation} denied`));
      assert.equal(state.rows.size, 0);
      await change.undo();
      assert.deepEqual(state.rows.get(entry.id), entry);
    }
  });

  test(`${table}: retries reconcile an insert whose response was lost without a second insert`, async () => {
    const { client, state } = fakeClient({
      table,
      before(request, current) {
        if (request.operation === 'insert') current.rows.set(entry.id, copy(entry));
      },
    });
    const change = await deleteDirectoryEntryWithUndo(client, table, entry.id);
    state.faults.push({
      table,
      operation: 'insert',
      result: { data: null, error: { message: 'Connection interrupted after commit' } },
    });
    await assert.rejects(change.undo(), /Connection interrupted/);
    await change.undo();
    assert.deepEqual(state.rows.get(entry.id), entry);
    assert.equal(state.requests.filter((request) => request.operation === 'insert').length, 1);
  });

  test(`${table}: concurrent identical restoration is accepted; a different row is preserved`, async () => {
    for (const identical of [true, false]) {
      const { client, state } = fakeClient({
        table,
        before(request, current) {
          if (request.operation === 'insert')
            current.rows.set(entry.id, {
              ...copy(entry),
              ...(identical ? {} : { name: 'Concurrent replacement' }),
            });
        },
      });
      const change = await deleteDirectoryEntryWithUndo(client, table, entry.id);
      if (identical) await change.undo();
      else await assert.rejects(change.undo(), /will not overwrite/);
      assert.equal(
        state.rows.get(entry.id).name,
        identical ? entry.name : 'Concurrent replacement',
      );
      assert.equal(state.requests.filter((request) => request.operation === 'insert').length, 1);
    }
  });

  test(`${table}: an identical existing snapshot ignores JSON key order but preserves array order`, async () => {
    const { client, state } = fakeClient({ table });
    const change = await deleteDirectoryEntryWithUndo(client, table, entry.id);
    state.rows.set(entry.id, {
      ...entry,
      extra_column: { count: 7, tags: ['a', 'b'], source: 'presentation' },
    });
    await change.undo();
    assert.equal(state.requests.filter((request) => request.operation === 'insert').length, 0);
    const other = fakeClient({ table });
    const otherChange = await deleteDirectoryEntryWithUndo(other.client, table, entry.id);
    other.state.rows.set(entry.id, {
      ...entry,
      extra_column: { ...entry.extra_column, tags: ['b', 'a'] },
    });
    await assert.rejects(otherChange.undo(), /will not overwrite/);
  });
}

test('a missing ministry RPC fails with setup guidance and never falls back to direct DELETE', async () => {
  for (const code of ['PGRST202', '42883']) {
    const { client, state } = fakeClient({
      faults: [
        {
          table: 'ministries',
          operation: 'rpc',
          result: { data: null, error: { code, message: 'Function not installed' } },
        },
      ],
    });
    await assert.rejects(
      deleteDirectoryEntryWithUndo(client, 'ministries', fixture('ministries').id),
      /install-directory-delete-undo\.sql/,
    );
    assert.equal(state.requests.filter((request) => request.operation === 'delete').length, 0);
    assert.equal(state.rows.size, 1);
  }
});

test('invalid targets are rejected before any database request', async () => {
  const { client, state } = fakeClient();
  await assert.rejects(
    deleteDirectoryEntryWithUndo(client, 'members', 'id'),
    /valid ministry or church/,
  );
  await assert.rejects(
    deleteDirectoryEntryWithUndo(client, 'ministries', ''),
    /valid ministry or church/,
  );
  assert.equal(state.requests.length, 0);
});

test('SQL installer executes against PostgreSQL, preserves RLS and refuses assigned ministries', async (t) => {
  const db = new PGlite();
  const installer = await readFile(
    new URL('../supabase/install-directory-delete-undo.sql', import.meta.url),
    'utf8',
  );
  const ids = {
    owner: '00000000-0000-4000-8000-000000000001',
    admin: '00000000-0000-4000-8000-000000000002',
    user: '00000000-0000-4000-8000-000000000003',
    suspended: '00000000-0000-4000-8000-000000000004',
    ministry: '00000000-0000-4000-8000-000000000010',
    member: '00000000-0000-4000-8000-000000000020',
  };
  const account = async (id) => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? '']);
    await db.exec('set role authenticated');
  };
  const insertMinistry = async () => {
    await db.exec('reset role');
    await db.query(
      'insert into public.ministries(id,name,created_at,extra_column) values($1,$2,$3,$4)',
      [ids.ministry, 'Presentation Team', '2026-10-28T00:00:00Z', { preserve: ['all', 'columns'] }],
    );
  };
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid
      $$;
      create table public.app_accounts(user_id uuid primary key, role text not null, status text not null);
      create function public.lc_has_admin_access() returns boolean language sql stable security definer set search_path = '' as $$
        select exists(select 1 from public.app_accounts where user_id=auth.uid() and status='active' and role in ('owner','admin'))
      $$;
      create table public.ministries(id uuid primary key, name text unique not null, created_at timestamptz not null, extra_column jsonb);
      create table public.members(id uuid primary key);
      create table public.member_ministries(member_id uuid references public.members(id) on delete cascade,
        ministry_id uuid references public.ministries(id) on delete cascade, primary key(member_id,ministry_id));
      alter table public.ministries enable row level security;
      alter table public.member_ministries enable row level security;
      create policy lc_admin_access on public.ministries for all to authenticated using(public.lc_has_admin_access()) with check(public.lc_has_admin_access());
      create policy lc_admin_guard on public.ministries as restrictive for all to authenticated using(public.lc_has_admin_access()) with check(public.lc_has_admin_access());
      create policy lc_admin_access on public.member_ministries for all to authenticated using(public.lc_has_admin_access()) with check(public.lc_has_admin_access());
      create policy lc_admin_guard on public.member_ministries as restrictive for all to authenticated using(public.lc_has_admin_access()) with check(public.lc_has_admin_access());
      grant usage on schema public,auth to authenticated,anon;
      grant select,insert,update,delete on public.ministries,public.member_ministries to authenticated;
      insert into public.app_accounts values
        ('${ids.owner}','owner','active'),('${ids.admin}','admin','active'),('${ids.user}','user','active'),('${ids.suspended}','admin','suspended');
      insert into public.members values('${ids.member}');
    `);
    await db.exec(installer);
    await db.exec(installer);

    await t.test(
      'empty ministry returns every original column for Owner and Administrator',
      async () => {
        for (const actor of [ids.owner, ids.admin]) {
          await insertMinistry();
          const expected = (await db.query('select to_jsonb(m) snapshot from public.ministries m'))
            .rows[0].snapshot;
          await account(actor);
          const result = await db.query('select public.lc_delete_empty_ministry($1) snapshot', [
            ids.ministry,
          ]);
          assert.deepEqual(result.rows[0].snapshot, expected);
          assert.equal(
            (await db.query('select count(*)::integer total from public.ministries')).rows[0].total,
            0,
          );
          assert.equal(
            (await db.query('select public.lc_delete_empty_ministry($1) snapshot', [ids.ministry]))
              .rows[0].snapshot,
            null,
          );
        }
      },
    );

    await t.test(
      'assigned ministry raises FK code and its CASCADE-linked membership remains intact',
      async () => {
        await insertMinistry();
        await db.query('insert into public.member_ministries values($1,$2)', [
          ids.member,
          ids.ministry,
        ]);
        await account(ids.owner);
        await assert.rejects(
          db.query('select public.lc_delete_empty_ministry($1)', [ids.ministry]),
          (error) => error.code === '23503',
        );
        assert.equal(
          (await db.query('select count(*)::integer total from public.member_ministries')).rows[0]
            .total,
          1,
        );
        assert.equal(
          (await db.query('select count(*)::integer total from public.ministries')).rows[0].total,
          1,
        );
        await db.exec('reset role; delete from public.member_ministries');
      },
    );

    await t.test(
      'anonymous, ordinary and suspended accounts cannot call the mutation successfully',
      async () => {
        for (const actor of [null, ids.user, ids.suspended]) {
          await account(actor);
          await assert.rejects(
            db.query('select public.lc_delete_empty_ministry($1)', [ids.ministry]),
            (error) => error.code === '42501',
          );
        }
        await db.exec('reset role; set role anon');
        await assert.rejects(
          db.query('select public.lc_delete_empty_ministry($1)', [ids.ministry]),
          (error) => error.code === '42501',
        );
        await db.exec('reset role');
        assert.equal(
          (await db.query('select count(*)::integer total from public.ministries')).rows[0].total,
          1,
        );
      },
    );

    await t.test('the invoker function preserves a restrictive DELETE policy', async () => {
      await db.exec(
        'reset role; create policy test_deny_delete on public.ministries as restrictive for delete to authenticated using(false)',
      );
      await account(ids.owner);
      const result = await db.query('select public.lc_delete_empty_ministry($1) snapshot', [
        ids.ministry,
      ]);
      assert.equal(result.rows[0].snapshot, null);
      assert.equal(
        (await db.query('select count(*)::integer total from public.ministries')).rows[0].total,
        1,
      );
      await db.exec('reset role; drop policy test_deny_delete on public.ministries');
    });

    await t.test('SQL function remains invoker-scoped and rejects a null target', async () => {
      await db.exec('reset role');
      const procedure = (
        await db.query(
          "select prosecdef,proconfig from pg_proc where oid='public.lc_delete_empty_ministry(uuid)'::regprocedure",
        )
      ).rows[0];
      assert.equal(procedure.prosecdef, false);
      assert.deepEqual(procedure.proconfig, ['search_path=""']);
      await account(ids.owner);
      await assert.rejects(
        db.query('select public.lc_delete_empty_ministry(null)'),
        (error) => error.code === '22023',
      );
    });
  } finally {
    await db.close();
  }
});
