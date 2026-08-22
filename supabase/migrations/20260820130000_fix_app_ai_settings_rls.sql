-- Fix RLS policy on app_ai_settings to allow developers (scoped or unscoped) and admins to manage settings.

drop policy if exists "ai_settings_developer_all" on public.app_ai_settings;
drop policy if exists "ai_settings_select_all" on public.app_ai_settings;

create policy "ai_settings_select_all"
  on public.app_ai_settings for select
  using (true);

create policy "ai_settings_developer_all"
  on public.app_ai_settings for all
  to authenticated
  using (
    public.is_developer_unscoped()
    or public.is_developer()
    or public.is_admin()
    or coalesce((select role from public.profiles where id = auth.uid()), '') in ('developer', 'admin')
  )
  with check (
    public.is_developer_unscoped()
    or public.is_developer()
    or public.is_admin()
    or coalesce((select role from public.profiles where id = auth.uid()), '') in ('developer', 'admin')
  );
