-- Let developers browse an organization exactly as one of its members sees it.
--
-- Every org-isolation policy in this schema is shaped
--   using (public.is_developer() or organization_id = public.get_my_organization_id())
-- so a developer receives every tenant's rows — 128 policies across 61 tables.
-- Any component that leans on RLS instead of filtering by activeOrgId therefore
-- bleeds other organizations' data into the page, which is precisely what a
-- developer switching orgs is trying to check for.
--
-- Rather than rewrite 128 policies, this splits the two jobs is_developer() was
-- doing — "is this account a developer" and "may it cross org boundaries" — and
-- makes the second one switchable:
--
--   public.is_developer_unscoped()  -> the old, always-cross-org behaviour.
--                                      Reserved for developer tooling.
--   public.is_developer()           -> false while scoping is on, so every
--                                      org-isolation policy falls through to
--                                      organization_id = get_my_organization_id().
--
-- Org switching already writes profiles.active_organization_id (App.jsx
-- handleSwitchOrganization), so a scoped developer lands in the target org with
-- exactly a member's visibility. Scoping defaults to ON.

alter table public.profiles
  add column if not exists dev_org_scope_enabled boolean not null default true;

comment on column public.profiles.dev_org_scope_enabled is
  'Developers only: when true (default) RLS treats the account as a plain member of its active organization. Turn off for cross-org tooling.';

-- Service-role callers (edge functions) must never be org-scoped.
create or replace function public.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') = 'service_role';
$$;

-- The original is_developer() semantics, preserved verbatim for dev tooling.
create or replace function public.is_developer_unscoped()
returns boolean
language sql
stable
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'student'
  ) = 'developer'
  or public.is_service_role();
$$;

-- security definer so reading the flag never re-enters the profiles RLS policies
-- that call is_developer() themselves.
create or replace function public.dev_org_scoping_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.dev_org_scope_enabled from public.profiles p where p.id = auth.uid()), true);
$$;

create or replace function public.is_developer()
returns boolean
language sql
stable
as $$
  select public.is_service_role()
    or (public.is_developer_unscoped() and not public.dev_org_scoping_active());
$$;

-- Developer tooling keeps full cross-org reach regardless of scoping, otherwise
-- turning scoping on would empty the dev portal and strand the developer with no
-- way to inspect or move users between organizations.
do $$
declare
  fn record;
  new_def text;
begin
  for fn in
    select p.oid, pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in (
        'admin_activity_metrics',
        'admin_activity_pulse',
        'admin_delete_user',
        'admin_move_user_to_organization',
        'dev_cron_status',
        'dev_fish_tts_metrics',
        'dev_rls_coverage',
        'dev_top_consumers',
        'dev_top_queries',
        'dev_usage_daily',
        'dev_usage_snapshot'
      )
      and pg_get_functiondef(p.oid) like '%is_developer()%'
  loop
    -- Two-step so an already-qualified public.is_developer() does not become
    -- public.public.is_developer_unscoped().
    new_def := replace(fn.def, 'public.is_developer()', '@@DEVCHECK@@');
    new_def := replace(new_def, 'is_developer()', '@@DEVCHECK@@');
    new_def := replace(new_def, '@@DEVCHECK@@', 'public.is_developer_unscoped()');
    execute new_def;
  end loop;
end $$;

-- Same for the developer-only tables behind that tooling.
drop policy if exists "api_usage_events_developer_select" on public.api_usage_events;
create policy "api_usage_events_developer_select" on public.api_usage_events
  for select to authenticated
  using (public.is_developer_unscoped());

drop policy if exists "quota_alerts_developer_select" on public.quota_alerts;
create policy "quota_alerts_developer_select" on public.quota_alerts
  for select to authenticated
  using (public.is_developer_unscoped());

drop policy if exists "email_settings_developer_select" on public.app_email_settings;
create policy "email_settings_developer_select" on public.app_email_settings
  for select to authenticated
  using (public.is_developer_unscoped());

drop policy if exists "email_settings_developer_update" on public.app_email_settings;
create policy "email_settings_developer_update" on public.app_email_settings
  for update to authenticated
  using (public.is_developer_unscoped())
  with check (public.is_developer_unscoped());

-- The org switcher itself must keep working while scoped, or a developer who
-- scopes into an org cannot get back out.
drop policy if exists "allow_admin_manage_organizations" on public.organizations;
create policy "allow_admin_manage_organizations" on public.organizations
  for all to authenticated
  using (public.is_developer_unscoped() or public.is_admin())
  with check (public.is_developer_unscoped() or public.is_admin());

drop policy if exists "profile_organizations_select" on public.profile_organizations;
create policy "profile_organizations_select" on public.profile_organizations
  for select to authenticated
  using (profile_id = auth.uid() or public.is_developer_unscoped());

drop policy if exists "profile_organizations_insert" on public.profile_organizations;
create policy "profile_organizations_insert" on public.profile_organizations
  for insert to authenticated
  with check (profile_id = auth.uid() or public.is_developer_unscoped());

-- public.profiles carried three separate cross-org read paths that would keep
-- bleeding other tenants' members into the page even with scoping on:
--
--   1. "Leaders view profiles for member linking" USING is_leader() — unscoped,
--      so any leader of any organization could read every profile in the
--      database. Same class of leftover as the announcements policies.
--   2. "Admin view all" hardcoded to a single email address — an unconditional
--      global read that no scoping switch could ever turn off.
--   3. profiles_select keyed to *every* organization the caller has ever joined
--      rather than the active one. Switching orgs as a developer inserts a
--      profile_organizations row each time, so that set grows with every org
--      visited and the roster fills with strangers.
--
-- All three now key off the active organization, matching the rest of the schema.

drop policy if exists "Leaders view profiles for member linking" on public.profiles;
create policy "Leaders view profiles for member linking" on public.profiles
  for select to authenticated
  using (public.is_leader() and active_organization_id = public.get_my_organization_id());

drop policy if exists "Admin view all" on public.profiles;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (
    auth.uid() = id
    or public.is_developer()
    or active_organization_id = public.get_my_organization_id()
  );

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update to authenticated
  using (
    auth.uid() = id
    or public.is_developer()
    or (active_organization_id = public.get_my_organization_id() and public.is_admin())
  );
