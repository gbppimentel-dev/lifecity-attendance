-- Run this once in the Supabase SQL Editor for an existing LifeCity database.
alter table public.events
  add column if not exists is_sunday_service boolean not null default false;
