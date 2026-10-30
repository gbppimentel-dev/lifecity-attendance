import type { SupabaseClient } from '@supabase/supabase-js';

export type MemberStatus = 'active' | 'inactive';
export type MemberStatusRow = { id: string; status: MemberStatus };
export type MemberStatusChange = MemberStatusRow & {
  previousStatus: MemberStatus;
  undo: () => Promise<MemberStatusRow>;
};

export class MemberStatusConflictError extends Error {
  readonly code = 'MEMBER_STATUS_CONFLICT';
  constructor(undo: boolean) {
    super(
      undo
        ? 'This member’s status changed after this update, or your access no longer allows Undo. Refresh Members before trying again.'
        : 'This member’s status has changed or could not be updated with your current access. Refresh Members before trying again.',
    );
    this.name = 'MemberStatusConflictError';
  }
}

const validStatus = (value: unknown): value is MemberStatus =>
  value === 'active' || value === 'inactive';

export async function setMemberStatusWithUndo(
  client: SupabaseClient,
  id: string,
  expectedStatus: MemberStatus,
  nextStatus: MemberStatus,
): Promise<MemberStatusChange> {
  if (
    typeof id !== 'string' ||
    !id.trim() ||
    !validStatus(expectedStatus) ||
    !validStatus(nextStatus) ||
    expectedStatus === nextStatus
  ) {
    throw new Error('Choose a member and a different valid status before saving.');
  }

  async function write(
    expected: MemberStatus,
    next: MemberStatus,
    undo = false,
  ): Promise<MemberStatusRow> {
    const { data, error } = await client
      .from('members')
      .update({ status: next })
      .eq('id', id)
      .eq('status', expected)
      .select('id,status')
      .maybeSingle();
    if (error) {
      throw new Error(
        error.message ||
          (undo
            ? 'The member’s status could not be restored. Please try Undo again.'
            : 'The member’s status could not be saved. Please try again.'),
      );
    }
    if (!data) throw new MemberStatusConflictError(undo);
    if (data.id !== id || data.status !== next) {
      throw new Error(
        'The saved member status could not be confirmed. Refresh Members before trying again.',
      );
    }
    return { id, status: next };
  }

  const saved = await write(expectedStatus, nextStatus);
  let undone = false;
  let pending: Promise<MemberStatusRow> | undefined;
  return {
    ...saved,
    previousStatus: expectedStatus,
    undo: async () => {
      if (undone) return { id, status: expectedStatus };

      if (!pending) pending = write(nextStatus, expectedStatus, true);
      try {
        const restored = await pending;
        undone = true;
        return { ...restored };
      } finally {
        pending = undefined;
      }
    },
  };
}
