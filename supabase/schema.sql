-- Attendance Monitoring: initial database schema
create extension if not exists pgcrypto;

create type public.member_status as enum ('active', 'inactive');
create type public.attendance_status as enum ('present', 'corrected');

create table public.members (
  id uuid primary key default gen_random_uuid(),
  member_number text unique not null,
  first_name text not null,
  last_name text not null,
  email text,
  mobile text,
  member_group text,
  status public.member_status not null default 'active',
  qr_token uuid unique not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  created_at timestamptz not null default now()
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id),
  event_id uuid not null references public.events(id),
  checked_in_at timestamptz not null default now(),
  status public.attendance_status not null default 'present',
  scanned_by uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  unique (member_id, event_id)
);

create index attendance_event_id_idx on public.attendance(event_id);
create index attendance_member_id_idx on public.attendance(member_id);
create index members_qr_token_idx on public.members(qr_token);

-- Enable Row Level Security now; add admin policies once authentication is built.
alter table public.members enable row level security;
alter table public.events enable row level security;
alter table public.attendance enable row level security;
