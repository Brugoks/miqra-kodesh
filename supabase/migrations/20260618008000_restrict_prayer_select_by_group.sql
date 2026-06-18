-- Drop the existing prayers select policy
drop policy if exists "prayers_select" on public.prayers;

-- Create a restricted prayers select policy based on small group membership
create policy "prayers_select" on public.prayers
  for select to authenticated
  using (
    public.is_developer() or 
    (
      organization_id = public.get_my_organization_id() and 
      (
        auth.uid() = user_id or
        public.is_admin() or
        exists (
          select 1 from public.attendance_groups g
          where g.organization_id = prayers.organization_id
            and (
              (g.students @> jsonb_build_array(jsonb_build_object('linkedUserId', auth.uid())) or g.leader = (select full_name from public.profiles where id = auth.uid()))
              and
              (g.students @> jsonb_build_array(jsonb_build_object('linkedUserId', prayers.user_id)) or g.leader = (select full_name from public.profiles where id = prayers.user_id))
            )
        )
      )
    )
  );
