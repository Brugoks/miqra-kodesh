-- Discipleship Phase 3: conversation guides + leader multiplication overview.
--
-- Guides are reference content generated once per pathway session by the
-- discipleship-guide edge function (Gemini) and cached here for everyone.
-- Session progress is tracked per relationship. Leaders get an org-level
-- overview RPC that exposes pairing structure and activity recency — never
-- check-in content.

-- ── Guide cache (service-role writes, everyone reads) ───────────────────────
create table public.discipleship_guides (
  session_id     text        primary key,
  prompt_version text        not null,
  content        jsonb       not null, -- { opener, questions[3], practice }
  created_at     timestamptz not null default now()
);

alter table public.discipleship_guides enable row level security;

create policy "authenticated read guides"
  on public.discipleship_guides for select
  to authenticated
  using (true);
-- No insert/update policies: only the edge function (service role) writes.

-- ── Per-relationship pathway progress ────────────────────────────────────────
create table public.discipleship_session_progress (
  id              uuid        primary key default gen_random_uuid(),
  relationship_id uuid        not null references public.discipleship_relationships(id) on delete cascade,
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  session_id      text        not null,
  completed_by    uuid        not null references public.profiles(id) on delete cascade,
  completed_at    timestamptz not null default now()
);

create unique index discipleship_session_progress_unique_idx
  on public.discipleship_session_progress (relationship_id, session_id);

alter table public.discipleship_session_progress enable row level security;

create policy "participants read session progress"
  on public.discipleship_session_progress for select
  to authenticated
  using (
    exists (
      select 1 from public.discipleship_relationships r
      where r.id = relationship_id
        and (auth.uid() in (r.discipler_id, r.disciple_id) or public.is_developer())
    )
  );

create policy "participants record session progress"
  on public.discipleship_session_progress for insert
  to authenticated
  with check (
    auth.uid() = completed_by
    and exists (
      select 1 from public.discipleship_relationships r
      where r.id = relationship_id
        and r.status = 'active'
        and auth.uid() in (r.discipler_id, r.disciple_id)
    )
  );

create policy "participants undo session progress"
  on public.discipleship_session_progress for delete
  to authenticated
  using (
    exists (
      select 1 from public.discipleship_relationships r
      where r.id = relationship_id
        and auth.uid() in (r.discipler_id, r.disciple_id)
    )
  );

-- ── Leader overview: pairing structure + recency, never content ─────────────
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

grant execute on function public.discipleship_org_overview(uuid) to authenticated;
