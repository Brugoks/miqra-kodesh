-- Migration to add multi-tenant organization support (Option B: Many-to-Many) with Custom Branding.
-- Creates the organizations table, profile_organizations join table,
-- links tenant tables via organization_id, sets up RLS policies,
-- and creates storage buckets and policies for organization logos.

-- 0. Ensure missing tables from previously altered local migrations exist on remote
create table if not exists public.leader_briefings (
  id text primary key default 'current',
  data jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.leader_briefings enable row level security;

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

-- 1. Create organizations table with branding columns
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  invite_code text unique not null,
  logo_url text,
  primary_color text not null default '#2e52be',
  secondary_color text not null default '#ffffff',
  created_at timestamptz not null default now()
);

-- Enable RLS on organizations
alter table public.organizations enable row level security;

-- Read policy: authenticated and anonymous users can read organizations
create policy "allow_select_organizations" on public.organizations
  for select to authenticated, anon using (true);

-- Admin policy: developer or admin can insert/update organizations
create policy "allow_admin_manage_organizations" on public.organizations
  for all to authenticated
  using (public.is_developer() or public.is_admin())
  with check (public.is_developer() or public.is_admin());

-- 2. Seed Default Organization (Charleston Baptist Church)
insert into public.organizations (name, slug, invite_code, primary_color, secondary_color)
values ('Charleston Baptist Church', 'charleston-baptist', 'CBC-STUDENTS-2026', '#2e52be', '#ffffff')
on conflict (slug) do nothing;

-- Helper to get default organization ID
create or replace function public.get_default_organization_id()
returns uuid
language sql
stable
as $$
  select id from public.organizations where slug = 'charleston-baptist' limit 1;
$$;

-- 3. Define the function to get the current user's active organization_id
create or replace function public.get_my_organization_id()
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  org_id uuid;
begin
  select active_organization_id into org_id from public.profiles where id = auth.uid();
  return org_id;
end;
$$;

-- 4. Create profile_organizations join table (Many-to-Many)
create table if not exists public.profile_organizations (
  profile_id uuid references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, organization_id)
);

-- Enable RLS on profile_organizations
alter table public.profile_organizations enable row level security;

-- Policies for profile_organizations
create policy "profile_organizations_select" on public.profile_organizations
  for select to authenticated
  using (profile_id = auth.uid() or public.is_developer());

create policy "profile_organizations_insert" on public.profile_organizations
  for insert to authenticated
  with check (profile_id = auth.uid() or public.is_developer());

-- 5. Add active_organization_id to profiles and update handle_new_user trigger
alter table public.profiles add column if not exists active_organization_id uuid references public.organizations(id);

-- Update existing profiles: seed their memberships and active organization
insert into public.profile_organizations (profile_id, organization_id)
select id, public.get_default_organization_id() from public.profiles
on conflict do nothing;

update public.profiles set active_organization_id = public.get_default_organization_id() where active_organization_id is null;

-- Make active_organization_id NOT NULL
alter table public.profiles alter column active_organization_id set not null;

-- Recreate handle_new_user function to parse invite_code and insert into join table
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
begin
  -- Look up organization by invite code passed in raw_user_meta_data
  select id into org_id
  from public.organizations
  where invite_code = (new.raw_user_meta_data->>'invite_code');

  -- If not found, default to Charleston Baptist Church
  if org_id is null then
    org_id := public.get_default_organization_id();
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, provider, role, active_organization_id, created_at, updated_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    new.raw_app_meta_data->>'provider',
    case
      when new.email = 'markquiambao@gmail.com' then 'developer'
      else 'student'
    end,
    org_id,
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    provider = coalesce(excluded.provider, public.profiles.provider),
    role = case
      when excluded.email = 'markquiambao@gmail.com' then 'developer'
      else public.profiles.role
    end,
    active_organization_id = excluded.active_organization_id,
    updated_at = now();

  -- Add to the join table
  insert into public.profile_organizations (profile_id, organization_id)
  values (new.id, org_id)
  on conflict do nothing;

  return new;
