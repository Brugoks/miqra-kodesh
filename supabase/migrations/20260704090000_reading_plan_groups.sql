-- Reading Plans Phase 6: read together. Groups are date-anchored (everyone's
-- "day N" is the same calendar date) and org-scoped like chat/fellowship.
-- Membership rows are strictly self-managed (a user joins themselves via an
-- invite link) — nothing here lets one user enroll another.

create table public.reading_plan_groups (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  plan_id         text        not null,
  name            text        not null,
  created_by      uuid        not null references public.profiles(id) on delete cascade,
  starts_on       date        not null default current_date,
  created_at      timestamptz not null default now()
);

create table public.reading_plan_group_members (
  group_id  uuid        not null references public.reading_plan_groups(id) on delete cascade,
  user_id   uuid        not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.reading_plan_enrollments
  add column if not exists group_id uuid references public.reading_plan_groups(id) on delete set null;

alter table public.reading_plan_groups enable row level security;
alter table public.reading_plan_group_members enable row level security;

create policy "org members read reading plan groups"
  on public.reading_plan_groups for select
  to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

create policy "org members create reading plan groups"
  on public.reading_plan_groups for insert
  to authenticated
  with check (created_by = auth.uid() and organization_id = public.get_my_organization_id());

create policy "creators delete their reading plan groups"
  on public.reading_plan_groups for delete
  to authenticated
  using (created_by = auth.uid());

create policy "group members read membership"
  on public.reading_plan_group_members for select
  to authenticated
  using (
    exists (
      select 1 from public.reading_plan_groups g
      where g.id = group_id and (public.is_developer() or g.organization_id = public.get_my_organization_id())
    )
  );

create policy "users join reading plan groups themselves"
  on public.reading_plan_group_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.reading_plan_groups g
      where g.id = group_id and g.organization_id = public.get_my_organization_id()
    )
  );

create policy "users leave reading plan groups themselves"
  on public.reading_plan_group_members for delete
  to authenticated
  using (user_id = auth.uid());

-- Group members can see each other's completion for TODAY only (never
-- historical days) — enough for "4 of 7 have read today," never a shaming
-- history view.
create policy "group members read today's shared progress"
  on public.reading_plan_progress for select
  to authenticated
  using (
    completed_at::date = current_date
    and exists (
      select 1 from public.reading_plan_enrollments e
      join public.reading_plan_group_members gm on gm.group_id = e.group_id
      where e.user_id = reading_plan_progress.user_id
        and e.plan_id = reading_plan_progress.plan_id
        and e.group_id is not null
        and gm.user_id = auth.uid()
    )
  );

-- Additive to the Phase 5 "users manage own reflections" policy: group
-- members may read each other's reflections once explicitly marked shared.
create policy "group members read shared reflections"
  on public.reading_plan_reflections for select
  to authenticated
  using (
    shared = true
    and exists (
      select 1 from public.reading_plan_enrollments e
      join public.reading_plan_group_members gm on gm.group_id = e.group_id
      where e.user_id = reading_plan_reflections.user_id
        and e.plan_id = reading_plan_reflections.plan_id
        and e.group_id is not null
        and gm.user_id = auth.uid()
    )
  );
