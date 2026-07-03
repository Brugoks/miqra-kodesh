-- Discipleship growth suite: historical-church practices, progressively
-- disclosed in the UI as users gain experience.
--
--   • Peer ("soul friend") relationships alongside discipler↔disciple
--   • Pair covenant (rule of life) + first-meeting scheduling
--   • Prayer taps ("I prayed for you") on check-in prayer requests
--   • Daily watchword read receipts (Moravian Losungen)
--   • Availability hand-raise ("I'm open to being discipled / discipling")
--   • Leader matchmaking suggestions
--   • Testimony ("my story") built stage-by-stage along the pathway
--   • Milestones shareable as org-wide celebrations
--   • Email-invite reminders and expiry (worked by discipleship-nudge cron)

-- ── Relationships: peer kind, covenant, meeting + nudge stamps ──────────────
alter table public.discipleship_relationships
  add column if not exists kind            text        not null default 'discipleship'
    check (kind in ('discipleship', 'peer')),
  add column if not exists covenant        jsonb       not null default '[]'::jsonb,
  add column if not exists next_meeting_at timestamptz,
  add column if not exists meal_nudged_at  timestamptz,
  add column if not exists quiet_nudged_at timestamptz;

-- ── Email invites: peer role, expiry status, reminder stamp, app origin ─────
alter table public.discipleship_email_invites
  add column if not exists reminded_at timestamptz,
  add column if not exists app_origin  text;

alter table public.discipleship_email_invites
  drop constraint if exists discipleship_email_invites_inviter_role_check;
alter table public.discipleship_email_invites
  add constraint discipleship_email_invites_inviter_role_check
  check (inviter_role in ('discipler', 'disciple', 'peer'));

alter table public.discipleship_email_invites
  drop constraint if exists discipleship_email_invites_status_check;
alter table public.discipleship_email_invites
  add constraint discipleship_email_invites_status_check
  check (status in ('pending', 'claimed', 'cancelled', 'expired'));

-- Claim now carries the relationship kind through from the invite role.
create or replace function public.claim_discipleship_email_invites()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me_id         uuid := auth.uid();
  me_email      text;
  invite        record;
  claimed_count integer := 0;
begin
  if me_id is null then
    return 0;
  end if;

  select lower(email) into me_email from public.profiles where id = me_id;
  if me_email is null or me_email = '' then
    return 0;
  end if;

  for invite in
    select i.*
      from public.discipleship_email_invites i
     where i.status = 'pending'
       and lower(i.invitee_email) = me_email
       and i.inviter_id <> me_id
       and i.organization_id in (
         select organization_id from public.profile_organizations
         where profile_id = me_id
       )
  loop
    if not exists (
      select 1 from public.profile_organizations
      where profile_id = invite.inviter_id
        and organization_id = invite.organization_id
    ) then
      update public.discipleship_email_invites
         set status = 'cancelled'
       where id = invite.id;
      continue;
    end if;

    -- Peer invites have no hierarchy; the inviter occupies the discipler slot
    -- arbitrarily and kind='peer' makes the UI render both sides as equals.
    insert into public.discipleship_relationships
      (organization_id, discipler_id, disciple_id, created_by, status, kind)
    values (
      invite.organization_id,
      case when invite.inviter_role = 'disciple' then me_id else invite.inviter_id end,
      case when invite.inviter_role = 'disciple' then invite.inviter_id else me_id end,
      invite.inviter_id,
      'invited',
      case when invite.inviter_role = 'peer' then 'peer' else 'discipleship' end
    )
    on conflict (organization_id, discipler_id, disciple_id) where status <> 'ended'
    do nothing;

    update public.discipleship_email_invites
       set status = 'claimed', claimed_by = me_id, claimed_at = now()
     where id = invite.id;

    claimed_count := claimed_count + 1;
  end loop;

  return claimed_count;
end;
$$;

-- ── Prayer taps: "I prayed for you" on a check-in's prayer request ──────────
create table public.discipleship_prayer_taps (
  id              uuid        primary key default gen_random_uuid(),
  checkin_id      uuid        not null references public.discipleship_checkins(id) on delete cascade,
  relationship_id uuid        not null references public.discipleship_relationships(id) on delete cascade,
  author_id       uuid        not null references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (checkin_id, author_id)
);

create index discipleship_prayer_taps_relationship_idx
  on public.discipleship_prayer_taps (relationship_id, created_at desc);

alter table public.discipleship_prayer_taps enable row level security;

create policy "participants read prayer taps"
  on public.discipleship_prayer_taps for select
  to authenticated
  using (
    exists (
      select 1 from public.discipleship_relationships r
      where r.id = relationship_id
        and (auth.uid() in (r.discipler_id, r.disciple_id) or public.is_developer())
    )
  );

