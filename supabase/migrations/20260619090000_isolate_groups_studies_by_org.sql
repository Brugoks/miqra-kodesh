-- Enforce strict per-organization isolation for Small Groups and Bible Studies.
--
-- Postgres OR's together all *permissive* policies for a command, so a single
-- broad policy defeats every scoped one. These tables had accumulated such
-- broad policies (added so a multi-org user could see everything client-side),
-- which let groups and studies leak across organizations even though each row
-- already carries an organization_id. We drop the broad policies and keep only
-- active-organization-scoped ones, so a user in multiple orgs only ever sees the
-- groups/studies of their currently active organization (plus the developer
-- bypass). Membership/role checks still apply on top.

-- ── Small Groups: attendance_groups ─────────────────────────────────────────
-- Drop the "everyone can read" policies (both evaluated to USING (true)).
drop policy if exists "Authenticated users read attendance groups" on public.attendance_groups;
drop policy if exists "attendance_groups_select" on public.attendance_groups;
-- Drop the unscoped leader-manage policy (a leftover that let any leader manage
-- groups in ANY org); the scoped attendance_groups_all below replaces it.
drop policy if exists "Leaders manage attendance groups" on public.attendance_groups;

create policy "attendance_groups_select" on public.attendance_groups
  for select to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

drop policy if exists "attendance_groups_all" on public.attendance_groups;
create policy "attendance_groups_all" on public.attendance_groups
  for all to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and public.is_leader()))
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and public.is_leader()));

-- ── Small Group meeting details: group_meetings ─────────────────────────────
-- group_meetings has no organization_id; it inherits its group's org. Scope
-- reads/writes to meetings whose group belongs to the active organization.
drop policy if exists "Authenticated users read group meetings" on public.group_meetings;
create policy "group_meetings_select" on public.group_meetings
  for select to authenticated
  using (
    public.is_developer()
    or group_id in (
      select id from public.attendance_groups
      where organization_id = public.get_my_organization_id()
    )
  );

drop policy if exists "Leaders manage group meetings" on public.group_meetings;
create policy "group_meetings_manage" on public.group_meetings
  for all to authenticated
  using (
    public.is_developer()
    or (public.is_leader() and group_id in (
      select id from public.attendance_groups
      where organization_id = public.get_my_organization_id()
    ))
  )
  with check (
    public.is_developer()
    or (public.is_leader() and group_id in (
      select id from public.attendance_groups
      where organization_id = public.get_my_organization_id()
    ))
  );

-- ── Bible Studies: study_series ─────────────────────────────────────────────
-- Drop the broad read policy that exposed any org-wide or group-linked series,
-- and the unscoped admin-manage policy (study_series_all already covers admins,
-- scoped to org). Every study_series row has an organization_id (set on insert
-- by the study_series_set_org trigger), so org scoping covers org-wide AND
-- group-linked series.
drop policy if exists "Users read relevant study series" on public.study_series;
drop policy if exists "Admins manage study series" on public.study_series;

drop policy if exists "study_series_select" on public.study_series;
create policy "study_series_select" on public.study_series
  for select to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

drop policy if exists "study_series_all" on public.study_series;
create policy "study_series_all" on public.study_series
  for all to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and public.is_admin()))
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and public.is_admin()));

-- Keep "manage your own series", but scope it to the active org so a personal
-- series created in one org is not readable/editable while another org is active.
drop policy if exists "Users manage own study series" on public.study_series;
create policy "Users manage own study series" on public.study_series
  for all to authenticated
  using (created_by = auth.uid() and organization_id = public.get_my_organization_id())
  with check (created_by = auth.uid() and organization_id = public.get_my_organization_id());
