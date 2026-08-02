-- Structured home for the short discussion questions the sermon-berean-review
-- skill generates, so they're queryable/displayable beyond the one-off
-- #sermons-messages chat post (which is the only place they lived before).
alter table public.sermon_talks
  add column if not exists discussion_questions jsonb;

comment on column public.sermon_talks.discussion_questions is
  'JSON array of short discussion question strings generated alongside the summary/key_takeaways.';
