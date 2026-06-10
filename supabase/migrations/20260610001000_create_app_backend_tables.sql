create extension if not exists pgcrypto;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'markquiambao@gmail.com';
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users view own profile" on public.profiles;
create policy "Users view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Admin view all profiles" on public.profiles;
create policy "Admin view all profiles"
  on public.profiles for select
  using (public.is_admin());

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, provider, created_at, updated_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    new.raw_app_meta_data->>'provider',
    new.created_at,
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    provider = coalesce(excluded.provider, public.profiles.provider),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, email, full_name, avatar_url, provider, created_at, updated_at)
select
  id,
  email,
  coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1)),
  raw_user_meta_data->>'avatar_url',
  raw_app_meta_data->>'provider',
  created_at,
  now()
from auth.users
on conflict (id) do update set
  email = excluded.email,
  updated_at = now();

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  time_start time,
  time_end time,
  location text,
  address text,
  category text not null default 'event',
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.calendar_events enable row level security;

drop policy if exists "Authenticated users read calendar events" on public.calendar_events;
create policy "Authenticated users read calendar events"
  on public.calendar_events for select
  to authenticated
  using (true);

drop policy if exists "Admins manage calendar events" on public.calendar_events;
create policy "Admins manage calendar events"
  on public.calendar_events for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create table if not exists public.calendar_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text,
  status text not null check (status in ('going', 'not_going')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

alter table public.calendar_rsvps enable row level security;

drop policy if exists "Authenticated users read rsvp counts" on public.calendar_rsvps;
create policy "Authenticated users read rsvp counts"
  on public.calendar_rsvps for select
  to authenticated
  using (true);

drop policy if exists "Users manage own rsvps" on public.calendar_rsvps;
create policy "Users manage own rsvps"
  on public.calendar_rsvps for all
  to authenticated
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

create table if not exists public.roster (
  id text primary key,
  role_name text not null,
  assignee text,
  status text not null default 'confirmed',
  time_slot text,
  sub_reason text,
  sub_requested_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.roster enable row level security;

drop policy if exists "Authenticated users manage roster" on public.roster;
create policy "Authenticated users manage roster"
  on public.roster for all
  to authenticated
  using (true)
  with check (true);

create table if not exists public.attendance (
  id text primary key,
  group_key text not null,
  group_name text not null,
  session_date text not null,
  present_count integer not null default 0,
  total_count integer not null default 0,
  present text[] not null default '{}',
  absent text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.attendance enable row level security;

drop policy if exists "Authenticated users manage attendance" on public.attendance;
create policy "Authenticated users manage attendance"
  on public.attendance for all
  to authenticated
  using (true)
  with check (true);

create table if not exists public.attendance_groups (
  id text primary key,
  name text not null,
  leader text not null default 'Unassigned',
  students jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.attendance_groups enable row level security;

drop policy if exists "Authenticated users read attendance groups" on public.attendance_groups;
create policy "Authenticated users read attendance groups"
  on public.attendance_groups for select
  to authenticated
  using (true);

drop policy if exists "Leaders manage attendance groups" on public.attendance_groups;
create policy "Leaders manage attendance groups"
  on public.attendance_groups for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create table if not exists public.feedback (
  id text primary key,
  group_key text not null,
  group_name text not null,
  leader_name text,
  rating integer not null default 5,
  highlights text not null,
  prayers text,
  session_date text not null,
  lesson_topic text,
  attendance_count text,
  status text not null default 'unread',
  comments text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

drop policy if exists "Authenticated users manage feedback" on public.feedback;
create policy "Authenticated users manage feedback"
  on public.feedback for all
  to authenticated
  using (true)
  with check (true);

create table if not exists public.leader_briefings (
  id text primary key default 'current',
  data jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.leader_briefings enable row level security;

drop policy if exists "Authenticated users read leader briefings" on public.leader_briefings;
create policy "Authenticated users read leader briefings"
  on public.leader_briefings for select
  to authenticated
  using (true);

drop policy if exists "Admins manage leader briefings" on public.leader_briefings;
create policy "Admins manage leader briefings"
  on public.leader_briefings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.leader_briefings (id, data)
values (
  'current',
  '{
    "scriptures": [
      {
        "id": "s1",
        "label": "Old Testament",
        "ref": "Deuteronomy 6:4-9",
        "url": "https://www.biblegateway.com/passage/?search=Deuteronomy+6%3A4-9&version=ESV"
      },
      {
        "id": "s2",
        "label": "Gospel Reading",
        "ref": "Mark 12:28-31",
        "url": "https://www.biblegateway.com/passage/?search=Mark+12%3A28-31&version=ESV"
      },
      {
        "id": "s3",
        "label": "New Testament Epistle",
        "ref": "Ephesians 4:1-6",
        "url": "https://www.biblegateway.com/passage/?search=Ephesians+4%3A1-6&version=ESV"
      }
    ],
    "questions": [
      {
        "id": "q1",
        "category": "Icebreaker",
        "text": "Share one highlight from your past week and one area where you saw God''s guidance."
      },
      {
        "id": "q2",
        "category": "Observation (Mark 12:30)",
        "text": "What does loving God with all your heart, soul, mind, and strength look like in your daily school routines?"
      },
      {
        "id": "q3",
        "category": "Application (Eph 4:2-3)",
        "text": "How do humility, gentleness, and patience build up unity within our small group and prevent peer conflicts?"
      },
      {
        "id": "q4",
        "category": "Action / Prayer Focus",
        "text": "Pray for each other by name, focusing specifically on opportunities to show Christ''s love to someone this week."
      }
    ]
  }'::jsonb
)
on conflict (id) do nothing;

create table if not exists public.prayers (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  name text not null default 'Anonymous',
  category text not null default 'Faith',
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.prayers enable row level security;

drop policy if exists "Authenticated users read prayers" on public.prayers;
create policy "Authenticated users read prayers"
  on public.prayers for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users create prayers" on public.prayers;
create policy "Authenticated users create prayers"
  on public.prayers for insert
  to authenticated
  with check (auth.uid() = user_id or user_id is null);

drop policy if exists "Users and admins delete prayers" on public.prayers;
create policy "Users and admins delete prayers"
  on public.prayers for delete
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

create table if not exists public.prayer_amens (
  prayer_id text not null references public.prayers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (prayer_id, user_id)
);

alter table public.prayer_amens enable row level security;

drop policy if exists "Authenticated users read prayer amens" on public.prayer_amens;
create policy "Authenticated users read prayer amens"
  on public.prayer_amens for select
  to authenticated
  using (true);

drop policy if exists "Users manage own prayer amens" on public.prayer_amens;
create policy "Users manage own prayer amens"
  on public.prayer_amens for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.journal_entries (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  scripture text,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.journal_entries enable row level security;

drop policy if exists "Users manage own journal entries" on public.journal_entries;
create policy "Users manage own journal entries"
  on public.journal_entries for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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

drop policy if exists "Authenticated users read announcements" on public.announcements;
create policy "Authenticated users read announcements"
  on public.announcements for select
  to authenticated
  using (true);

drop policy if exists "Admins manage announcements" on public.announcements;
create policy "Admins manage announcements"
  on public.announcements for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create table if not exists public.study_series (
  id text primary key,
  name text not null,
  translation text,
  ref text,
  summary jsonb not null default '[]',
  readings jsonb not null default '[]',
  questions jsonb not null default '[]',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.study_series enable row level security;

drop policy if exists "Authenticated users read study series" on public.study_series;
create policy "Authenticated users read study series"
  on public.study_series for select
  to authenticated
  using (true);

drop policy if exists "Admins manage study series" on public.study_series;
create policy "Admins manage study series"
  on public.study_series for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.study_series (id, name, translation, ref, readings, summary, questions, sort_order)
values
  (
    'study_love',
    'The Call to Love',
    'Love God, Love People',
    'Mark 12:28-34',
    '[{"category":"Old Testament","ref":"Deuteronomy 6:4-9","badgeClass":"badge-torah"},{"category":"Gospel Reading","ref":"Mark 12:28-34","badgeClass":"badge-gospel"},{"category":"New Testament Epistle","ref":"Romans 13:8-10","badgeClass":"badge-haftarah"}]'::jsonb,
    '["Loving God and Neighbor: In this study, a scribe asks Jesus which commandment is the most important of all. Jesus answers by quoting the Shema (Deut 6:4-5), calling us to love God with all our heart, soul, mind, and strength, and immediately connects it to the second commandment: to love our neighbors as ourselves. Loving God and others is the ultimate fulfillment of the Law.","Deuteronomy and Romans Connections: Paul in Romans 13 reinforces this lesson by stating that love is the fulfilling of the law. If we love our neighbors, we will naturally refrain from doing them harm, thereby satisfying all commandments regarding human relationships."]'::jsonb,
    '["What does it look like practically to love God with all of your mind in today''s digital, distraction-filled world?","Why do you think Jesus connected loving God and loving others? Can you truly have a healthy relationship with God while neglecting your neighbor?","In Romans 13:10, Paul says love does no wrong to a neighbor. How does this check our speech, gossip, and social media habits?"]'::jsonb,
    1
  ),
  (
    'study_unity',
    'Walking in Unity',
    'One Body, One Spirit',
    'Ephesians 4:1-16',
    '[{"category":"Old Testament","ref":"Psalms 133:1-3","badgeClass":"badge-torah"},{"category":"Gospel Reading","ref":"John 17:20-23","badgeClass":"badge-gospel"},{"category":"New Testament Epistle","ref":"Ephesians 4:1-6","badgeClass":"badge-haftarah"}]'::jsonb,
    '["Humility & Patience: Paul encourages the Ephesian church to walk in a manner worthy of their calling. He highlights humility, gentleness, patience, and bearing with one another in love as key traits. The ultimate goal is to maintain the unity of the Spirit in the bond of peace.","One Body & One Faith: We are reminded that there is one body and one Spirit, one hope, one Lord, one faith, one baptism, and one God and Father of all. Christ provides various spiritual gifts to build up the body in love, helping us grow into spiritual maturity together."]'::jsonb,
    '["Paul lists humility, gentleness, and patience as requirements for unity. Which of these is most challenging for you in your daily relationships, and why?","How does Jesus'' prayer for unity in John 17:21 show the importance of how we treat each other?","What are practical ways our youth group small groups can support members who feel lonely or are going through difficult struggles?"]'::jsonb,
    2
  ),
  (
    'study_faith',
    'Stepping Out in Faith',
    'Trusting God''s Promises',
    'Hebrews 11',
    '[{"category":"Old Testament","ref":"Numbers 13:25-33","badgeClass":"badge-torah"},{"category":"Gospel Reading","ref":"Matthew 14:22-33","badgeClass":"badge-gospel"},{"category":"New Testament Epistle","ref":"Hebrews 11:1-6","badgeClass":"badge-haftarah"}]'::jsonb,
    '["Faith Over Fear: Caleb and Joshua stood out from the other ten spies by focusing on God''s promise rather than the giants in Canaan. Hebrews 11 defines faith as the assurance of things hoped for and the conviction of things not seen, pointing to ancient witnesses who walked in trust.","Focusing on Jesus: Matthew 14 shows Peter stepping out of the boat to walk on water toward Jesus. He was successful as long as his eyes were on Christ, but began to sink the moment he focused on the wind and waves. Jesus catches him and calls him to have faith without doubting."]'::jsonb,
    '["Caleb and Joshua saw the same giants as the other ten spies but chose to trust God. What are the giants, fears, or pressures in your life right now, and how can you shift your focus?","Peter sank when he looked at the waves. What are typical waves or distractions that cause you to lose your focus on Jesus?","How does sharing our doubts and struggles in small groups help build up each other''s confidence to step out in faith?"]'::jsonb,
    3
  )
on conflict (id) do nothing;

create table if not exists public.announcement_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  title text not null,
  audience text not null,
  channel text not null,
  canva_url text,
  body text not null,
  updated_at timestamptz not null default now()
);

alter table public.announcement_drafts enable row level security;

drop policy if exists "Users manage own announcement draft" on public.announcement_drafts;
create policy "Users manage own announcement draft"
  on public.announcement_drafts for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