end;
$$;

-- 6. Add organization_id column to other tables
alter table public.calendar_events add column if not exists organization_id uuid references public.organizations(id);
alter table public.calendar_rsvps add column if not exists organization_id uuid references public.organizations(id);
alter table public.roster add column if not exists organization_id uuid references public.organizations(id);
alter table public.attendance add column if not exists organization_id uuid references public.organizations(id);
alter table public.attendance_groups add column if not exists organization_id uuid references public.organizations(id);
alter table public.feedback add column if not exists organization_id uuid references public.organizations(id);
alter table public.leader_briefings add column if not exists organization_id uuid references public.organizations(id);
alter table public.prayers add column if not exists organization_id uuid references public.organizations(id);
alter table public.prayer_amens add column if not exists organization_id uuid references public.organizations(id);
alter table public.journal_entries add column if not exists organization_id uuid references public.organizations(id);
alter table public.announcements add column if not exists organization_id uuid references public.organizations(id);
alter table public.study_series add column if not exists organization_id uuid references public.organizations(id);
alter table public.announcement_drafts add column if not exists organization_id uuid references public.organizations(id);
alter table public.feedback_tickets add column if not exists organization_id uuid references public.organizations(id);
alter table public.feedback_ticket_votes add column if not exists organization_id uuid references public.organizations(id);
alter table public.feedback_ticket_comments add column if not exists organization_id uuid references public.organizations(id);
alter table public.feedback_ticket_events add column if not exists organization_id uuid references public.organizations(id);

-- Update existing rows to default org
update public.calendar_events set organization_id = public.get_default_organization_id() where organization_id is null;
update public.calendar_rsvps set organization_id = public.get_default_organization_id() where organization_id is null;
update public.roster set organization_id = public.get_default_organization_id() where organization_id is null;
update public.attendance set organization_id = public.get_default_organization_id() where organization_id is null;
update public.attendance_groups set organization_id = public.get_default_organization_id() where organization_id is null;
update public.feedback set organization_id = public.get_default_organization_id() where organization_id is null;
update public.leader_briefings set organization_id = public.get_default_organization_id() where organization_id is null;
update public.prayers set organization_id = public.get_default_organization_id() where organization_id is null;
update public.prayer_amens set organization_id = public.get_default_organization_id() where organization_id is null;
update public.journal_entries set organization_id = public.get_default_organization_id() where organization_id is null;
update public.announcements set organization_id = public.get_default_organization_id() where organization_id is null;
update public.study_series set organization_id = public.get_default_organization_id() where organization_id is null;
update public.announcement_drafts set organization_id = public.get_default_organization_id() where organization_id is null;
update public.feedback_tickets set organization_id = public.get_default_organization_id() where organization_id is null;
update public.feedback_ticket_votes set organization_id = public.get_default_organization_id() where organization_id is null;
update public.feedback_ticket_comments set organization_id = public.get_default_organization_id() where organization_id is null;
update public.feedback_ticket_events set organization_id = public.get_default_organization_id() where organization_id is null;

-- Make organization_id NOT NULL
alter table public.calendar_events alter column organization_id set not null;
alter table public.calendar_rsvps alter column organization_id set not null;
alter table public.roster alter column organization_id set not null;
alter table public.attendance alter column organization_id set not null;
alter table public.attendance_groups alter column organization_id set not null;
alter table public.feedback alter column organization_id set not null;
alter table public.leader_briefings alter column organization_id set not null;
alter table public.prayers alter column organization_id set not null;
alter table public.prayer_amens alter column organization_id set not null;
alter table public.journal_entries alter column organization_id set not null;
alter table public.announcements alter column organization_id set not null;
alter table public.study_series alter column organization_id set not null;
alter table public.announcement_drafts alter column organization_id set not null;
alter table public.feedback_tickets alter column organization_id set not null;
alter table public.feedback_ticket_votes alter column organization_id set not null;
alter table public.feedback_ticket_comments alter column organization_id set not null;
alter table public.feedback_ticket_events alter column organization_id set not null;

