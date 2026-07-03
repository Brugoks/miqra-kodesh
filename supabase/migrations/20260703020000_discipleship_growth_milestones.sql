-- Discipleship Phase 2: shared growth visibility + milestones.
--
-- Within an active relationship each side can share their growth practices
-- (reading plan progress, memory verse deck) with the other. Sharing is per
-- side and defaults on — accepting the relationship is the opt-in — with a
-- visible toggle in the UI. Milestones record moments worth celebrating,
-- culminating in 'started_discipling' (multiplication).

-- ── Per-side growth sharing toggles ─────────────────────────────────────────
alter table public.discipleship_relationships
  add column if not exists discipler_shares_growth boolean not null default true,
  add column if not exists disciple_shares_growth  boolean not null default true;

-- ── Partner read access to growth practices ────────────────────────────────
-- Additive SELECT policies: the partner in an active relationship may read
-- the other side's rows while that side's sharing toggle is on.

create policy "discipleship partner reads shared plan enrollments"
  on public.reading_plan_enrollments for select
  to authenticated
  using (
    exists (
      select 1 from public.discipleship_relationships r
      where r.status = 'active'
        and (
          (r.discipler_id = auth.uid() and r.disciple_id = user_id and r.disciple_shares_growth)
          or (r.disciple_id = auth.uid() and r.discipler_id = user_id and r.discipler_shares_growth)
        )
    )
  );

create policy "discipleship partner reads shared plan progress"
  on public.reading_plan_progress for select
  to authenticated
  using (
    exists (
      select 1 from public.discipleship_relationships r
      where r.status = 'active'
        and (
          (r.discipler_id = auth.uid() and r.disciple_id = user_id and r.disciple_shares_growth)
          or (r.disciple_id = auth.uid() and r.discipler_id = user_id and r.discipler_shares_growth)
        )
    )
  );

create policy "discipleship partner reads shared memory verses"
  on public.memory_verses for select
  to authenticated
  using (
    exists (
      select 1 from public.discipleship_relationships r
      where r.status = 'active'
        and (
          (r.discipler_id = auth.uid() and r.disciple_id = user_id and r.disciple_shares_growth)
          or (r.disciple_id = auth.uid() and r.discipler_id = user_id and r.discipler_shares_growth)
        )
    )
  );

-- ── Milestones ───────────────────────────────────────────────────────────────
create table public.discipleship_milestones (
  id              uuid        primary key default gen_random_uuid(),
  relationship_id uuid        not null references public.discipleship_relationships(id) on delete cascade,
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  person_id       uuid        not null references public.profiles(id) on delete cascade, -- who reached it
  created_by      uuid        not null references public.profiles(id) on delete cascade,
  kind            text        not null check (kind in (
    'baptism', 'first_prayer_aloud', 'shared_testimony', 'led_study', 'started_discipling', 'custom'
  )),
  label           text,       -- required for kind = 'custom'
  note            text,
  achieved_on     date        not null default current_date,
  created_at      timestamptz not null default now()
);

create index discipleship_milestones_relationship_idx
  on public.discipleship_milestones (relationship_id, achieved_on desc);

alter table public.discipleship_milestones enable row level security;

create policy "participants read relationship milestones"
  on public.discipleship_milestones for select
  to authenticated
  using (
    exists (
      select 1 from public.discipleship_relationships r
      where r.id = relationship_id
        and (auth.uid() in (r.discipler_id, r.disciple_id) or public.is_developer())
    )
  );

create policy "participants record milestones"
  on public.discipleship_milestones for insert
  to authenticated
  with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.discipleship_relationships r
      where r.id = relationship_id
        and r.status = 'active'
        and auth.uid() in (r.discipler_id, r.disciple_id)
        and person_id in (r.discipler_id, r.disciple_id)
    )
  );

create policy "creators delete own milestones"
  on public.discipleship_milestones for delete
  to authenticated
  using (auth.uid() = created_by);

-- ── Push: celebrate with the other participant ──────────────────────────────
create or replace function public.notify_discipleship_milestone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  other_id     uuid;
  person_name  text;
  milestone    text;
  secret       text;
begin
  select case when NEW.created_by = r.discipler_id then r.disciple_id else r.discipler_id end
    into other_id
    from public.discipleship_relationships r
   where r.id = NEW.relationship_id;

  if other_id is null then
    return NEW;
  end if;

  select coalesce(full_name, email, 'Someone') into person_name
    from public.profiles where id = NEW.person_id;

  milestone := case NEW.kind
    when 'baptism' then 'was baptized'
    when 'first_prayer_aloud' then 'prayed aloud in group for the first time'
    when 'shared_testimony' then 'shared their testimony'
    when 'led_study' then 'led a study'
    when 'started_discipling' then 'started discipling someone'
    else coalesce(NEW.label, 'reached a milestone')
  end;

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
      'title',   '🎉 Milestone',
      'body',    person_name || ' ' || milestone,
      'url',     '/discipleship'
    )
  );

  return NEW;
end;
$$;

drop trigger if exists discipleship_milestone_push on public.discipleship_milestones;
create trigger discipleship_milestone_push
  after insert on public.discipleship_milestones
  for each row execute function public.notify_discipleship_milestone();
