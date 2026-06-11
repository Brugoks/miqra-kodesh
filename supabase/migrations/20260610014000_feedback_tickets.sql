-- Feedback / ticket system: public idea-forum board with votes, comments,
-- activity log, screenshot storage, ranking view, and similarity search.
-- Also introduces the 'developer' superadmin role.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_developer()
returns boolean
language sql
stable
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'student'
  ) = 'developer'
$$;

-- Developer sits above admin: every admin check passes for developers too.
-- Keeps the legacy owner-email check so existing policies never lock out the owner.
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'student'
  ) in ('admin', 'developer')
  or coalesce(auth.jwt() ->> 'email', '') = 'markquiambao@gmail.com'
$$;

create or replace function public.is_leader()
returns boolean
language sql
stable
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'student'
  ) in ('developer', 'admin', 'leader', 'student_leader', 'parent_leader')
$$;

-- handle_new_user previously force-reset the owner to 'admin' on every
-- auth.users update; keep the owner pinned to 'developer' instead.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, provider, role, created_at, updated_at)
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
    updated_at = now();

  return new;
end;
$$;

update public.profiles
  set role = 'developer',
      updated_at = now()
  where email = 'markquiambao@gmail.com';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.feedback_tickets (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('bug', 'feature', 'other')),
  app_area text not null check (app_area in (
    'home', 'calendar', 'bible_study', 'fellowship', 'sermons',
    'discipleship', 'integrations', 'leader_portal', 'admin_portal', 'other'
  )),
  title text not null,
  description text not null default '',
  status text not null default 'open' check (status in (
    'open', 'under_review', 'planned', 'in_progress', 'done', 'declined'
  )),
  priority text check (priority in ('low', 'medium', 'high', 'critical')),
  assignee_id uuid references public.profiles(id) on delete set null,
  screenshot_paths text[] not null default '{}',
  search_vector tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feedback_ticket_votes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.feedback_tickets(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (ticket_id, user_id)
);

