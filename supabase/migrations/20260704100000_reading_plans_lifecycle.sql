-- Reading Plans Phase 0: enrollment lifecycle. Until now an enrollment row
-- was binary (exists or doesn't) and quitting deleted all progress outright.
-- This adds pause/complete/abandon states so leaving a plan never destroys
-- history, plus the columns later phases (reminders, calendar mode) build on.

alter table public.reading_plan_enrollments
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'abandoned')),
  add column if not exists completed_at timestamptz,
  add column if not exists reminder_time time,
  add column if not exists timezone text;

create unique index if not exists reading_plan_enrollments_id_idx
  on public.reading_plan_enrollments (id);
