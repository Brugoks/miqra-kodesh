-- Allow admins/developers to move a user to a different organization.
--
-- Direct table writes are blocked by RLS for this case: profile_organizations
-- only lets a user insert their own membership, and profiles_update's WITH CHECK
-- requires the target's active org to stay within the admin's own orgs. This
-- SECURITY DEFINER function performs the relocation atomically while still
-- enforcing that non-developer admins may only move users they share an org with.

create or replace function public.admin_move_user_to_organization(target_user uuid, target_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if not (public.is_developer() or public.is_admin()) then
    raise exception 'Only admins can move users between organizations.';
  end if;

  -- Non-developer admins may only move users who currently share an organization with them.
  if not public.is_developer() then
    if not exists (
      select 1
      from public.profile_organizations po_admin
      join public.profile_organizations po_user
        on po_admin.organization_id = po_user.organization_id
      where po_admin.profile_id = caller
        and po_user.profile_id = target_user
    ) then
      raise exception 'You can only move users within your own organization.';
    end if;
  end if;

  if not exists (select 1 from public.organizations where id = target_org) then
    raise exception 'Target organization does not exist.';
  end if;

  -- Relocate: replace memberships with the single target organization.
  delete from public.profile_organizations where profile_id = target_user;
  insert into public.profile_organizations (profile_id, organization_id)
    values (target_user, target_org)
    on conflict do nothing;

  update public.profiles
    set active_organization_id = target_org,
        updated_at = now()
    where id = target_user;
end;
$$;

grant execute on function public.admin_move_user_to_organization(uuid, uuid) to authenticated;
