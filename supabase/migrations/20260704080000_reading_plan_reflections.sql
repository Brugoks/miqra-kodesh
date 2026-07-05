-- Reading Plans Phase 5: a one-line daily reflection journal. `shared` marks
-- a reflection visible to a group's members once reading_plan_groups exists
-- (see the Phase 6 migration for that select policy) — for now reflections
-- are strictly user-owned.

create table public.reading_plan_reflections (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  plan_id    text        not null,
  day        int         not null,
  content    text        not null,
  shared     boolean     not null default false,
  created_at timestamptz not null default now()
);

create unique index reading_plan_reflections_user_plan_day_idx
  on public.reading_plan_reflections (user_id, plan_id, day);

alter table public.reading_plan_reflections enable row level security;

create policy "users manage own reflections"
  on public.reading_plan_reflections for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
