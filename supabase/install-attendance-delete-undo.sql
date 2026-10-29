-- LifeCity attendance removal with exact historical Undo.
-- Run this entire file once in the Supabase SQL editor; it is safe to rerun.
-- Requires the existing attendance reporting/snapshot installation and accounts.
-- No attendance data is reset. Existing table grants, RLS policies, snapshot
-- capture and activity logging remain in place.
begin;

do $check$
begin
  if to_regprocedure('public.lc_has_admin_access()') is null
     or to_regprocedure('public.capture_attendance_snapshot_v3()') is null then
    raise exception 'Install the existing LifeCity accounts and attendance reporting schema first.';
  end if;
end;
$check$;

-- Receipts are server-only. They contain the actual DELETE RETURNING row,
-- never historical details supplied by a browser. The browser gets only its
-- own receipt token and the row returned by its removal request.
create table if not exists public.lc_attendance_undo_receipts (
  token uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  attendance_id uuid not null,
  row_data jsonb not null check (jsonb_typeof(row_data) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '24 hours'),
  restoring boolean not null default false,
  restored_at timestamptz
);
create index if not exists lc_attendance_undo_receipts_expiry
  on public.lc_attendance_undo_receipts(expires_at);
alter table public.lc_attendance_undo_receipts enable row level security;
revoke all on table public.lc_attendance_undo_receipts from public, anon, authenticated;

-- Normal inserts still run capture_attendance_snapshot_v3 first. Only the
-- guarded restore RPC sets this transaction-local context and marks a locked
-- receipt as restoring. Preserve every other trigger's decisions: if another
-- field differs, refuse restoration rather than bypassing that guard.
create or replace function public.lc_apply_attendance_undo_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  context_token text := current_setting('lifecity.attendance_undo_token', true);
  receipt public.lc_attendance_undo_receipts%rowtype;
begin
  if context_token is null or context_token = '' then return new; end if;
  if auth.uid() is null or not public.lc_has_admin_access() then
    raise exception 'Active Owner or Administrator access is required.' using errcode = '42501';
  end if;
  select * into receipt
  from public.lc_attendance_undo_receipts
  where token::text = context_token and actor_id = auth.uid()
    and attendance_id = new.id and restoring and restored_at is null
    and expires_at > clock_timestamp();
  if not found then
    raise exception 'An authorized attendance Undo is required.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'report_snapshot') is distinct from (receipt.row_data - 'report_snapshot') then
    raise exception 'The check-in changed during restoration. Undo did not replace it.' using errcode = '40001';
  end if;
  new.report_snapshot := receipt.row_data -> 'report_snapshot';
  return new;
end;
$function$;
revoke all on function public.lc_apply_attendance_undo_snapshot() from public, anon, authenticated;
drop trigger if exists zz_lc_attendance_restore_snapshot on public.attendance;
create trigger zz_lc_attendance_restore_snapshot
  before insert on public.attendance for each row
  execute function public.lc_apply_attendance_undo_snapshot();

create or replace function public.lc_remove_attendance_with_undo(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  removed public.attendance%rowtype;
  receipt_token uuid;
begin
  if auth.uid() is null or not public.lc_has_admin_access() then
    raise exception 'Active Owner or Administrator access is required.' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'An attendance ID is required.' using errcode = '22023';
  end if;
  delete from public.lc_attendance_undo_receipts where expires_at <= clock_timestamp();
  delete from public.attendance where id = p_id returning * into removed;
  if not found then return null; end if;
  insert into public.lc_attendance_undo_receipts(actor_id, attendance_id, row_data)
    values(auth.uid(), removed.id, to_jsonb(removed)) returning token into receipt_token;
  return jsonb_build_object('attendance', to_jsonb(removed), 'undo_token', receipt_token);
end;
$function$;

create or replace function public.lc_restore_attendance(p_undo_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  receipt public.lc_attendance_undo_receipts%rowtype;
  restored public.attendance%rowtype;
  existing public.attendance%rowtype;
  prior_context text;
begin
  if auth.uid() is null or not public.lc_has_admin_access() then
    raise exception 'Active Owner or Administrator access is required.' using errcode = '42501';
  end if;
  if p_undo_token is null then
    raise exception 'An attendance Undo token is required.' using errcode = '22023';
  end if;
  select * into receipt from public.lc_attendance_undo_receipts
    where token = p_undo_token and actor_id = auth.uid() for update;
  if not found then
    raise exception 'This attendance Undo is unavailable.' using errcode = 'P0002';
  end if;
  if receipt.expires_at <= clock_timestamp() then
    raise exception 'This attendance Undo has expired.' using errcode = 'P0001';
  end if;

  select * into existing from public.attendance where id = receipt.attendance_id for update;
  if found then
    if to_jsonb(existing) is distinct from receipt.row_data then
      raise exception 'This attendance ID is already in use. Undo did not replace it.' using errcode = '40001';
    end if;
    update public.lc_attendance_undo_receipts
      set restored_at = coalesce(restored_at, clock_timestamp()), restoring = false
      where token = receipt.token;
    return to_jsonb(existing);
  end if;
  if receipt.restored_at is not null then
    raise exception 'The restored check-in has since been removed. Undo did not recreate it.' using errcode = '40001';
  end if;

  prior_context := current_setting('lifecity.attendance_undo_token', true);
  update public.lc_attendance_undo_receipts set restoring = true where token = receipt.token;
  perform set_config('lifecity.attendance_undo_token', receipt.token::text, true);
  begin
    insert into public.attendance
      select (jsonb_populate_record(null::public.attendance, receipt.row_data)).*
      on conflict do nothing returning * into restored;
    if not found then
      -- A competing insert may have committed while the unique check waited.
      -- Accept only the identical original row; never update a replacement.
      select * into restored from public.attendance where id = receipt.attendance_id;
      if not found or to_jsonb(restored) is distinct from receipt.row_data then
        raise exception 'Another check-in already exists. Undo did not replace it.' using errcode = '23505';
      end if;
    end if;
    if to_jsonb(restored) is distinct from receipt.row_data then
      raise exception 'The historical check-in could not be restored exactly.' using errcode = '40001';
    end if;
  exception when others then
    perform set_config('lifecity.attendance_undo_token', coalesce(prior_context, ''), true);
    raise;
  end;
  perform set_config('lifecity.attendance_undo_token', coalesce(prior_context, ''), true);
  update public.lc_attendance_undo_receipts
    set restored_at = clock_timestamp(), restoring = false where token = receipt.token;
  return to_jsonb(restored);
end;
$function$;

revoke all on function public.lc_remove_attendance_with_undo(uuid) from public, anon;
revoke all on function public.lc_restore_attendance(uuid) from public, anon;
grant execute on function public.lc_remove_attendance_with_undo(uuid) to authenticated;
grant execute on function public.lc_restore_attendance(uuid) to authenticated;
comment on function public.lc_remove_attendance_with_undo(uuid) is
  'LC-ATTENDANCE-UNDO-v1: active staff removal and an actor-bound server receipt; no browser-supplied historical snapshot.';
comment on function public.lc_restore_attendance(uuid) is
  'LC-ATTENDANCE-UNDO-v1: restores the original row and historical snapshot once; exact retry is idempotent and conflicts are never overwritten.';
notify pgrst, 'reload schema';
commit;
