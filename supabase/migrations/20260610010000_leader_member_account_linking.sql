-- Let leaders find signed-up app profiles so pre-created attendance members
-- can be linked to real accounts after the student creates one.

drop policy if exists "Leaders view profiles for member linking" on public.profiles;

create policy "Leaders view profiles for member linking"
  on public.profiles for select
  to authenticated
  using (public.is_leader());

