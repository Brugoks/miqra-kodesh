-- Add meeting_end_time column to attendance_groups table
alter table public.attendance_groups add column if not exists meeting_end_time text;
