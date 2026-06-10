-- Editable attendance group rosters for the Leader Portal attendance tracker.

create table if not exists public.attendance_groups (
  id text primary key,
  name text not null,
  meeting_day text,
  meeting_time text,
  frequency text not null default 'Weekly',
  topic text,
  leader text not null default 'Unassigned',
  co_leader text,
  students jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.attendance_groups enable row level security;

drop policy if exists "Authenticated users read attendance groups" on public.attendance_groups;
drop policy if exists "Leaders manage attendance groups" on public.attendance_groups;

create policy "Authenticated users read attendance groups"
  on public.attendance_groups for select
  to authenticated
  using (true);

create policy "Leaders manage attendance groups"
  on public.attendance_groups for all
  to authenticated
  using (public.is_leader())
  with check (public.is_leader());

insert into public.attendance_groups (id, name, meeting_day, meeting_time, frequency, topic, leader, co_leader, students)
values
  ('boys', 'High School Boys', 'Wednesday', '6:30 PM', 'Weekly', 'Walking in Unity (Ephesians 4)', 'Dan K.', null, '[{"id":"sb1","name":"Daniel Quiambao"},{"id":"sb2","name":"Joshua Smith"},{"id":"sb3","name":"Caleb Harrison"},{"id":"sb4","name":"Benjamin Rogers"},{"id":"sb5","name":"Isaac Newton"},{"id":"sb6","name":"Nathan Wright"}]'::jsonb),
  ('girls', 'High School Girls', 'Wednesday', '6:30 PM', 'Weekly', 'Walking in Unity (Ephesians 4)', 'Sarah M.', null, '[{"id":"sg1","name":"Elizabeth Bennet"},{"id":"sg2","name":"Hannah Abbott"},{"id":"sg3","name":"Esther Prince"},{"id":"sg4","name":"Abigail Williams"},{"id":"sg5","name":"Ruth Peterson"},{"id":"sg6","name":"Lydia Bennet"}]'::jsonb),
  ('middle', 'Middle School Co-ed', 'Sunday', '9:30 AM', 'Weekly', 'Faith Under Pressure', 'Chris J.', null, '[{"id":"sm1","name":"Samuel Adams"},{"id":"sm2","name":"David Copperfield"},{"id":"sm3","name":"Elijah Craig"},{"id":"sm4","name":"Chloe Smith"},{"id":"sm5","name":"Grace Kelly"},{"id":"sm6","name":"Sophia Loren"}]'::jsonb)
on conflict (id) do nothing;
