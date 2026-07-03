-- Discipleship v2, Phase 1: relationships + check-in rhythms.
--
-- The core object changes from one-off mail messages to a discipler↔disciple
-- relationship with a check-in cadence. The old discipleship_messages table
-- stays untouched as a read-only archive in the UI.

-- ── Relationships ────────────────────────────────────────────────────────────
create table public.discipleship_relationships (
  id                  uuid        primary key default gen_random_uuid(),
  organization_id     uuid        not null references public.organizations(id) on delete cascade,
  discipler_id        uuid        not null references public.profiles(id) on delete cascade,
  disciple_id         uuid        not null references public.profiles(id) on delete cascade,
  status              text        not null default 'invited' check (status in ('invited', 'active', 'ended')),
  cadence_days        int         not null default 7 check (cadence_days between 1 and 90),
  created_by          uuid        not null references public.profiles(id) on delete cascade,
  created_at          timestamptz not null default now(),
  accepted_at         timestamptz,
  ended_at            timestamptz,
  -- Per-side nudge stamps so the daily job never double-nags within a cadence.
  discipler_nudged_at timestamptz,
  disciple_nudged_at  timestamptz,
  check (discipler_id <> disciple_id)
);

-- One live pairing per direction; ended pairings don't block a fresh invite.
create unique index discipleship_relationships_live_pair_idx
  on public.discipleship_relationships (organization_id, discipler_id, disciple_id)
  where status <> 'ended';

create index discipleship_relationships_participants_idx
  on public.discipleship_relationships (discipler_id, disciple_id, status);

alter table public.discipleship_relationships enable row level security;

create policy "participants read own relationships"
  on public.discipleship_relationships for select
  to authenticated
  using (
    auth.uid() in (discipler_id, disciple_id)
    or public.is_developer()
  );

create policy "members invite within their org"
  on public.discipleship_relationships for insert
  to authenticated
  with check (
    auth.uid() = created_by
    and auth.uid() in (discipler_id, disciple_id)
    and organization_id in (
      select organization_id from public.profile_organizations
      where profile_id = auth.uid()
    )
  );

create policy "participants update own relationships"
  on public.discipleship_relationships for update
  to authenticated
  using (auth.uid() in (discipler_id, disciple_id))
  with check (auth.uid() in (discipler_id, disciple_id));

-- ── Check-ins ────────────────────────────────────────────────────────────────
create table public.discipleship_checkins (
  id              uuid        primary key default gen_random_uuid(),
  relationship_id uuid        not null references public.discipleship_relationships(id) on delete cascade,
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  author_id       uuid        not null references public.profiles(id) on delete cascade,
  learning        text,   -- "What's God been teaching you?"
  struggle        text,   -- "Where are you struggling?"
  prayer          text,   -- "How can I pray for you?"
  created_at      timestamptz not null default now()
);

create index discipleship_checkins_relationship_idx
  on public.discipleship_checkins (relationship_id, created_at desc);

alter table public.discipleship_checkins enable row level security;

create policy "participants read relationship checkins"
  on public.discipleship_checkins for select
  to authenticated
  using (
    exists (
      select 1 from public.discipleship_relationships r
      where r.id = relationship_id
        and (auth.uid() in (r.discipler_id, r.disciple_id) or public.is_developer())
    )
  );

create policy "participants write own checkins"
  on public.discipleship_checkins for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.discipleship_relationships r
      where r.id = relationship_id
        and r.status = 'active'
        and auth.uid() in (r.discipler_id, r.disciple_id)
    )
  );

create policy "authors update own checkins"
  on public.discipleship_checkins for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

create policy "authors delete own checkins"
  on public.discipleship_checkins for delete
  to authenticated
  using (auth.uid() = author_id);

-- ── Push: notify the other party on invite and on check-in ──────────────────
-- Mirrors the qa_answer push trigger (pg_net + push_hook_secret from Vault).

create or replace function public.notify_discipleship_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  other_id    uuid;
  author_name text;
  secret      text;
begin
  select case when NEW.author_id = r.discipler_id then r.disciple_id else r.discipler_id end
    into other_id
    from public.discipleship_relationships r
   where r.id = NEW.relationship_id;

  if other_id is null then
    return NEW;
  end if;

  select coalesce(full_name, email, 'Someone') into author_name
    from public.profiles where id = NEW.author_id;

  select decrypted_secret into secret
    from vault.decrypted_secrets
   where name = 'push_hook_secret'
   limit 1;

  perform net.http_post(
    url     := 'https://brtmsozmfboyuxrbwftb.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || coalesce(secret, '')
    ),
    body    := jsonb_build_object(
      'userIds', jsonb_build_array(other_id),
      'title',   author_name || ' checked in',
      'body',    coalesce(left(NEW.learning, 100), left(NEW.prayer, 100), 'New discipleship check-in'),
      'url',     '/discipleship'
    )
  );

  return NEW;
end;
$$;

drop trigger if exists discipleship_checkin_push on public.discipleship_checkins;
create trigger discipleship_checkin_push
  after insert on public.discipleship_checkins
  for each row execute function public.notify_discipleship_checkin();

create or replace function public.notify_discipleship_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invitee_id   uuid;
  inviter_name text;
  secret       text;
begin
  if NEW.status <> 'invited' then
    return NEW;
  end if;

  invitee_id := case when NEW.created_by = NEW.discipler_id then NEW.disciple_id else NEW.discipler_id end;

  select coalesce(full_name, email, 'Someone') into inviter_name
    from public.profiles where id = NEW.created_by;

  select decrypted_secret into secret
    from vault.decrypted_secrets
   where name = 'push_hook_secret'
   limit 1;

  perform net.http_post(
    url     := 'https://brtmsozmfboyuxrbwftb.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || coalesce(secret, '')
    ),
    body    := jsonb_build_object(
      'userIds', jsonb_build_array(invitee_id),
      'title',   'Discipleship invitation',
      'body',    inviter_name || ' invited you to walk together in discipleship',
      'url',     '/discipleship'
    )
  );

  return NEW;
end;
$$;

drop trigger if exists discipleship_invite_push on public.discipleship_relationships;
create trigger discipleship_invite_push
  after insert on public.discipleship_relationships
  for each row execute function public.notify_discipleship_invite();

-- ── Nudge cron: daily check-in reminders via the discipleship-nudge function ─
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'discipleship_nudge_token') then
    perform vault.create_secret(md5(random()::text), 'discipleship_nudge_token');
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'discipleship-nudge-daily') then
    perform cron.unschedule('discipleship-nudge-daily');
  end if;
end;
$$;

select cron.schedule(
  'discipleship-nudge-daily',
  '0 15 * * *', -- Daily at 15:00 UTC (morning in the US)
  $$
  select net.http_post(
    url := 'https://brtmsozmfboyuxrbwftb.supabase.co/functions/v1/discipleship-nudge',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'discipleship_nudge_token'),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
