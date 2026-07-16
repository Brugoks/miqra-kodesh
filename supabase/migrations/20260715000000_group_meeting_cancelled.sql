-- Let leaders cancel a specific Bible Study meeting occurrence.
-- Meetings are computed on the fly from a group's recurring schedule; a
-- cancelled occurrence is a group_meetings row flagged `cancelled = true`.
-- The Calendar hides cancelled occurrences (and suppresses the computed
-- recurrence for that date); the Studies module shows them as "Cancelled"
-- with a Restore action. Existing group_meetings RLS covers this column.

alter table public.group_meetings
  add column if not exists cancelled boolean not null default false;