create policy "partners tap prayers"
  on public.discipleship_prayer_taps for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.discipleship_checkins c
      join public.discipleship_relationships r on r.id = c.relationship_id
      where c.id = checkin_id
        and c.relationship_id = relationship_id
        and c.author_id <> auth.uid()
        and auth.uid() in (r.discipler_id, r.disciple_id)
    )
  );

create or replace function public.notify_discipleship_prayer_tap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_id uuid;
  tapper_name  text;
  secret       text;
begin
  select author_id into requester_id
    from public.discipleship_checkins where id = NEW.checkin_id;
  if requester_id is null then
    return NEW;
  end if;

  select coalesce(full_name, email, 'Someone') into tapper_name
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
      'userIds', jsonb_build_array(requester_id),
      'title',   '🙏 Prayed for you',
      'body',    tapper_name || ' prayed for your request today',
      'url',     '/discipleship'
    )
  );

  return NEW;
end;
$$;

drop trigger if exists discipleship_prayer_tap_push on public.discipleship_prayer_taps;
create trigger discipleship_prayer_tap_push
  after insert on public.discipleship_prayer_taps
  for each row execute function public.notify_discipleship_prayer_tap();

-- ── Watchword reads: the pair's shared daily verse (Moravian Losungen) ──────
create table public.discipleship_watchword_reads (
  relationship_id uuid not null references public.discipleship_relationships(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  read_on         date not null default current_date,
  primary key (relationship_id, profile_id, read_on)
);

alter table public.discipleship_watchword_reads enable row level security;

create policy "participants read watchword reads"
  on public.discipleship_watchword_reads for select
  to authenticated
  using (
    exists (
      select 1 from public.discipleship_relationships r
      where r.id = relationship_id
        and auth.uid() in (r.discipler_id, r.disciple_id)
    )
  );

create policy "participants record own watchword reads"
  on public.discipleship_watchword_reads for insert
  to authenticated
  with check (
    auth.uid() = profile_id
    and exists (
      select 1 from public.discipleship_relationships r
      where r.id = relationship_id
        and auth.uid() in (r.discipler_id, r.disciple_id)
    )
  );

-- ── Availability: the "I'm open" hand-raise ─────────────────────────────────
create table public.discipleship_availability (
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  seeking         text not null check (seeking in ('discipler', 'disciple', 'peer')),
  note            text,
  created_at      timestamptz not null default now(),
  primary key (profile_id, organization_id)
);

alter table public.discipleship_availability enable row level security;

create policy "org members see open hands"
  on public.discipleship_availability for select
  to authenticated
  using (
    organization_id in (
      select organization_id from public.profile_organizations
      where profile_id = auth.uid()
    )
    or public.is_developer()
  );

create policy "members raise own hand"
  on public.discipleship_availability for insert
  to authenticated
  with check (
    auth.uid() = profile_id
    and organization_id in (
      select organization_id from public.profile_organizations
      where profile_id = auth.uid()
    )
  );

create policy "members update own hand"
  on public.discipleship_availability for update
  to authenticated
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

create policy "members lower own hand"
  on public.discipleship_availability for delete
  to authenticated
  using (auth.uid() = profile_id);

-- ── Leader matchmaking suggestions ──────────────────────────────────────────
-- A leader proposes a pairing; either person can turn it into a normal
-- invitation with one tap (the accept flow stays unchanged).
create table public.discipleship_suggestions (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  suggested_by    uuid        not null references public.profiles(id) on delete cascade,
  discipler_id    uuid        not null references public.profiles(id) on delete cascade,
  disciple_id     uuid        not null references public.profiles(id) on delete cascade,
  kind            text        not null default 'discipleship' check (kind in ('discipleship', 'peer')),
  status          text        not null default 'pending' check (status in ('pending', 'sent', 'dismissed')),
  created_at      timestamptz not null default now(),
  check (discipler_id <> disciple_id)
);

create index discipleship_suggestions_participant_idx
  on public.discipleship_suggestions (discipler_id, disciple_id, status);

alter table public.discipleship_suggestions enable row level security;

create policy "participants and leaders read suggestions"
  on public.discipleship_suggestions for select
  to authenticated
  using (
    auth.uid() in (discipler_id, disciple_id, suggested_by)
    or public.is_leader()
    or public.is_developer()
  );

create policy "leaders suggest pairings"
  on public.discipleship_suggestions for insert
  to authenticated
  with check (
    auth.uid() = suggested_by
    and (public.is_leader() or public.is_developer())
    and organization_id in (
      select organization_id from public.profile_organizations
      where profile_id = auth.uid()
    )
  );

create policy "participants respond to suggestions"
  on public.discipleship_suggestions for update
  to authenticated
  using (auth.uid() in (discipler_id, disciple_id))
  with check (auth.uid() in (discipler_id, disciple_id));

create or replace function public.notify_discipleship_suggestion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  leader_name text;
  secret      text;
begin
  select coalesce(full_name, email, 'A leader') into leader_name
    from public.profiles where id = NEW.suggested_by;

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
      'userIds', jsonb_build_array(NEW.discipler_id, NEW.disciple_id),
      'title',   'A pairing suggestion',
      'body',    leader_name || ' thinks you two would walk well together in discipleship',
      'url',     '/discipleship'
    )
  );

  return NEW;
