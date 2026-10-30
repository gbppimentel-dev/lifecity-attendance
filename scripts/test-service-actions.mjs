import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AttendedServiceError,
  changeServiceField,
  deleteServiceWithUndo,
} from '../src/lib/serviceActions.ts';

const service = {
  id: 'service-1',
  name: 'Sunday Celebration',
  starts_at: '2026-11-01T04:00:00Z',
  archived_at: null,
  is_sunday_service: false,
  location: 'Main Hall',
  admin_note: 'Retain the full record',
  is_public: true,
  created_at: '2026-10-01T00:00:00Z',
  extra_column: { source: 'presentation', count: 7 },
};
const copy = (value) => structuredClone(value);

function fakeClient({ rows = [service], attendance = 0, faults = [], before } = {}) {
  const state = {
    rows: new Map(rows.map((row) => [row.id, copy(row)])),
    attendance,
    requests: [],
    faults: [...faults],
  };
  const matches = (row, filters) => filters.every(({ field, value }) => row[field] === value);
  function execute(query) {
    const request = copy({
      table: query.table,
      operation: query.operation,
      filters: query.filters,
      values: query.values,
      columns: query.columns,
      options: query.options,
    });
    state.requests.push(request);
    before?.(request, state);
    const faultAt = state.faults.findIndex(
      (fault) => fault.table === request.table && fault.operation === request.operation,
    );
    if (faultAt >= 0) return state.faults.splice(faultAt, 1)[0].result;
    if (query.table === 'attendance') return { data: null, error: null, count: state.attendance };
    assert.equal(query.table, 'events');
    if (query.operation === 'insert') {
      if (state.rows.has(query.values.id))
        return { data: null, error: { code: '23505', message: 'duplicate ID' } };
      state.rows.set(query.values.id, copy(query.values));
      return {
        data: query.columns === 'id' ? { id: query.values.id } : copy(query.values),
        error: null,
      };
    }
    const row = [...state.rows.values()].find((item) => matches(item, query.filters));
    if (!row) return { data: null, error: null };
    if (query.operation === 'delete') state.rows.delete(row.id);
    if (query.operation === 'update') Object.assign(row, copy(query.values));
    return { data: copy(row), error: null };
  }
  class Query {
    constructor(table) {
      this.table = table;
      this.operation = 'read';
      this.filters = [];
      this.columns = '*';
      this.options = null;
      this.values = null;
    }
    select(columns = '*', options = null) {
      this.columns = columns;
      this.options = options;
      return this;
    }
    update(values) {
      this.operation = 'update';
      this.values = values;
      return this;
    }
    delete() {
      this.operation = 'delete';
      return this;
    }
    insert(values) {
      this.operation = 'insert';
      this.values = values;
      return this;
    }
    eq(field, value) {
      this.filters.push({ operator: 'eq', field, value });
      return this;
    }
    is(field, value) {
      this.filters.push({ operator: 'is', field, value });
      return this;
    }
    run() {
      return (this.result ??= Promise.resolve().then(() => execute(this)));
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

  return { client: { from: (table) => new Query(table) }, state };
}

test('delete with zero attendance captures every returned column and Undo restores the original ID', async () => {
  const { client, state } = fakeClient();
  const change = await deleteServiceWithUndo(client, service.id);
  assert.deepEqual(change.service, service);
  assert.equal(state.rows.size, 0);
  const check = state.requests.find((request) => request.table === 'attendance');
  assert.deepEqual(check.options, { count: 'exact', head: true });
  assert.deepEqual(check.filters, [{ operator: 'eq', field: 'event_id', value: service.id }]);
  assert.equal(state.requests.find((request) => request.operation === 'delete').columns, '*');
  await change.undo();
  assert.deepEqual(state.rows.get(service.id), service);
  assert.deepEqual(
    state.requests.find((request) => request.operation === 'insert').values,
    service,
  );
  await change.undo();
  assert.equal(state.requests.filter((request) => request.operation === 'insert').length, 1);
});

test('attendance prevents deletion before an event mutation is attempted', async () => {
  const { client, state } = fakeClient({ attendance: 3 });
  await assert.rejects(deleteServiceWithUndo(client, service.id), AttendedServiceError);
  assert.deepEqual(state.rows.get(service.id), service);
  assert.equal(state.requests.filter((request) => request.table === 'events').length, 0);
});

test('unknown attendance count is not treated as zero', async () => {
  const { client, state } = fakeClient({ attendance: null });
  await assert.rejects(
    deleteServiceWithUndo(client, service.id),
    /Attendance could not be checked/,
  );
  assert.equal(state.requests.length, 1);
});

test('attendance query errors do not permit deletion', async () => {
  const { client, state } = fakeClient({
    faults: [
      {
        table: 'attendance',
        operation: 'read',
        result: { data: null, error: { message: 'Attendance access denied' } },
      },
    ],
  });
  await assert.rejects(deleteServiceWithUndo(client, service.id), /Attendance access denied/);
  assert.equal(state.requests.length, 1);
});

test('a database constraint protecting attendance added during the delete race is propagated', async () => {
  const { client, state } = fakeClient({
    before(request, current) {
      if (request.operation === 'delete') current.attendance = 1;
    },
    faults: [
      {
        table: 'events',
        operation: 'delete',
        result: { data: null, error: { code: '23503', message: 'Service has attendance records' } },
      },
    ],
  });
  await assert.rejects(deleteServiceWithUndo(client, service.id), /Service has attendance records/);
  assert.equal(state.attendance, 1);
  assert.deepEqual(state.rows.get(service.id), service);
});

test('a missing or RLS-filtered delete is not reported as success', async () => {
  const { client } = fakeClient({ rows: [] });
  await assert.rejects(deleteServiceWithUndo(client, service.id), /service was not deleted/);
});

test('an explicitly denied delete is not reported as success', async () => {
  const { client, state } = fakeClient({
    faults: [
      {
        table: 'events',
        operation: 'delete',
        result: { data: null, error: { code: '42501', message: 'Delete denied' } },
      },
    ],
  });
  await assert.rejects(deleteServiceWithUndo(client, service.id), /Delete denied/);
  assert.deepEqual(state.rows.get(service.id), service);
});

test('Sunday changes and Undo compare the expected value and preserve other columns', async () => {
  const { client, state } = fakeClient();
  const change = await changeServiceField(client, service.id, 'is_sunday_service', false, true);
  assert.equal(state.rows.get(service.id).is_sunday_service, true);
  assert.equal(change.service.is_sunday_service, true);
  state.rows.get(service.id).name = 'A concurrent edit to another field';
  await change.undo();
  assert.equal(state.rows.get(service.id).is_sunday_service, false);
  assert.equal(state.rows.get(service.id).name, 'A concurrent edit to another field');
  await change.undo();
  const updates = state.requests.filter((request) => request.operation === 'update');
  assert.equal(updates.length, 2);
  assert.deepEqual(
    updates.map((request) => request.filters[1]),
    [
      { operator: 'eq', field: 'is_sunday_service', value: false },
      { operator: 'eq', field: 'is_sunday_service', value: true },
    ],
  );
});

test('archiving uses IS NULL and Undo only restores the archive timestamp it wrote', async () => {
  const { client, state } = fakeClient();
  const timestamp = '2026-10-28T12:00:00Z';
  const change = await changeServiceField(client, service.id, 'archived_at', null, timestamp);
  assert.equal(state.rows.get(service.id).archived_at, timestamp);
  await change.undo();
  assert.equal(state.rows.get(service.id).archived_at, null);
  const updates = state.requests.filter((request) => request.operation === 'update');
  assert.deepEqual(updates[0].filters[1], { operator: 'is', field: 'archived_at', value: null });
  assert.deepEqual(updates[1].filters[1], {
    operator: 'eq',
    field: 'archived_at',
    value: timestamp,
  });
});

test('restore Undo compares IS NULL before replacing the previous archive timestamp', async () => {
  const timestamp = '2026-10-20T12:00:00Z';
  const { client, state } = fakeClient({ rows: [{ ...service, archived_at: timestamp }] });
  const change = await changeServiceField(client, service.id, 'archived_at', timestamp, null);
  await change.undo();
  assert.equal(state.rows.get(service.id).archived_at, timestamp);
  assert.deepEqual(
    state.requests.filter((request) => request.operation === 'update')[1].filters[1],
    { operator: 'is', field: 'archived_at', value: null },
  );
});

test('stale Sunday or archive changes cannot overwrite a newer value', async () => {
  for (const [field, current, previous, next] of [
    ['is_sunday_service', true, false, true],
    ['archived_at', '2026-10-27T12:00:00Z', null, '2026-10-28T12:00:00Z'],
  ]) {
    const row = { ...service, [field]: current };
    const { client, state } = fakeClient({ rows: [row] });
    await assert.rejects(
      changeServiceField(client, service.id, field, previous, next),
      /has changed/,
    );
    assert.deepEqual(state.rows.get(service.id), row);
  }
});

test('field Undo refuses to overwrite a changed archive timestamp', async () => {
  const { client, state } = fakeClient();
  const change = await changeServiceField(
    client,
    service.id,
    'archived_at',
    null,
    '2026-10-28T12:00:00Z',
  );
  state.rows.get(service.id).archived_at = '2026-10-28T13:00:00Z';
  await assert.rejects(change.undo(), /has changed/);
  assert.equal(state.rows.get(service.id).archived_at, '2026-10-28T13:00:00Z');
});

test('Sunday Undo does not claim success after another caller changed the flag', async () => {
  const { client, state } = fakeClient();
  const change = await changeServiceField(client, service.id, 'is_sunday_service', false, true);
  state.rows.get(service.id).is_sunday_service = false;
  await assert.rejects(change.undo(), /has changed/);
  assert.equal(state.rows.get(service.id).is_sunday_service, false);
});

test('empty or denied updates are not reported as success', async () => {
  const absent = fakeClient({ rows: [] });
  await assert.rejects(
    changeServiceField(absent.client, service.id, 'is_sunday_service', false, true),
    /has changed/,
  );
  const denied = fakeClient({
    faults: [
      {
        table: 'events',
        operation: 'update',
        result: { data: null, error: { code: '42501', message: 'Update denied' } },
      },
    ],
  });
  await assert.rejects(
    changeServiceField(denied.client, service.id, 'is_sunday_service', false, true),
    /Update denied/,
  );
  assert.deepEqual(denied.state.rows.get(service.id), service);
});

test('failed field Undo remains retryable', async () => {
  const { client, state } = fakeClient();
  const change = await changeServiceField(client, service.id, 'is_sunday_service', false, true);
  state.faults.push({
    table: 'events',
    operation: 'update',
    result: { data: null, error: { message: 'Temporary failure' } },
  });
  await assert.rejects(change.undo(), /Temporary failure/);
  assert.equal(state.rows.get(service.id).is_sunday_service, true);
  await change.undo();
  assert.equal(state.rows.get(service.id).is_sunday_service, false);
});

test('delete Undo accepts an already-restored identical record without another insert', async () => {
  const { client, state } = fakeClient();
  const change = await deleteServiceWithUndo(client, service.id);
  state.rows.set(service.id, copy(service));
  await change.undo();
  assert.deepEqual(state.rows.get(service.id), service);
  assert.equal(state.requests.filter((request) => request.operation === 'insert').length, 0);
});

test('delete Undo never replaces a conflicting record with the same ID', async () => {
  const { client, state } = fakeClient();
  const change = await deleteServiceWithUndo(client, service.id);
  const conflicting = { ...service, name: 'A different record' };
  state.rows.set(service.id, conflicting);
  await assert.rejects(change.undo(), /will not overwrite/);
  assert.deepEqual(state.rows.get(service.id), conflicting);
  assert.equal(state.requests.filter((request) => request.operation === 'insert').length, 0);
});

test('a duplicate insert race accepts the identical record but refuses a different one', async () => {
  for (const identical of [true, false]) {
    const { client, state } = fakeClient({
      before(request, current) {
        if (request.operation === 'insert')
          current.rows.set(service.id, {
            ...copy(service),
            ...(identical ? {} : { name: 'Concurrent new record' }),
          });
      },
    });
    const change = await deleteServiceWithUndo(client, service.id);
    if (identical) await change.undo();
    else await assert.rejects(change.undo(), /duplicate ID/);
    assert.equal(
      state.rows.get(service.id).name,
      identical ? service.name : 'Concurrent new record',
    );
    assert.equal(state.requests.filter((request) => request.operation === 'insert').length, 1);
  }
});

test('delete Undo propagates read and insert access errors and stays retryable', async () => {
  for (const operation of ['read', 'insert']) {
    const { client, state } = fakeClient();
    const change = await deleteServiceWithUndo(client, service.id);
    state.faults.push({
      table: 'events',
      operation,
      result: { data: null, error: { code: '42501', message: `${operation} denied` } },
    });
    await assert.rejects(change.undo(), new RegExp(`${operation} denied`));
    assert.equal(state.rows.size, 0);
    await change.undo();
    assert.deepEqual(state.rows.get(service.id), service);
  }
});
