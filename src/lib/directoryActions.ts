import type { SupabaseClient } from '@supabase/supabase-js';

export type DirectoryTable = 'ministries' | 'branches';
export type DirectorySnapshot = { id: string; name: string; [column: string]: unknown };
export type DirectoryChange = { entry: DirectorySnapshot; undo: () => Promise<void> };

export class DirectoryEntryInUseError extends Error {
  readonly code = '23503';
  constructor(table: DirectoryTable) {
    const label = table === 'ministries' ? 'ministry' : 'church';
    super(
      `This ${label} is now assigned to members. Remove its member assignments before deleting it.`,
    );
    this.name = 'DirectoryEntryInUseError';
  }
}

function fail(error: unknown, fallback: string): never {
  throw new Error((error as { message?: string })?.message || fallback);
}

function sameValue(first: unknown, second: unknown): boolean {
  if (Object.is(first, second)) return true;
  if (first === null || second === null || typeof first !== 'object' || typeof second !== 'object')
    return false;
  if (Array.isArray(first) || Array.isArray(second)) {
    return (
      Array.isArray(first) &&
      Array.isArray(second) &&
      first.length === second.length &&
      first.every((value, index) => sameValue(value, second[index]))
    );
  }
  const a = first as Record<string, unknown>,
    b = second as Record<string, unknown>;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]))
  );
}

export async function deleteDirectoryEntryWithUndo(
  client: SupabaseClient,
  table: DirectoryTable,
  id: string,
): Promise<DirectoryChange> {
  if ((table !== 'ministries' && table !== 'branches') || typeof id !== 'string' || !id.trim()) {
    throw new Error('A valid ministry or church is required before deleting it.');
  }
  const label = table === 'ministries' ? 'ministry' : 'church';
  const links = table === 'ministries' ? 'member_ministries' : 'member_branches';
  const foreignKey = table === 'ministries' ? 'ministry_id' : 'branch_id';
  const { count, error: countError } = await client
    .from(links)
    .select('member_id', { count: 'exact', head: true })
    .eq(foreignKey, id);
  if (countError) fail(countError, `Member assignments for this ${label} could not be checked.`);
  if (count === null || count === undefined)
    throw new Error(
      `Member assignments for this ${label} could not be checked. Refresh Members and try again.`,
    );
  if (count > 0) throw new DirectoryEntryInUseError(table);

  const deleted =
    table === 'ministries'
      ? await client.rpc('lc_delete_empty_ministry', { p_id: id })
      : await client.from(table).delete().eq('id', id).select('*').maybeSingle();
  if (deleted.error) {
    if (deleted.error.code === '23503') throw new DirectoryEntryInUseError(table);
    if (
      table === 'ministries' &&
      (deleted.error.code === 'PGRST202' || deleted.error.code === '42883')
    ) {
      throw new Error(
        'Ministry deletion needs the one-time database update. Run install-directory-delete-undo.sql in Supabase, then try again.',
      );
    }
    fail(deleted.error, `The ${label} could not be deleted. Please try again.`);
  }
  if (!deleted.data)
    throw new Error(
      `The ${label} was not deleted. It may have changed or your access may be restricted.`,
    );
  if (deleted.data.id !== id || typeof deleted.data.name !== 'string') {
    throw new Error(
      `The deleted ${label} could not be confirmed. Refresh Members before trying again.`,
    );
  }

  const snapshot = structuredClone(deleted.data) as DirectorySnapshot;
  const matches = (row: DirectorySnapshot) =>
    Object.keys(snapshot).every(
      (key) => Object.hasOwn(row, key) && sameValue(row[key], snapshot[key]),
    );
  const conflict = () =>
    new Error(`A ${label} with this ID or name already exists. Undo will not overwrite it.`);
  let undone = false;
  let pending: Promise<void> | undefined;

  async function readExisting() {
    const result = await client.from(table).select('*').eq('id', snapshot.id).maybeSingle();
    if (result.error)
      fail(result.error, `The ${label} could not be checked before Undo. Please try again.`);
    return result.data as DirectorySnapshot | null;
  }
  async function restore() {
    const existing = await readExisting();
    if (existing) {
      if (!matches(existing)) throw conflict();
      undone = true;
      return;
    }

    const restored = await client
      .from(table)
      .insert(structuredClone(snapshot))
      .select('*')
      .single();
    if (restored.error) {
      if (restored.error.code !== '23505')
        fail(restored.error, `The ${label} could not be restored. Please try Undo again.`);
      const raced = await readExisting();
      if (!raced || !matches(raced)) throw conflict();
    } else if (!restored.data || !matches(restored.data as DirectorySnapshot)) {
      throw new Error(
        `Undo could not confirm the restored ${label}. Refresh Members and try again.`,
      );
    }
    undone = true;
  }
  return {
    entry: structuredClone(snapshot),
    undo: async () => {
      if (undone) return;
      if (pending) return pending;
      pending = restore();
      try {
        await pending;
      } finally {
        pending = undefined;
      }
    },
  };
}