create table if not exists public.feedback_ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.feedback_tickets(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  -- raw react-mentions markup: "thanks @[Dev Name](uuid)"
  body text not null,
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.feedback_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.feedback_tickets(id) on delete cascade,
  -- null when the change comes through the service-role API ("Dev Team")
  actor_id uuid,
  event_type text not null check (event_type in (
    'created', 'status_changed', 'assigned', 'priority_changed'
  )),
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create index if not exists feedback_tickets_search_idx
  on public.feedback_tickets using gin (search_vector);
create index if not exists feedback_tickets_title_trgm_idx
  on public.feedback_tickets using gin (title gin_trgm_ops);
create index if not exists feedback_tickets_status_idx
  on public.feedback_tickets (status);
create index if not exists feedback_tickets_created_at_idx
  on public.feedback_tickets (created_at desc);
create index if not exists feedback_ticket_votes_ticket_idx
  on public.feedback_ticket_votes (ticket_id);
create index if not exists feedback_ticket_comments_ticket_idx
  on public.feedback_ticket_comments (ticket_id);
create index if not exists feedback_ticket_events_ticket_idx
  on public.feedback_ticket_events (ticket_id);

-- ---------------------------------------------------------------------------
-- Activity-log triggers (single source of truth for the timeline)
-- ---------------------------------------------------------------------------

create or replace function public.feedback_tickets_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.feedback_tickets_log_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.feedback_ticket_events (ticket_id, actor_id, event_type)
    values (new.id, new.author_id, 'created');
    return new;
  end if;

  if old.status is distinct from new.status then
    insert into public.feedback_ticket_events (ticket_id, actor_id, event_type, old_value, new_value)
    values (new.id, auth.uid(), 'status_changed', old.status, new.status);
  end if;

  if old.assignee_id is distinct from new.assignee_id then
    insert into public.feedback_ticket_events (ticket_id, actor_id, event_type, old_value, new_value)
    values (
      new.id, auth.uid(), 'assigned',
      (select full_name from public.profiles where id = old.assignee_id),
      (select full_name from public.profiles where id = new.assignee_id)
    );
  end if;

  if old.priority is distinct from new.priority then
    insert into public.feedback_ticket_events (ticket_id, actor_id, event_type, old_value, new_value)
    values (new.id, auth.uid(), 'priority_changed', old.priority, new.priority);
  end if;

  return new;
end;
$$;

drop trigger if exists feedback_tickets_touch_updated_at on public.feedback_tickets;
create trigger feedback_tickets_touch_updated_at
  before update on public.feedback_tickets
  for each row execute function public.feedback_tickets_touch_updated_at();

drop trigger if exists feedback_tickets_log_event on public.feedback_tickets;
create trigger feedback_tickets_log_event
  after insert or update on public.feedback_tickets
  for each row execute function public.feedback_tickets_log_event();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.feedback_tickets enable row level security;
alter table public.feedback_ticket_votes enable row level security;
alter table public.feedback_ticket_comments enable row level security;
alter table public.feedback_ticket_events enable row level security;

-- Tickets: public board for all authenticated users; only developers manage.
create policy "feedback_tickets_select" on public.feedback_tickets
  for select to authenticated using (true);

create policy "feedback_tickets_insert" on public.feedback_tickets
  for insert to authenticated with check (author_id = auth.uid());

create policy "feedback_tickets_update" on public.feedback_tickets
  for update to authenticated using (is_developer());

create policy "feedback_tickets_delete" on public.feedback_tickets
  for delete to authenticated using (is_developer());

-- Votes: one per user per ticket, toggleable.
create policy "feedback_ticket_votes_select" on public.feedback_ticket_votes
  for select to authenticated using (true);

create policy "feedback_ticket_votes_insert" on public.feedback_ticket_votes
  for insert to authenticated with check (user_id = auth.uid());

create policy "feedback_ticket_votes_delete" on public.feedback_ticket_votes
  for delete to authenticated using (user_id = auth.uid());

-- Comments: anyone can post as themselves; author or developer can delete.
create policy "feedback_ticket_comments_select" on public.feedback_ticket_comments
  for select to authenticated using (true);

create policy "feedback_ticket_comments_insert" on public.feedback_ticket_comments
  for insert to authenticated with check (author_id = auth.uid());

create policy "feedback_ticket_comments_delete" on public.feedback_ticket_comments
  for delete to authenticated using (author_id = auth.uid() or is_developer());

-- Events: read-only; rows are written by the security-definer trigger.
create policy "feedback_ticket_events_select" on public.feedback_ticket_events
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Storage bucket for screenshots
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback-screenshots', 'feedback-screenshots', false, 5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy "feedback_screenshots_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'feedback-screenshots');

create policy "feedback_screenshots_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'feedback-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "feedback_screenshots_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'feedback-screenshots'
    and ((storage.foldername(name))[1] = auth.uid()::text or is_developer())
  );

-- ---------------------------------------------------------------------------
-- Board view with vote/comment counts and rank score
-- ---------------------------------------------------------------------------

create or replace view public.feedback_board
with (security_invoker = true) as
select
  t.id,
  t.title,
  t.description,
  t.category,
  t.app_area,
  t.status,
  t.priority,
  t.author_id,
  p.full_name as author_name,
  t.assignee_id,
  a.full_name as assignee_name,
  t.screenshot_paths,
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

-- ---------------------------------------------------------------------------
-- Similarity search (duplicate suggestions + board search)
-- ---------------------------------------------------------------------------

create or replace function public.search_similar_feedback(q text, max_results int default 5)
returns setof public.feedback_board
language sql
stable
as $$
  select b.*
  from public.feedback_board b
  join public.feedback_tickets t on t.id = b.id
  where similarity(t.title, q) > 0.12
     or t.search_vector @@ websearch_to_tsquery('english', q)
  order by greatest(
    similarity(t.title, q),
    ts_rank(t.search_vector, websearch_to_tsquery('english', q))
  ) desc
  limit max_results
$$;
