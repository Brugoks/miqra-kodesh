-- Remove seeded demo announcements and allow leaders/admins to manage real posts.

create table if not exists public.announcements (
  id text primary key,
  title text not null,
  body text not null,
  announcement_date date not null default current_date,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

delete from public.announcements
where id in (
  'ann_2026_06_09_groups',
  'ann_2026_06_07_camp',
  'ann_2026_06_05_studies'
);

drop policy if exists "Admins manage announcements" on public.announcements;
drop policy if exists "Leaders manage announcements" on public.announcements;
drop policy if exists "Authenticated users read announcements" on public.announcements;

create policy "Authenticated users read announcements"
  on public.announcements for select
  to authenticated
  using (true);

create policy "Leaders manage announcements"
  on public.announcements for all
  to authenticated
  using (public.is_leader())
  with check (public.is_leader());