end;
$$;

drop trigger if exists discipleship_suggestion_push on public.discipleship_suggestions;
create trigger discipleship_suggestion_push
  after insert on public.discipleship_suggestions
  for each row execute function public.notify_discipleship_suggestion();

-- ── Testimonies: "my story", written stage-by-stage along the pathway ───────
create table public.discipleship_testimonies (
  profile_id      uuid        not null references public.profiles(id) on delete cascade,
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  sections        jsonb       not null default '{}'::jsonb, -- { stageKey: paragraph }
  shared          boolean     not null default false,        -- visible to active partners
  updated_at      timestamptz not null default now(),
  primary key (profile_id, organization_id)
);

alter table public.discipleship_testimonies enable row level security;

create policy "owners manage own testimony"
  on public.discipleship_testimonies for all
  to authenticated
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

create policy "active partners read shared testimonies"
  on public.discipleship_testimonies for select
  to authenticated
  using (
    shared
    and exists (
      select 1 from public.discipleship_relationships r
      where r.status = 'active'
        and profile_id in (r.discipler_id, r.disciple_id)
        and auth.uid() in (r.discipler_id, r.disciple_id)
    )
  );

-- ── Milestones: shareable as org-wide celebrations ──────────────────────────
alter table public.discipleship_milestones
  add column if not exists shared boolean not null default false;

create policy "org members read shared milestones"
  on public.discipleship_milestones for select
  to authenticated
  using (
    shared
    and organization_id in (
      select organization_id from public.profile_organizations
      where profile_id = auth.uid()
    )
  );

create policy "creators update own milestones"
  on public.discipleship_milestones for update
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

-- ── Leader overview: include relationship kind ──────────────────────────────
create or replace function public.discipleship_org_overview(org_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  caller_role text;
begin
  select role into caller_role from public.profiles where id = auth.uid();

  if caller_role is null
     or caller_role not in ('developer', 'admin', 'leader', 'student_leader', 'parent_leader') then
    raise exception 'Leader role required' using errcode = '42501';
  end if;

  if caller_role <> 'developer' and not exists (
    select 1 from public.profile_organizations
    where profile_id = auth.uid() and organization_id = org_id
  ) then
    raise exception 'You can only view your own organization.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'relationships', coalesce((
      select jsonb_agg(row order by row->>'createdAt')
      from (
        select jsonb_build_object(
          'id', r.id,
          'kind', r.kind,
          'disciplerId', r.discipler_id,
          'disciplerName', coalesce(dp.full_name, dp.email, 'Unknown'),
          'discipleId', r.disciple_id,
          'discipleName', coalesce(sp.full_name, sp.email, 'Unknown'),
          'status', r.status,
          'cadenceDays', r.cadence_days,
          'createdAt', r.created_at,
          'lastCheckinAt', (
            select max(c.created_at) from public.discipleship_checkins c
            where c.relationship_id = r.id
          ),
          'checkinCount', (
            select count(*) from public.discipleship_checkins c
            where c.relationship_id = r.id
          ),
          'milestoneCount', (
            select count(*) from public.discipleship_milestones m
            where m.relationship_id = r.id
          ),
          'sessionsDone', (
            select count(*) from public.discipleship_session_progress s
            where s.relationship_id = r.id
          )
        ) as row
        from public.discipleship_relationships r
        left join public.profiles dp on dp.id = r.discipler_id
        left join public.profiles sp on sp.id = r.disciple_id
        where r.organization_id = org_id
          and r.status in ('active', 'invited')
      ) t
    ), '[]'::jsonb),
    'notConnected', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', coalesce(p.full_name, p.email, 'Unknown')
      ) order by coalesce(p.full_name, p.email))
      from public.profile_organizations po
      join public.profiles p on p.id = po.profile_id
      where po.organization_id = org_id
        and not exists (
          select 1 from public.discipleship_relationships r
          where r.organization_id = org_id
            and r.status = 'active'
            and po.profile_id in (r.discipler_id, r.disciple_id)
        )
    ), '[]'::jsonb)
  );
end;
$$;

-- ── Email type toggle for invite reminders ──────────────────────────────────
insert into public.app_email_settings (email_type, label, description, sort_order) values
  ('discipleship_invite_reminder', 'Discipleship invite reminder', 'One follow-up email when a discipleship email invitation has not been accepted after a few days.', 56)
on conflict (email_type) do nothing;
