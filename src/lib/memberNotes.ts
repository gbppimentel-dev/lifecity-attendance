import type { SupabaseClient } from '@supabase/supabase-js';

export async function saveMemberAdminNote(
  client: SupabaseClient,
  id: string,
  expectedNote: string | null,
  draft: string,
): Promise<{ id: string; admin_note: string | null }> {
  if (
    !id?.trim() ||
    (expectedNote !== null && typeof expectedNote !== 'string') ||
    typeof draft !== 'string'
  ) {
    throw new Error('Choose a member before saving a private note.');
  }
  if (draft.length > 1000) throw new Error('Keep the private note within 1,000 characters.');
  const admin_note = draft.trim() || null;
  if (admin_note === expectedNote) return { id, admin_note };
  let query = client.from('members').update({ admin_note }).eq('id', id);
  query =
    expectedNote === null ? query.is('admin_note', null) : query.eq('admin_note', expectedNote);
  const { data, error } = await query.select('id,admin_note').maybeSingle();
  if (error) throw new Error(error.message || 'The note could not be saved. Please try again.');
  if (!data)
    throw new Error(
      'This note changed elsewhere, or your access no longer allows this update. Close the note and refresh Members before editing again.',
    );
  if (data.id !== id || data.admin_note !== admin_note)
    throw new Error('The saved note could not be confirmed. Refresh Members before trying again.');
  return { id, admin_note };
}
