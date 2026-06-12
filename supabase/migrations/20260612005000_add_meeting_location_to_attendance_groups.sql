-- Add meeting_location column to the attendance_groups table if it doesn't exist
ALTER TABLE public.attendance_groups ADD COLUMN IF NOT EXISTS meeting_location text;
