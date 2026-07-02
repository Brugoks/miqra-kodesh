-- Fix: users bounced back to the default organization on sign-in.
--
-- Root cause: on_auth_user_created fires on INSERT OR UPDATE of auth.users,
-- and Supabase updates that row on every sign-in (last_sign_in_at). For OAuth
-- users with no invite_code in auth metadata, handle_new_user() resolved the
-- default org (Charleston Baptist) and its ON CONFLICT branch unconditionally
-- reset active_organization_id and re-inserted that membership — silently
-- undoing admin moves (admin_move_user_to_organization).
--
-- Fixes:
--  1. handle_new_user(): on UPDATE of an existing profile, only sync identity
--     fields (email/name/avatar/provider). Org assignment and membership are
--     signup-only.
--  2. admin_move_user_to_organization(): also move primary_organization_id.
--     It predated that column, leaving a stale pointer that (a) made sign-in
--     snap users back to the old org while still a member, and (b) failed the
--     profiles_update WITH CHECK, silently blocking the user's own profile
--     writes.
--  3. Repair existing rows where primary_organization_id is not one of the
--     user's memberships (Richard H. at time of writing).

-- ── 1. Identity-only sync for existing users ────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  has_invite boolean := false;
begin
  -- Existing profile (sign-ins fire this trigger via auth.users updates):
  -- refresh identity fields only. Never touch org fields or memberships.
  if tg_op = 'UPDATE' and exists (select 1 from public.profiles where id = new.id) then
    update public.profiles
      set email = new.email,
          full_name = coalesce(
            new.raw_user_meta_data->>'full_name',
            new.raw_user_meta_data->>'name',
            full_name
          ),
          avatar_url = coalesce(new.raw_user_meta_data->>'avatar_url', avatar_url),
          provider = coalesce(new.raw_app_meta_data->>'provider', provider),
          role = case
            when new.email = 'markquiambao@gmail.com' then 'developer'
            else role
          end,
          updated_at = now()
      where id = new.id;
    return new;
  end if;

  -- New user: resolve org from the signup invite code, else the default org.
  select id into org_id
  from public.organizations
  where invite_code = (new.raw_user_meta_data->>'invite_code');

  if org_id is not null then
    has_invite := true;
  end if;

  if org_id is null then
    org_id := public.get_default_organization_id();
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    provider,
    role,
    active_organization_id,
    primary_organization_id,
    joined_via_code,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    new.raw_app_meta_data->>'provider',
    case
      when new.email = 'markquiambao@gmail.com' then 'developer'
      else 'student'
    end,
    org_id,
    org_id,
    case
      when new.email = 'markquiambao@gmail.com' then true
      else has_invite
    end,
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    provider = coalesce(excluded.provider, public.profiles.provider),
    role = case
      when excluded.email = 'markquiambao@gmail.com' then 'developer'
      else public.profiles.role
    end,
    joined_via_code = case
      when excluded.email = 'markquiambao@gmail.com' then true
      else public.profiles.joined_via_code or excluded.joined_via_code
    end,
    updated_at = now();

  insert into public.profile_organizations (profile_id, organization_id)
  values (new.id, org_id)
  on conflict do nothing;

  return new;
end;
$$;

-- ── 2. Moves also carry the primary organization ────────────────────────────
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

  delete from public.profile_organizations where profile_id = target_user;
  insert into public.profile_organizations (profile_id, organization_id)
    values (target_user, target_org)
    on conflict do nothing;

  update public.profiles
    set active_organization_id = target_org,
        primary_organization_id = target_org,
        updated_at = now()
    where id = target_user;
end;
$$;

grant execute on function public.admin_move_user_to_organization(uuid, uuid) to authenticated;

-- ── 3. Repair stale primary orgs ────────────────────────────────────────────
-- A primary org the user isn't a member of blocks their own profile updates
-- (profiles_update WITH CHECK). Re-point it at their active org when that org
-- is a real membership.
update public.profiles p
  set primary_organization_id = p.active_organization_id,
      updated_at = now()
  where p.primary_organization_id is not null
    and not exists (
      select 1 from public.profile_organizations po
      where po.profile_id = p.id and po.organization_id = p.primary_organization_id
    )
    and exists (
      select 1 from public.profile_organizations po
      where po.profile_id = p.id and po.organization_id = p.active_organization_id
    );
