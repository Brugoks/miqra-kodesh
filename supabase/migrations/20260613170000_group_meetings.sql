-- Per-meeting agenda board for small groups. The "next meeting" date is derived
-- client-side from attendance_groups.meeting_day/frequency; this table stores the
-- editable, member-visible details for a specific meeting date so the group can
-- come prepared (facilitator, agenda, focus passage, location, notes).
--
-- Keyed by (group_id, meeting_date) so the panel rolls forward automatically:
-- once a date passes, the computed "next meeting" advances and a fresh row is
-- created on demand. Past rows remain as a lightweight meeting history.

create table if not exists public.group_meetings (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.attendance_groups(id) on delete cascade,
  meeting_date date not null,
  facilitator text,
  focus_passage text,
  agenda text,
  location text,
  notes text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, meeting_date)
);

create index if not exists group_meetings_group_date_idx
  on public.group_meetings (group_id, meeting_date desc);

alter table public.group_meetings enable row level security;

-- All authenticated members can read meeting details so they can prepare.
drop policy if exists "Authenticated users read group meetings" on public.group_meetings;
create policy "Authenticated users read group meetings"
  on public.group_meetings for select
  to authenticated
  using (true);

-- Only leaders can create/edit meeting details (mirrors attendance_groups).
drop policy if exists "Leaders manage group meetings" on public.group_meetings;
create policy "Leaders manage group meetings"
  on public.group_meetings for all
  to authenticated
  using (public.is_leader())
  with check (public.is_leader());
