-- Add sort_order column to attendance_groups table
alter table public.attendance_groups add column if not exists sort_order integer default 0;
