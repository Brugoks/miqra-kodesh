-- Make the role helpers SECURITY DEFINER so they stop re-entering profiles RLS.
--
-- is_admin(), is_leader(), is_developer_unscoped(), can_create_events() and
-- can_manage_channels() all read `select role from public.profiles where
-- id = auth.uid()`, and public.profiles' own policies call those same helpers.
-- That is a cycle: evaluating a profiles policy calls is_developer(), which
-- selects from profiles, which evaluates the policies again.
--
-- Until now the cycle was masked. The "System upsert" policy (dropped in
-- 20260805020000) was PERMISSIVE FOR ALL to PUBLIC with USING (true), and the
-- planner short-circuits the OR of permissive policies on a constant true, so
-- the helpers were never re-entered. Removing that policy made the recursion
-- reachable: `stack depth limit exceeded`.
--
-- SECURITY DEFINER is the standard fix and is already how
-- get_my_organization_id() reads the same row. These functions only ever read
-- the caller's own profile keyed by auth.uid(), so running them as owner grants
-- no extra reach; search_path is pinned so the definer context cannot be
-- hijacked by a caller-controlled search_path.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'student'
  ) in ('admin', 'developer')
  or coalesce(auth.jwt() ->> 'email', '') = 'markquiambao@gmail.com'
$$;

create or replace function public.is_leader()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'student'
  ) in ('developer', 'admin', 'leader', 'student_leader', 'parent_leader')
$$;

create or replace function public.is_developer_unscoped()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'student'
  ) = 'developer'
  or public.is_service_role();
$$;

create or replace function public.can_create_events()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'student'
  ) in ('developer', 'admin', 'leader', 'student_leader', 'parent_leader')
$$;

create or replace function public.can_manage_channels()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'student')
    in ('developer', 'admin', 'leader', 'student_leader', 'parent_leader')
$$;
