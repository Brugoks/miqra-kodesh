-- Fix: leaders could not create calendar events.
--
-- The app role vocabulary is student / leader / admin / developer (see
-- src/lib/roles.js), and the frontend shows the "Create Event" form to every
-- leader role. But can_create_events() was still using the original role list
-- ('admin', 'student_leader', 'parent_leader') and never picked up 'leader'
-- (or 'developer'). Both calendar_events INSERT policies gate on this function,
-- so every user with role 'leader' hit
--   "new row violates row-level security policy for table calendar_events".
--
-- is_leader() and can_manage_channels() were already migrated to the current
-- vocabulary; this brings can_create_events() in line with them.

create or replace function public.can_create_events()
returns boolean
language sql
stable
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'student'
  ) in ('developer', 'admin', 'leader', 'student_leader', 'parent_leader')
$$;
