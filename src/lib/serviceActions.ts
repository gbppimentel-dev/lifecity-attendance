import type { SupabaseClient } from '@supabase/supabase-js'

export type ServiceSnapshot = {
  id: string
  name: string
  is_sunday_service: boolean
  archived_at: string | null
  [column: string]: unknown
}

export type ServiceChange = { service: ServiceSnapshot; undo: () => Promise<void> }

export class AttendedServiceError extends Error {
  constructor() {
    super('This service now has attendance records. Archive it instead to preserve its history.')
    this.name = 'AttendedServiceError'
  }
}

function fail(error: unknown) {
  throw new Error((error as { message?: string })?.message || 'The service could not be updated. Please try again.')
}

/** Compare the changed field so Undo rejects a different current value. */
export async function changeServiceField(
  client: SupabaseClient, id: string, field: 'is_sunday_service' | 'archived_at',
  previous: boolean | string | null, next: boolean | string | null,
): Promise<ServiceChange> {
  async function write(expected: boolean | string | null, value: boolean | string | null) {
    let query = client.from('events').update({ [field]: value }).eq('id', id)
    query = expected === null ? query.is(field, null) : query.eq(field, expected)
    const { data, error } = await query.select('*').maybeSingle()
    if (error) fail(error)
    if (!data) throw new Error('This service has changed since you opened it. Refresh Services before trying again.')
    return data as ServiceSnapshot
  }
  const service = await write(previous, next)
  let undone = false
  return { service, undo: async () => {
    if (undone) return
    await write(next, previous)
    undone = true
  } }
}

/** Attendance is guarded again by the database's FK and protection trigger. */
export async function deleteServiceWithUndo(client: SupabaseClient, id: string): Promise<ServiceChange> {
  const { count, error: checkError } = await client.from('attendance')
    .select('id', { count: 'exact', head: true }).eq('event_id', id)
  if (checkError) fail(checkError)
  if (count === null) throw new Error('Attendance could not be checked. Refresh Services and try again.')
  if (count > 0) throw new AttendedServiceError()

  // RETURNING captures the actual deleted row, including its ID, timestamps and
  // columns that are not part of the paginated Services response.
  const { data, error } = await client.from('events').delete().eq('id', id).select('*').maybeSingle()
  if (error) fail(error)
  if (!data) throw new Error('The service was not deleted. It may have changed or your access may be restricted.')
  const service = data as ServiceSnapshot
  let undone = false
  const matches = (row: ServiceSnapshot) => Object.keys(service).every(key => JSON.stringify(row[key]) === JSON.stringify(service[key]))
  async function readExisting() {
    const result = await client.from('events').select('*').eq('id', id).maybeSingle()
    if (result.error) fail(result.error)
    return result.data as ServiceSnapshot | null
  }
  return { service, undo: async () => {
    if (undone) return
    const existing = await readExisting()
    if (existing) {
      if (!matches(existing)) throw new Error('A service with this ID already exists and has changed. Undo will not overwrite it.')
      undone = true
      return
    }
    const restored = await client.from('events').insert(service).select('id').single()
    if (restored.error) {
      // Retrying an uncertain response is safe when the identical row already
      // exists. A different row is never replaced or upserted.
      if (restored.error.code !== '23505' || !matches((await readExisting()) ?? {} as ServiceSnapshot)) fail(restored.error)
    }
    undone = true
  } }
}
