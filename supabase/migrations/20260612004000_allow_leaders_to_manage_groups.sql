-- Drop the old policy that restricted attendance group management to admins only
drop policy if exists "attendance_groups_all" on public.attendance_groups;

-- Create a new policy that allows both developers and leaders (which includes admins) to manage attendance groups
create policy "attendance_groups_all" on public.attendance_groups
  for all to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and public.is_leader()))
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and public.is_leader()));
