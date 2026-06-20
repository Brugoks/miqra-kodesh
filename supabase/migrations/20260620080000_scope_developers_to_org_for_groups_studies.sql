-- Scope the developer role to the active organization for Small Groups and
-- Bible Studies as well. Previously these tables kept an is_developer() bypass
-- (cross-tenant visibility for support). The product decision is that even
-- developer accounts should only see/manage the groups and studies of their
-- currently active organization here, so switching active org is the only way
-- to view another org's data.
--
-- Cross-org aggregates that genuinely need every tenant (e.g. dev_usage_snapshot)
-- are SECURITY DEFINER and bypass RLS independently, so they are unaffected.
-- Developer accounts still pass is_leader()/is_admin() within their active org,
-- so management within the active org is retained.

-- ── attendance_groups ───────────────────────────────────────────────────────
drop policy if exists "attendance_groups_select" on public.attendance_groups;
create policy "attendance_groups_select" on public.attendance_groups
  for select to authenticated
  using (organization_id = public.get_my_organization_id());

drop policy if exists "attendance_groups_all" on public.attendance_groups;
create policy "attendance_groups_all" on public.attendance_groups
  for all to authenticated
  using (organization_id = public.get_my_organization_id() and public.is_leader())
  with check (organization_id = public.get_my_organization_id() and public.is_leader());

-- ── group_meetings (inherits org via its group) ─────────────────────────────
drop policy if exists "group_meetings_select" on public.group_meetings;
create policy "group_meetings_select" on public.group_meetings
  for select to authenticated
  using (
    group_id in (
      select id from public.attendance_groups
      where organization_id = public.get_my_organization_id()
    )
  );

drop policy if exists "group_meetings_manage" on public.group_meetings;
create policy "group_meetings_manage" on public.group_meetings
  for all to authenticated
  using (
    public.is_leader() and group_id in (
      select id from public.attendance_groups
      where organization_id = public.get_my_organization_id()
    )
  )
  with check (
    public.is_leader() and group_id in (
      select id from public.attendance_groups
      where organization_id = public.get_my_organization_id()
    )
  );

-- ── study_series ────────────────────────────────────────────────────────────
drop policy if exists "study_series_select" on public.study_series;
create policy "study_series_select" on public.study_series
  for select to authenticated
  using (organization_id = public.get_my_organization_id());

drop policy if exists "study_series_all" on public.study_series;
create policy "study_series_all" on public.study_series
  for all to authenticated
  using (organization_id = public.get_my_organization_id() and public.is_admin())
  with check (organization_id = public.get_my_organization_id() and public.is_admin());

-- "Users manage own study series" already has no developer bypass (created_by
-- AND active org); left unchanged.
