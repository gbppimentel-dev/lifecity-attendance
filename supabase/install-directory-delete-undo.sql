-- LifeCity: safe empty-ministry deletion for the directory's Undo action.
-- Run this whole file once in the Supabase SQL editor for your LifeCity project.
-- This installs one function. It does not reset data or change existing policies.
begin;

create or replace function public.lc_delete_empty_ministry(p_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  deleted public.ministries%rowtype;
begin
  if auth.uid() is null or not public.lc_has_admin_access() then
    raise exception 'Active Owner or Administrator access is required.' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'A ministry ID is required.' using errcode = '22023';
  end if;

  -- FOR UPDATE conflicts with the FK's KEY SHARE lock for new assignments.
  -- If an assignment committed while this lock was waiting, the next statement
  -- sees it before DELETE. If this lock wins, a later assignment cannot commit
  -- against a deleted parent. Keep this separate from the membership check.
  perform 1 from public.ministries where id = p_id for update;
  if not found then return null; end if;

  if exists (select 1 from public.member_ministries where ministry_id = p_id) then
    raise exception 'This ministry is now assigned to members. Remove its member assignments before deleting it.' using errcode = '23503';
  end if;

  delete from public.ministries where id = p_id returning * into deleted;
  if not found then return null; end if;
  return to_jsonb(deleted);
end;
$function$;

revoke all on function public.lc_delete_empty_ministry(uuid) from public, anon;
grant execute on function public.lc_delete_empty_ministry(uuid) to authenticated;
comment on function public.lc_delete_empty_ministry(uuid) is
  'LC-DIRECTORY-UNDO-v1: locks and deletes only an empty ministry, returning its complete Undo snapshot; caller RLS remains active.';

notify pgrst, 'reload schema';
commit;
