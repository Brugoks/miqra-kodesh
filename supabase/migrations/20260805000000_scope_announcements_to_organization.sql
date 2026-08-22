-- Scope announcements to the author's organization.
--
-- The multi-tenant rollout (20260612000000) added org-scoped policies to
-- public.announcements, but its `drop policy if exists` calls only named the
-- new policies (`announcements_select` / `announcements_all`) — the
-- pre-multi-tenant policies created in 20260610008000 were left in place.
-- PERMISSIVE policies are OR'd together, so:
--   * "Authenticated users read announcements" USING (true)  -> every
--     authenticated user could read every organization's announcements.
--   * "Leaders manage announcements" USING (is_leader())     -> any leader
--     could insert/update/delete announcements in any organization.
-- Dropping them leaves only the org-scoped policies below.

drop policy if exists "Authenticated users read announcements" on public.announcements;
drop policy if exists "Leaders manage announcements" on public.announcements;
drop policy if exists "Admins manage announcements" on public.announcements;
drop policy if exists "announcements_select" on public.announcements;
drop policy if exists "announcements_all" on public.announcements;

create policy "announcements_select" on public.announcements
  for select to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

-- The Dashboard gates the "New announcement" form on isLeaderRole(), so the
-- write policy uses is_leader() rather than the is_admin() the multi-tenant
-- migration set — otherwise dropping "Leaders manage announcements" would take
-- posting away from leaders. The org check is what actually changes here:
-- writes are confined to the caller's active organization, and the WITH CHECK
-- also blocks a client from stamping a row with someone else's organization_id.
create policy "announcements_all" on public.announcements
  for all to authenticated
  using (
    public.is_developer()
    or (organization_id = public.get_my_organization_id() and public.is_leader())
  )
  with check (
    public.is_developer()
    or (organization_id = public.get_my_organization_id() and public.is_leader())
  );

create index if not exists announcements_org_date_idx
  on public.announcements (organization_id, sort_order, announcement_date desc);