-- 7. Trigger to automatically set organization_id on insert if null
create or replace function public.set_organization_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id is null then
    new.organization_id := public.get_my_organization_id();
  end if;
  return new;
end;
$$;

-- Create triggers for each table
create trigger calendar_events_set_org before insert on public.calendar_events
  for each row execute function public.set_organization_id();
create trigger calendar_rsvps_set_org before insert on public.calendar_rsvps
  for each row execute function public.set_organization_id();
create trigger roster_set_org before insert on public.roster
  for each row execute function public.set_organization_id();
create trigger attendance_set_org before insert on public.attendance
  for each row execute function public.set_organization_id();
create trigger attendance_groups_set_org before insert on public.attendance_groups
  for each row execute function public.set_organization_id();
create trigger feedback_set_org before insert on public.feedback
  for each row execute function public.set_organization_id();
create trigger leader_briefings_set_org before insert on public.leader_briefings
  for each row execute function public.set_organization_id();
create trigger prayers_set_org before insert on public.prayers
  for each row execute function public.set_organization_id();
create trigger prayer_amens_set_org before insert on public.prayer_amens
  for each row execute function public.set_organization_id();
create trigger journal_entries_set_org before insert on public.journal_entries
  for each row execute function public.set_organization_id();
create trigger announcements_set_org before insert on public.announcements
  for each row execute function public.set_organization_id();
create trigger study_series_set_org before insert on public.study_series
  for each row execute function public.set_organization_id();
create trigger announcement_drafts_set_org before insert on public.announcement_drafts
  for each row execute function public.set_organization_id();
create trigger feedback_tickets_set_org before insert on public.feedback_tickets
  for each row execute function public.set_organization_id();
create trigger feedback_ticket_votes_set_org before insert on public.feedback_ticket_votes
  for each row execute function public.set_organization_id();
create trigger feedback_ticket_comments_set_org before insert on public.feedback_ticket_comments
  for each row execute function public.set_organization_id();
create trigger feedback_ticket_events_set_org before insert on public.feedback_ticket_events
  for each row execute function public.set_organization_id();

-- 8. Update Row-Level Security (RLS) Policies to enforce organization isolation with Developer bypass

-- Profiles policies
drop policy if exists "Users view own profile" on public.profiles;
drop policy if exists "Admin view all profiles" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Admin update roles" on public.profiles;

create policy "profiles_select" on public.profiles
  for select to authenticated
  using (public.is_developer() or active_organization_id in (select organization_id from public.profile_organizations where profile_id = auth.uid()));

create policy "profiles_update" on public.profiles
  for update to authenticated
  using (auth.uid() = id or public.is_developer() or (active_organization_id in (select organization_id from public.profile_organizations where profile_id = auth.uid()) and public.is_admin()))
  with check (auth.uid() = id or public.is_developer() or (active_organization_id in (select organization_id from public.profile_organizations where profile_id = auth.uid()) and public.is_admin()));

-- Calendar Events policies
drop policy if exists "calendar_events_select" on public.calendar_events;
drop policy if exists "calendar_events_insert" on public.calendar_events;
drop policy if exists "calendar_events_update" on public.calendar_events;
drop policy if exists "calendar_events_delete" on public.calendar_events;

create policy "calendar_events_select" on public.calendar_events
  for select to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

create policy "calendar_events_insert" on public.calendar_events
  for insert to authenticated
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and public.can_create_events()));

create policy "calendar_events_update" on public.calendar_events
  for update to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and public.is_admin()))
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and public.is_admin()));

create policy "calendar_events_delete" on public.calendar_events
  for delete to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and public.is_admin()));

-- Calendar RSVPs policies
drop policy if exists "calendar_rsvps_select" on public.calendar_rsvps;
drop policy if exists "calendar_rsvps_all" on public.calendar_rsvps;

create policy "calendar_rsvps_select" on public.calendar_rsvps
  for select to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

create policy "calendar_rsvps_all" on public.calendar_rsvps
  for all to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and (auth.uid() = user_id or public.is_admin())))
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and (auth.uid() = user_id or public.is_admin())));

