-- Remove ALL seeded demo content from the database.
-- Targets every table where demo rows were inserted by earlier seed migrations.
-- Any row created by real users is untouched.

-- ── Small Groups (attendance_groups) ─────────────────────────────────────────
-- Original seeds used fixed IDs 'boys', 'girls', 'middle'.
-- After the multi-tenant migration the app also auto-seeded org-suffixed IDs
-- like 'boys-<org_uuid>', 'girls-<org_uuid>', 'middle-<org_uuid>'.
delete from public.attendance_groups
where id = 'boys' or id = 'girls' or id = 'middle'
   or id like 'boys-%' or id like 'girls-%' or id like 'middle-%';

-- ── Bible Study Series (study_series) ────────────────────────────────────────
delete from public.study_series
where id in ('study_love', 'study_unity', 'study_faith');

-- ── Leader Discussion Feedback (feedback) ─────────────────────────────────────
-- Seeded with IDs like 'f1-<org_uuid>', 'f2-<org_uuid>'.
delete from public.feedback
where id like 'f1-%' or id like 'f2-%';

-- ── Roster (roster) ──────────────────────────────────────────────────────────
-- Seeded with IDs like 'r1-<org_uuid>' … 'r5-<org_uuid>'.
delete from public.roster
where id like 'r1-%' or id like 'r2-%' or id like 'r3-%'
   or id like 'r4-%' or id like 'r5-%';
