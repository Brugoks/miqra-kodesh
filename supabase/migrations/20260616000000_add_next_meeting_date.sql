-- Add next_meeting_date column to attendance_groups table
alter table public.attendance_groups add column if not exists next_meeting_date date;
