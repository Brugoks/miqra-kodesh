-- Reading Plans Phase 3: calendar-mode scheduling + missed-day recovery.
-- 'flexible' (default) keeps today's self-paced behavior — no missed days,
-- only the gentle pace delta. 'calendar' pins day N to a real date so past
-- days without a resolved row are missed and can be read, skipped, or
-- resolved via "catch me up" (which just re-anchors started_at).

alter table public.reading_plan_enrollments
  add column if not exists schedule_mode text not null default 'flexible'
    check (schedule_mode in ('flexible', 'calendar'));

alter table public.reading_plan_progress
  add column if not exists skipped boolean not null default false;
