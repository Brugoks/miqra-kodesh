-- Unified, durable in-app notifications.
--
-- Push and email remain delivery channels; this table is the source of truth
-- users can return to after a transient browser notification disappears.

create table if not exists public.user_notifications (
  id              uuid primary key default gen_random_uuid(),
  recipient_id    uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  category        text not null check (category in (
    'chat', 'fellowship', 'calendar', 'qa', 'reading',
    'discipleship', 'announcements', 'system'
  )),
  event_type      text not null,
  title           text not null,
  body            text,
  url             text not null default '/',
  actor_id        uuid references public.profiles(id) on delete set null,
  entity_type     text,
  entity_id       text,
  priority        text not null default 'normal'
    check (priority in ('low', 'normal', 'high')),
  dedupe_key      text,
  read_at         timestamptz,
  archived_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists user_notifications_recipient_created_idx
  on public.user_notifications (recipient_id, created_at desc)
  where archived_at is null;

create index if not exists user_notifications_recipient_unread_idx
  on public.user_notifications (recipient_id, organization_id, created_at desc)
  where read_at is null and archived_at is null;

create unique index if not exists user_notifications_recipient_dedupe_idx
  on public.user_notifications (recipient_id, dedupe_key)
  where dedupe_key is not null;

alter table public.user_notifications enable row level security;

drop policy if exists "notifications_select_own" on public.user_notifications;
create policy "notifications_select_own" on public.user_notifications
  for select to authenticated
  using (recipient_id = auth.uid());

drop policy if exists "notifications_update_own" on public.user_notifications;
create policy "notifications_update_own" on public.user_notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

drop policy if exists "notifications_delete_own" on public.user_notifications;
create policy "notifications_delete_own" on public.user_notifications
  for delete to authenticated
  using (recipient_id = auth.uid());

-- Preferences are global per user/category. Missing rows intentionally mean
-- enabled, preserving current behavior during rollout.
create table if not exists public.notification_preferences (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  category        text not null check (category in (
    'chat', 'fellowship', 'calendar', 'qa', 'reading',
    'discipleship', 'announcements', 'system'
  )),
  in_app_enabled  boolean not null default true,
  push_enabled    boolean not null default true,
  email_enabled   boolean not null default false,
  digest_mode     text not null default 'instant'
    check (digest_mode in ('instant', 'daily', 'weekly', 'off')),
  last_digest_at  timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (user_id, category)
);

alter table public.notification_preferences enable row level security;

drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
create policy "notification_preferences_select_own" on public.notification_preferences
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
create policy "notification_preferences_insert_own" on public.notification_preferences
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "notification_preferences_update_own" on public.notification_preferences;
create policy "notification_preferences_update_own" on public.notification_preferences
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "notification_preferences_delete_own" on public.notification_preferences;
create policy "notification_preferences_delete_own" on public.notification_preferences
  for delete to authenticated
  using (user_id = auth.uid());

create table if not exists public.notification_settings (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  quiet_hours_start time,
  quiet_hours_end   time,
  timezone          text,
  updated_at        timestamptz not null default now()
);

alter table public.notification_settings enable row level security;

drop policy if exists "notification_settings_select_own" on public.notification_settings;
create policy "notification_settings_select_own" on public.notification_settings
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "notification_settings_insert_own" on public.notification_settings;
create policy "notification_settings_insert_own" on public.notification_settings
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "notification_settings_update_own" on public.notification_settings;
create policy "notification_settings_update_own" on public.notification_settings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Internal helper used by trusted trigger functions. It is deliberately not
-- executable by client roles, preventing users from creating notifications for
-- one another directly.
create or replace function public.create_user_notification(
  p_recipient_id uuid,
  p_organization_id uuid,
  p_category text,
  p_event_type text,
  p_title text,
  p_body text default null,
  p_url text default '/',
  p_actor_id uuid default null,
  p_entity_type text default null,
  p_entity_id text default null,
  p_priority text default 'normal',
  p_dedupe_key text default null,
  p_created_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  notification_id uuid;
begin
  if p_recipient_id is null then
    return null;
  end if;

  insert into public.user_notifications (
    recipient_id, organization_id, category, event_type, title, body, url,
    actor_id, entity_type, entity_id, priority, dedupe_key, created_at
  ) values (
    p_recipient_id, p_organization_id, p_category, p_event_type, p_title,
    nullif(p_body, ''), coalesce(nullif(p_url, ''), '/'), p_actor_id,
    p_entity_type, p_entity_id, p_priority, p_dedupe_key, p_created_at
  )
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null
  do update set
    title = excluded.title,
    body = excluded.body,
    url = excluded.url,
    priority = excluded.priority
  returning id into notification_id;

  return notification_id;
end;
$$;

revoke all on function public.create_user_notification(
  uuid, uuid, text, text, text, text, text, uuid, text, text, text, text, timestamptz
) from public, anon, authenticated;

-- Chat mentions ----------------------------------------------------------------
create or replace function public.create_chat_mention_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  message_preview text;
begin
  select left(coalesce(body, 'Shared a message'), 160)
    into message_preview
    from public.chat_messages
   where id = new.message_id;

  perform public.create_user_notification(
    new.mentioned_user_id,
    new.organization_id,
    'chat',
    'mention',
    coalesce(new.actor_name, 'Someone') || ' mentioned you',
    message_preview,
    '/chat?channel=' || new.channel_id::text || '&message=' || new.message_id::text,
    new.actor_id,
    'chat_message',
    new.message_id::text,
    'high',
    'chat-mention:' || new.id::text,
    new.created_at
  );
  return new;
end;
$$;

drop trigger if exists unified_chat_mention_notification on public.chat_mentions;
create trigger unified_chat_mention_notification
  after insert on public.chat_mentions
  for each row execute function public.create_chat_mention_notification();

-- Q&R answers and accepted answers ------------------------------------------------
create or replace function public.create_qa_answer_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  question_title text;
  recipient record;
  sender_name text;
begin
  select left(title, 120) into question_title
    from public.qa_questions where id = new.question_id;

  sender_name := case
    when new.is_anonymous then 'Someone'
    else coalesce(new.author_name, 'Someone')
  end;

  for recipient in
    select f.user_id
     from public.qa_question_followers f
     where f.question_id = new.question_id
       and f.user_id is distinct from new.author_id
  loop
    perform public.create_user_notification(
      recipient.user_id,
      new.organization_id,
      'qa',
      'answer',
      sender_name || ' answered a question you follow',
      question_title,
      '/qa?question=' || new.question_id::text,
      case when new.is_anonymous then null else new.author_id end,
      'qa_question',
      new.question_id::text,
      'normal',
      'qa-answer:' || new.id::text || ':' || recipient.user_id::text,
      new.created_at
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists unified_qa_answer_notification on public.qa_answers;
create trigger unified_qa_answer_notification
  after insert on public.qa_answers
  for each row execute function public.create_qa_answer_notifications();

create or replace function public.create_qa_accepted_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  question_title text;
begin
  if not new.is_accepted or coalesce(old.is_accepted, false) then
    return new;
  end if;

  select left(title, 120) into question_title
    from public.qa_questions where id = new.question_id;

  perform public.create_user_notification(
    new.author_id,
    new.organization_id,
    'qa',
    'answer_accepted',
    'Your answer was accepted',
    question_title,
    '/qa?question=' || new.question_id::text,
    null,
    'qa_answer',
    new.id::text,
    'high',
    'qa-accepted:' || new.id::text,
    now()
  );
  return new;
end;
$$;

drop trigger if exists unified_qa_accepted_notification on public.qa_answers;
create trigger unified_qa_accepted_notification
  after update of is_accepted on public.qa_answers
  for each row execute function public.create_qa_accepted_notification();

-- Fellowship: journal replies, prayer updates, and polls --------------------------
create or replace function public.create_journal_reply_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  entry_author_id uuid;
  entry_title text;
  sender_name text;
begin
  select user_id, left(title, 120)
    into entry_author_id, entry_title
    from public.journal_entries where id = new.journal_id;

  if entry_author_id is null or entry_author_id = new.user_id then
    return new;
  end if;

  select coalesce(full_name, email, 'Someone') into sender_name
    from public.profiles where id = new.user_id;

  perform public.create_user_notification(
    entry_author_id,
    new.organization_id,
    'fellowship',
    'journal_reply',
    coalesce(sender_name, 'Someone') || ' replied to your reflection',
    coalesce(entry_title, left(new.body, 160)),
    '/fellowship?section=journal&entry=' || new.journal_id,
    new.user_id,
    'journal_entry',
    new.journal_id,
    'normal',
    'journal-comment:' || new.id::text,
    new.created_at
  );
  return new;
end;
$$;

drop trigger if exists unified_journal_reply_notification on public.journal_comments;
create trigger unified_journal_reply_notification
  after insert on public.journal_comments
  for each row execute function public.create_journal_reply_notification();

create or replace function public.create_prayer_update_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prayer_author_id uuid;
  updater_name text;
begin
  select user_id into prayer_author_id
    from public.prayers where id = new.prayer_id;

  if prayer_author_id is null or prayer_author_id = new.user_id then
    return new;
  end if;

  select coalesce(full_name, email, 'Someone') into updater_name
    from public.profiles where id = new.user_id;

  perform public.create_user_notification(
    prayer_author_id,
    new.organization_id,
    'fellowship',
    'prayer_update',
    coalesce(updater_name, 'Someone') || ' added a prayer update',
    left(new.body, 160),
    '/fellowship?section=prayers&prayer=' || new.prayer_id,
    new.user_id,
    'prayer',
    new.prayer_id,
    'normal',
    'prayer-update:' || new.id::text,
    new.created_at
  );
  return new;
end;
$$;

drop trigger if exists unified_prayer_update_notification on public.prayer_updates;
create trigger unified_prayer_update_notification
  after insert on public.prayer_updates
  for each row execute function public.create_prayer_update_notification();

create or replace function public.create_poll_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  member record;
begin
  for member in
    select distinct (student->>'linkedUserId')::uuid as user_id
      from public.attendance_groups g,
           lateral jsonb_array_elements(coalesce(g.students, '[]'::jsonb)) student
     where g.id = new.group_key
       and g.organization_id = new.organization_id
       and coalesce(student->>'linkedUserId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  loop
    perform public.create_user_notification(
      member.user_id,
      new.organization_id,
      'fellowship',
      'poll',
      'Your group has a new poll',
      left(new.question, 160),
      '/fellowship?section=polls&poll=' || new.id,
      null,
      'poll',
      new.id,
      'high',
      'poll:' || new.id || ':' || member.user_id::text,
      new.created_at
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists unified_poll_notification on public.polls;
create trigger unified_poll_notification
  after insert on public.polls
  for each row execute function public.create_poll_notifications();

-- Discipleship invitations and check-ins -----------------------------------------
create or replace function public.create_discipleship_invite_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invitee_id uuid;
  inviter_name text;
begin
  if new.status <> 'invited' then return new; end if;
  invitee_id := case when new.created_by = new.discipler_id then new.disciple_id else new.discipler_id end;
  select coalesce(full_name, email, 'Someone') into inviter_name
    from public.profiles where id = new.created_by;

  perform public.create_user_notification(
    invitee_id,
    new.organization_id,
    'discipleship',
    'invite',
    'Discipleship invitation',
    coalesce(inviter_name, 'Someone') || ' invited you to walk together',
    '/discipleship',
    new.created_by,
    'discipleship_relationship',
    new.id::text,
    'high',
    'discipleship-invite:' || new.id::text,
    new.created_at
  );
  return new;
end;
$$;

drop trigger if exists unified_discipleship_invite_notification on public.discipleship_relationships;
create trigger unified_discipleship_invite_notification
  after insert on public.discipleship_relationships
  for each row execute function public.create_discipleship_invite_notification();

create or replace function public.create_discipleship_checkin_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  other_id uuid;
  author_name text;
begin
  select case when new.author_id = r.discipler_id then r.disciple_id else r.discipler_id end
    into other_id from public.discipleship_relationships r where r.id = new.relationship_id;
  select coalesce(full_name, email, 'Someone') into author_name
    from public.profiles where id = new.author_id;

  perform public.create_user_notification(
    other_id,
    new.organization_id,
    'discipleship',
    'checkin',
    coalesce(author_name, 'Someone') || ' checked in',
    coalesce(left(new.learning, 160), left(new.prayer, 160), 'New discipleship check-in'),
    '/discipleship',
    new.author_id,
    'discipleship_checkin',
    new.id::text,
    'normal',
    'discipleship-checkin:' || new.id::text,
    new.created_at
  );
  return new;
end;
$$;

drop trigger if exists unified_discipleship_checkin_notification on public.discipleship_checkins;
create trigger unified_discipleship_checkin_notification
  after insert on public.discipleship_checkins
  for each row execute function public.create_discipleship_checkin_notification();

-- Announcements go to every member of the active organization except the author.
create or replace function public.create_announcement_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  member record;
begin
  for member in
    select po.profile_id
      from public.profile_organizations po
     where po.organization_id = new.organization_id
       and po.profile_id <> coalesce(new.created_by, '00000000-0000-0000-0000-000000000000'::uuid)
  loop
    perform public.create_user_notification(
      member.profile_id,
      new.organization_id,
      'announcements',
      'announcement',
      new.title,
      left(new.body, 180),
      '/?announcement=' || new.id,
      new.created_by,
      'announcement',
      new.id,
      'normal',
      'announcement:' || new.id || ':' || member.profile_id::text,
      new.created_at
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists unified_announcement_notification on public.announcements;
create trigger unified_announcement_notification
  after insert on public.announcements
  for each row execute function public.create_announcement_notifications();

-- New calendar events invite members back to RSVP. High priority is reserved
-- for events posted less than two weeks before they happen.
create or replace function public.create_calendar_event_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  member record;
begin
  for member in
    select po.profile_id
      from public.profile_organizations po
     where po.organization_id = new.organization_id
       and po.profile_id <> coalesce(new.created_by, '00000000-0000-0000-0000-000000000000'::uuid)
  loop
    perform public.create_user_notification(
      member.profile_id,
      new.organization_id,
      'calendar',
      'event_created',
      'New event: ' || new.title,
      concat_ws(' · ', new.date::text, nullif(new.location, '')),
      '/calendar?event=' || new.id::text,
      new.created_by,
      'calendar_event',
      new.id::text,
      case when new.date <= current_date + 14 then 'high' else 'normal' end,
      'calendar-event:' || new.id::text || ':' || member.profile_id::text,
      new.created_at
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists unified_calendar_event_notification on public.calendar_events;
create trigger unified_calendar_event_notification
  after insert on public.calendar_events
  for each row execute function public.create_calendar_event_notifications();

-- Seed recent, relevant history so the new inbox is useful immediately rather
-- than appearing empty until the next event. Each producer's dedupe key makes
-- this idempotent.
insert into public.user_notifications (
  recipient_id, organization_id, category, event_type, title, body, url,
  actor_id, entity_type, entity_id, priority, dedupe_key, created_at
)
select
  m.mentioned_user_id, m.organization_id, 'chat', 'mention',
  coalesce(m.actor_name, 'Someone') || ' mentioned you',
  left(coalesce(msg.body, 'Shared a message'), 160),
  '/chat?channel=' || m.channel_id::text || '&message=' || m.message_id::text,
  m.actor_id, 'chat_message', m.message_id::text, 'high',
  'chat-mention:' || m.id::text, m.created_at
from public.chat_mentions m
join public.chat_messages msg on msg.id = m.message_id
where m.created_at >= now() - interval '30 days'
on conflict do nothing;

insert into public.user_notifications (
  recipient_id, organization_id, category, event_type, title, body, url,
  actor_id, entity_type, entity_id, priority, dedupe_key, created_at
)
select
  f.user_id, a.organization_id, 'qa', 'answer',
  (case when a.is_anonymous then 'Someone' else coalesce(a.author_name, 'Someone') end)
    || ' answered a question you follow',
  left(q.title, 120), '/qa?question=' || q.id::text,
  case when a.is_anonymous then null else a.author_id end,
  'qa_question', q.id::text, 'normal',
  'qa-answer:' || a.id::text || ':' || f.user_id::text, a.created_at
from public.qa_answers a
join public.qa_questions q on q.id = a.question_id
join public.qa_question_followers f on f.question_id = a.question_id
where a.created_at >= now() - interval '30 days'
  and f.user_id is distinct from a.author_id
on conflict do nothing;

insert into public.user_notifications (
  recipient_id, organization_id, category, event_type, title, body, url,
  actor_id, entity_type, entity_id, priority, dedupe_key, created_at
)
select
  je.user_id, c.organization_id, 'fellowship', 'journal_reply',
  coalesce(p.full_name, p.email, 'Someone') || ' replied to your reflection',
  left(coalesce(je.title, c.body), 120),
  '/fellowship?section=journal&entry=' || c.journal_id,
  c.user_id, 'journal_entry', c.journal_id, 'normal',
  'journal-comment:' || c.id::text, c.created_at
from public.journal_comments c
join public.journal_entries je on je.id = c.journal_id
left join public.profiles p on p.id = c.user_id
where c.created_at >= now() - interval '30 days'
  and je.user_id <> c.user_id
on conflict do nothing;

insert into public.user_notifications (
  recipient_id, organization_id, category, event_type, title, body, url,
  actor_id, entity_type, entity_id, priority, dedupe_key, created_at
)
select
  po.profile_id, a.organization_id, 'announcements', 'announcement',
  a.title, left(a.body, 180), '/?announcement=' || a.id,
  a.created_by, 'announcement', a.id, 'normal',
  'announcement:' || a.id || ':' || po.profile_id::text, a.created_at
from public.announcements a
join public.profile_organizations po on po.organization_id = a.organization_id
where a.created_at >= now() - interval '30 days'
  and po.profile_id <> coalesce(a.created_by, '00000000-0000-0000-0000-000000000000'::uuid)
on conflict do nothing;

do $$ begin
  alter publication supabase_realtime add table public.user_notifications;
exception when duplicate_object then null; end $$;

-- Hourly digest dispatcher. Each preference row stores its last successful
-- digest, so local-time matching cannot double-send during retries.
create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'notification_digest_token') then
    perform vault.create_secret(md5(random()::text), 'notification_digest_token');
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'notification-digest-hourly') then
    perform cron.unschedule('notification-digest-hourly');
  end if;
end;
$$;

select cron.schedule(
  'notification-digest-hourly',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://brtmsozmfboyuxrbwftb.supabase.co/functions/v1/notification-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'notification_digest_token'),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

notify pgrst, 'reload schema';