-- Roster policies
drop policy if exists "roster_all" on public.roster;

create policy "roster_all" on public.roster
  for all to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id())
  with check (public.is_developer() or organization_id = public.get_my_organization_id());

-- Attendance policies
drop policy if exists "attendance_all" on public.attendance;

create policy "attendance_all" on public.attendance
  for all to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id())
  with check (public.is_developer() or organization_id = public.get_my_organization_id());

-- Attendance Groups policies
drop policy if exists "attendance_groups_select" on public.attendance_groups;
drop policy if exists "attendance_groups_all" on public.attendance_groups;

create policy "attendance_groups_select" on public.attendance_groups
  for select to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

create policy "attendance_groups_all" on public.attendance_groups
  for all to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and public.is_admin()))
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and public.is_admin()));

-- Feedback policies
drop policy if exists "feedback_all" on public.feedback;

create policy "feedback_all" on public.feedback
  for all to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id())
  with check (public.is_developer() or organization_id = public.get_my_organization_id());

-- Leader Briefings policies
drop policy if exists "leader_briefings_select" on public.leader_briefings;
drop policy if exists "leader_briefings_all" on public.leader_briefings;

create policy "leader_briefings_select" on public.leader_briefings
  for select to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

create policy "leader_briefings_all" on public.leader_briefings
  for all to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and public.is_admin()))
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and public.is_admin()));

-- Prayers policies
drop policy if exists "prayers_select" on public.prayers;
drop policy if exists "prayers_insert" on public.prayers;
drop policy if exists "prayers_delete" on public.prayers;

create policy "prayers_select" on public.prayers
  for select to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

create policy "prayers_insert" on public.prayers
  for insert to authenticated
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and (auth.uid() = user_id or user_id is null)));

create policy "prayers_delete" on public.prayers
  for delete to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and (auth.uid() = user_id or public.is_admin())));

-- Prayer Amens policies
drop policy if exists "prayer_amens_select" on public.prayer_amens;
drop policy if exists "prayer_amens_all" on public.prayer_amens;

create policy "prayer_amens_select" on public.prayer_amens
  for select to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

create policy "prayer_amens_all" on public.prayer_amens
  for all to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and (auth.uid() = user_id)));

-- Journal Entries policies
drop policy if exists "journal_entries_all" on public.journal_entries;

create policy "journal_entries_all" on public.journal_entries
  for all to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and auth.uid() = user_id))
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and auth.uid() = user_id));

-- Announcements policies
drop policy if exists "announcements_select" on public.announcements;
drop policy if exists "announcements_all" on public.announcements;

create policy "announcements_select" on public.announcements
  for select to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

create policy "announcements_all" on public.announcements
  for all to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and public.is_admin()))
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and public.is_admin()));

-- Study Series policies
drop policy if exists "study_series_select" on public.study_series;
drop policy if exists "study_series_all" on public.study_series;

create policy "study_series_select" on public.study_series
  for select to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

create policy "study_series_all" on public.study_series
  for all to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and public.is_admin()))
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and public.is_admin()));

-- Announcement Drafts policies
drop policy if exists "announcement_drafts_all" on public.announcement_drafts;

create policy "announcement_drafts_all" on public.announcement_drafts
  for all to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and auth.uid() = user_id))
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and auth.uid() = user_id));

-- Feedback Tickets policies
drop policy if exists "feedback_tickets_select" on public.feedback_tickets;
drop policy if exists "feedback_tickets_insert" on public.feedback_tickets;
drop policy if exists "feedback_tickets_update" on public.feedback_tickets;
drop policy if exists "feedback_tickets_delete" on public.feedback_tickets;

create policy "feedback_tickets_select" on public.feedback_tickets
  for select to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

create policy "feedback_tickets_insert" on public.feedback_tickets
  for insert to authenticated
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and author_id = auth.uid()));

create policy "feedback_tickets_update" on public.feedback_tickets
  for update to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and author_id = auth.uid()))
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and author_id = auth.uid()));

