-- Restore the attendance author column expected by admin activity metrics.
-- Some live databases were created before this column existed in attendance.

alter table public.attendance
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists attendance_created_by_created_idx
  on public.attendance (created_by, created_at desc)
  where created_by is not null;
