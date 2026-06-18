-- Drop the single catch-all policy
drop policy if exists "journal_entries_all" on public.journal_entries;

-- Select policy: own entries, public entries, or group-shared entries (if they share a group)
create policy "journal_entries_select" on public.journal_entries
  for select to authenticated
  using (
    public.is_developer() or 
    (
      organization_id = public.get_my_organization_id() and 
      (
        auth.uid() = user_id or
        visibility = 'public' or
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

-- Insert policy: own entries in user's active organization
create policy "journal_entries_insert" on public.journal_entries
  for insert to authenticated
  with check (
    public.is_developer() or 
    (
      organization_id = public.get_my_organization_id() and 
      auth.uid() = user_id
    )
  );

-- Update policy: own entries only
create policy "journal_entries_update" on public.journal_entries
  for update to authenticated
  using (
    public.is_developer() or 
    (
      organization_id = public.get_my_organization_id() and 
      auth.uid() = user_id
    )
  )
  with check (
    public.is_developer() or 
    (
      organization_id = public.get_my_organization_id() and 
      auth.uid() = user_id
    )
  );

-- Delete policy: own entries only
create policy "journal_entries_delete" on public.journal_entries
  for delete to authenticated
  using (
    public.is_developer() or 
    (
      organization_id = public.get_my_organization_id() and 
      auth.uid() = user_id
    )
  );
