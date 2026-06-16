-- Let every signed-in user see all small groups when the Fellowship module is
-- filtered to All. Management permissions remain restricted by attendance_groups_all.
drop policy if exists "attendance_groups_select" on public.attendance_groups;

create policy "attendance_groups_select" on public.attendance_groups
  for select to authenticated
  using (true);