create policy "feedback_tickets_delete" on public.feedback_tickets
  for delete to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

-- Feedback Ticket Votes policies
drop policy if exists "feedback_ticket_votes_select" on public.feedback_ticket_votes;
drop policy if exists "feedback_ticket_votes_insert" on public.feedback_ticket_votes;
drop policy if exists "feedback_ticket_votes_delete" on public.feedback_ticket_votes;

create policy "feedback_ticket_votes_select" on public.feedback_ticket_votes
  for select to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

create policy "feedback_ticket_votes_insert" on public.feedback_ticket_votes
  for insert to authenticated
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and user_id = auth.uid()));

create policy "feedback_ticket_votes_delete" on public.feedback_ticket_votes
  for delete to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and user_id = auth.uid()));

-- Feedback Ticket Comments policies
drop policy if exists "feedback_ticket_comments_select" on public.feedback_ticket_comments;
drop policy if exists "feedback_ticket_comments_insert" on public.feedback_ticket_comments;
drop policy if exists "feedback_ticket_comments_delete" on public.feedback_ticket_comments;

create policy "feedback_ticket_comments_select" on public.feedback_ticket_comments
  for select to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

create policy "feedback_ticket_comments_insert" on public.feedback_ticket_comments
  for insert to authenticated
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and author_id = auth.uid()));

create policy "feedback_ticket_comments_delete" on public.feedback_ticket_comments
  for delete to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and (author_id = auth.uid() or public.is_developer())));

-- Feedback Ticket Events policies
drop policy if exists "feedback_ticket_events_select" on public.feedback_ticket_events;

create policy "feedback_ticket_events_select" on public.feedback_ticket_events
  for select to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

-- Recreate views and functions that depend on feedback_tickets to include organization_id
drop function if exists public.search_similar_feedback(text, int);
drop view if exists public.feedback_board;

create view public.feedback_board
with (security_invoker = true) as
select
  t.id,
  t.title,
  t.description,
  t.category,
  t.category_detail,
  t.app_area,
  t.app_area_detail,
  t.status,
  t.priority,
  t.author_id,
  p.full_name as author_name,
  t.assignee_id,
  a.full_name as assignee_name,
  t.screenshot_paths,
  t.organization_id,
  t.created_at,
  t.updated_at,
  coalesce(v.cnt, 0)::int as votes,
  coalesce(c.cnt, 0)::int as comments,
  (coalesce(v.cnt, 0) * 5
    + case t.priority
        when 'critical' then 400
        when 'high' then 200
        when 'medium' then 80
        when 'low' then 20
        else 0
      end)::int as rank_score
from public.feedback_tickets t
left join public.profiles p on p.id = t.author_id
left join public.profiles a on a.id = t.assignee_id
left join lateral (
  select count(*) cnt from public.feedback_ticket_votes where ticket_id = t.id
) v on true
left join lateral (
  select count(*) cnt from public.feedback_ticket_comments where ticket_id = t.id
) c on true;

create or replace function public.search_similar_feedback(q text, max_results int default 5)
returns setof public.feedback_board
language sql
stable
as $$
  select b.*
  from public.feedback_board b
  join public.feedback_tickets t on t.id = b.id
  where (
    similarity(t.title, q) > 0.12
    or t.search_vector @@ websearch_to_tsquery('english', q)
  )
  and (public.is_developer() or b.organization_id = public.get_my_organization_id())
  order by greatest(
    similarity(t.title, q),
    ts_rank(t.search_vector, websearch_to_tsquery('english', q))
  ) desc
  limit max_results
$$;

-- 9. Storage bucket for organization logos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organization-logos', 'organization-logos', true, 5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy "org_logos_select" on storage.objects
  for select to authenticated, anon
  using (bucket_id = 'organization-logos');

create policy "org_logos_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'organization-logos'
    and (public.is_developer() or public.is_admin())
  );

create policy "org_logos_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'organization-logos'
    and (public.is_developer() or public.is_admin())
  );

create policy "org_logos_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'organization-logos'
    and (public.is_developer() or public.is_admin())
  );
