-- Reading plan enrollment and per-day completion tracking. Plan definitions
-- (day → chapters) live in src/lib/readingPlans.js and are generated from
-- canonical chapter counts, so only user progress is stored here.

create table public.reading_plan_enrollments (
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  plan_id    text        not null,
  started_at timestamptz not null default now(),
  primary key (user_id, plan_id)
);

create table public.reading_plan_progress (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.profiles(id) on delete cascade,
  plan_id      text        not null,
  day          int         not null,
  completed_at timestamptz not null default now()
);

create unique index reading_plan_progress_user_plan_day_idx
  on public.reading_plan_progress (user_id, plan_id, day);

create index reading_plan_progress_user_time_idx
  on public.reading_plan_progress (user_id, completed_at desc);

alter table public.reading_plan_enrollments enable row level security;
alter table public.reading_plan_progress enable row level security;

create policy "users manage own enrollments"
  on public.reading_plan_enrollments for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage own reading progress"
  on public.reading_plan_progress for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
