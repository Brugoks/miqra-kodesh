-- Prayer Wall: answered-prayer state + server-side enforcement of the
-- shared-group visibility rule that was previously client-side only.

alter table public.prayers
  add column if not exists answered_at timestamptz,
  add column if not exists answered_by uuid references public.profiles(id) on delete set null;

create index if not exists prayers_answered_at_idx
  on public.prayers (organization_id, answered_at);

-- Members may only read prayers from people they share a small group with
-- (plus their own). Leaders and developers keep org-wide visibility. This
-- mirrors the group-membership containment check already used by the
-- journal_entries select policy.
drop policy if exists "Authenticated users read prayers" on public.prayers;
drop policy if exists "prayers_select" on public.prayers;
create policy "prayers_select" on public.prayers
  for select to authenticated
  using (
    public.is_developer()
    or (
      organization_id = public.get_my_organization_id()
      and (
        auth.uid() = user_id
        or public.is_leader()
        or exists (
          select 1 from public.attendance_groups g
          where g.organization_id = prayers.organization_id
            and g.students @> jsonb_build_array(jsonb_build_object('linkedUserId', auth.uid()))
            and g.students @> jsonb_build_array(jsonb_build_object('linkedUserId', prayers.user_id))
        )
      )
    )
  );
