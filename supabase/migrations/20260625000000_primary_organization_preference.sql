-- Let multi-organization users choose the organization the app should load by default.

alter table public.profiles
  add column if not exists primary_organization_id uuid references public.organizations(id) on delete set null;

update public.profiles p
  set primary_organization_id = p.active_organization_id
  where p.primary_organization_id is null
    and exists (
      select 1
      from public.profile_organizations po
      where po.profile_id = p.id
        and po.organization_id = p.active_organization_id
    );

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update to authenticated
  using (
    auth.uid() = id
    or public.is_developer()
    or (
      active_organization_id in (
        select organization_id
        from public.profile_organizations
        where profile_id = auth.uid()
      )
      and public.is_admin()
    )
  )
  with check (
    (
      auth.uid() = id
      and active_organization_id in (
        select organization_id
        from public.profile_organizations
        where profile_id = auth.uid()
      )
      and (
        primary_organization_id is null
        or primary_organization_id in (
          select organization_id
          from public.profile_organizations
          where profile_id = auth.uid()
        )
      )
    )
    or public.is_developer()
    or (
      active_organization_id in (
        select organization_id
        from public.profile_organizations
        where profile_id = auth.uid()
      )
      and public.is_admin()
    )
  );

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
  -- Look up organization by invite code passed in raw_user_meta_data
  select id into org_id
  from public.organizations
  where invite_code = (new.raw_user_meta_data->>'invite_code');

  if org_id is not null then
    has_invite := true;
  end if;

  -- If not found, default to Charleston Baptist Church
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
    active_organization_id = excluded.active_organization_id,
    primary_organization_id = coalesce(public.profiles.primary_organization_id, excluded.primary_organization_id),
    joined_via_code = case
      when excluded.email = 'markquiambao@gmail.com' then true
      else public.profiles.joined_via_code or excluded.joined_via_code
    end,
    updated_at = now();

  -- Add to the join table
  insert into public.profile_organizations (profile_id, organization_id)
  values (new.id, org_id)
  on conflict do nothing;

  return new;
end;
$$;
