-- Remove seeded demo content from Small Groups and Bible Study modules.
-- Only deletes the specific rows inserted by earlier seed migrations;
-- any real data entered by users is untouched.

-- Small Groups demo groups (and their attendance records via cascade)
delete from public.attendance_groups
where id in ('boys', 'girls', 'middle');

-- Bible Study demo series
delete from public.study_series
where id in ('study_love', 'study_unity', 'study_faith');
