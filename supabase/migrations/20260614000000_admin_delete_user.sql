-- Allow admins/developers to delete a user.
--
-- Deleting from auth.users directly is not possible for standard users due to schema privileges
-- and standard security mechanisms. This SECURITY DEFINER function executes as the superuser/owner
-- (postgres), allowing authorized admins/developers to delete users from the system.
-- Deleting from auth.users automatically cascades to public.profiles via foreign keys.

create or replace function public.admin_delete_user(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
begin
  -- Enforce that only admins or developers can delete users.
  if not (public.is_developer() or public.is_admin()) then
    raise exception 'Only admins or developers can delete users.';
  end if;

  -- Prevent a user from deleting themselves (safety check)
  if target_user = caller then
    raise exception 'You cannot delete your own account.';
  end if;

  -- Enforce that non-developer admins can only delete users who currently share an organization with them.
  if not public.is_developer() then
    if not exists (
      select 1
      from public.profile_organizations po_admin
      join public.profile_organizations po_user
        on po_admin.organization_id = po_user.organization_id
      where po_admin.profile_id = caller
        and po_user.profile_id = target_user
    ) then
      raise exception 'You can only delete users within your own organization.';
    end if;
  end if;

  -- Delete from auth.users
  delete from auth.users where id = target_user;
end;
$$;

grant execute on function public.admin_delete_user(uuid) to authenticated;
