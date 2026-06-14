-- List every member of an organization by actual membership (profile_organizations),
-- not just their active org. SECURITY DEFINER so it can read co-members' membership
-- rows (RLS otherwise limits a user to their own). Gated: callers may only list
-- members of organizations they themselves belong to (developers may list any).

create or replace function public.org_members(org_id uuid)
returns setof public.profiles
language sql
security definer
stable
set search_path = public
as $$
  select p.*
  from public.profiles p
  join public.profile_organizations po on po.profile_id = p.id
  where po.organization_id = org_id
    and (
      public.is_developer()
      or exists (
        select 1 from public.profile_organizations me
        where me.profile_id = auth.uid()
          and me.organization_id = org_id
      )
    );
$$;

grant execute on function public.org_members(uuid) to authenticated;
