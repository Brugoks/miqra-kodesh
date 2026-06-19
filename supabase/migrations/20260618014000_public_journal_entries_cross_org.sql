-- Allow public journal entries to appear on all authenticated users' dashboards,
-- regardless of organization. Group-shared and private entries remain org-scoped.
drop policy if exists "journal_entries_select" on public.journal_entries;

create policy "journal_entries_select" on public.journal_entries
  for select to authenticated
  using (
    public.is_developer() or
    visibility = 'public' or
    (
      organization_id = public.get_my_organization_id() and
      (
        auth.uid() = user_id or
        (
          visibility = 'groups' and exists (
            select 1 from public.attendance_groups g
            where g.organization_id = journal_entries.organization_id
              and (
                (g.students @> jsonb_build_array(jsonb_build_object('linkedUserId', auth.uid())) or g.leader = (select full_name from public.profiles where id = auth.uid()))
                and
                (g.students @> jsonb_build_array(jsonb_build_object('linkedUserId', journal_entries.user_id)) or g.leader = (select full_name from public.profiles where id = journal_entries.user_id))
              )
          )
        )
      )
    )
  );
