import type { SupabaseClient } from '@supabase/supabase-js'

export type AttendanceSnapshot = {
  id: string
  member_id: string
  event_id: string
  checked_in_at: string
  [column: string]: unknown
}
export type AttendanceRemoval = { attendance: AttendanceSnapshot; undo: () => Promise<void> }

function fail(error: unknown, fallback: string): never {
  if (['PGRST202', '42883'].includes((error as { code?: string })?.code ?? '')) {
    throw new Error('Check-in removal and Undo need the one-time Records update. Run install-attendance-delete-undo.sql in Supabase, then try again.')
  }
  throw new Error((error as { message?: string })?.message || fallback)
}

// JSONB key order can change in a response; snapshot array order still matters.
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => sameValue(value, b[index]))
  }
  const first = a as Record<string, unknown>, second = b as Record<string, unknown>
  return Object.keys(first).length === Object.keys(second).length
    && Object.keys(first).every(key => Object.hasOwn(second, key) && sameValue(first[key], second[key]))
}

/** The server captures and restores the original row without recapturing history. */
export async function removeAttendanceWithUndo(client: SupabaseClient, id: string): Promise<AttendanceRemoval> {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Select a check-in before removing it.')
  const removed = await client.rpc('lc_remove_attendance_with_undo', { p_id: id })
  if (removed.error) fail(removed.error, 'The check-in could not be removed. Please try again.')
  const row = removed.data?.attendance
  const token = removed.data?.undo_token
  if (!row || typeof token !== 'string' || !token.trim() || row.id !== id || typeof row.member_id !== 'string' || typeof row.event_id !== 'string' || typeof row.checked_in_at !== 'string') {
    throw new Error('The removed check-in could not be confirmed. Refresh Records before trying again.')
  }
  const snapshot = structuredClone(row) as AttendanceSnapshot
  const matches = (row: AttendanceSnapshot) => Object.keys(snapshot).every(key => Object.hasOwn(row, key) && sameValue(row[key], snapshot[key]))
  let undone = false
  let pending: Promise<void> | undefined

  async function restore() {
    // Only the unguessable receipt is sent back. The server owns the snapshot,
    // checks the actor/expiry and refuses conflicting IDs or newer check-ins.
    const restored = await client.rpc('lc_restore_attendance', { p_undo_token: token })
    if (restored.error) fail(restored.error, 'The check-in could not be restored. Please try Undo again.')
    if (!restored.data || !matches(restored.data as AttendanceSnapshot)) {
      throw new Error('Undo could not confirm the original check-in. Refresh Records before trying again.')
    }
    undone = true
  }
  return { attendance: structuredClone(snapshot), undo: async () => {
    if (undone) return
    if (pending) return pending
    pending = restore()
    try { await pending } finally { pending = undefined }
  } }
}
