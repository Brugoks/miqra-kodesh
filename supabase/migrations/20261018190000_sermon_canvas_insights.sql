-- The part of a sermon that is safe and useful to offer every member of the
-- church, for the Living Canvas "Hear it in a sermon" panel: a few grounded
-- claims, each tied to a verified passage and to words the speaker really said,
-- with a question to sit with.
--
-- It lives on sermon_talks, not on sermon_talk_berean: the Berean report is a
-- leader tool (leaders-only RLS) whose findings a congregation should not
-- receive second-hand, whereas a published talk is already readable by its
-- organization's members. The pack is built from the sermon alone. It holds no
-- member data of any kind, and nothing here reads study_canvases: matching a
-- pack to a person's moment happens on that person's side, when they ask.
--
-- Existing policies cover the column: members read published talks in their
-- organization (sermon_talks_select); only the talk's creator or an admin can
-- write it from the app, and the ingest skill writes it as the service role.
alter table public.sermon_talks add column canvas_insights jsonb;

-- Structural limits, mirrored from supabase/functions/berean-analysis/insights.ts.
-- The ingest skill validates the pack there before writing; this keeps a pack
-- the client would have to defend against out of the table at all. Every test
-- is wrapped so it answers true or false and never null: a missing key must
-- reject the pack, not make the whole check unknown (and bool_and ignores nulls).
create or replace function public.sermon_canvas_insights_valid(p jsonb)
returns boolean language sql immutable set search_path = public as $$
  select case
    when p is null then true
    when jsonb_typeof(p) is distinct from 'object'
      or (p->>'version') is distinct from '1'
      or jsonb_typeof(p->'insights') is distinct from 'array'
      or jsonb_array_length(p->'insights') > 6
      or octet_length(p::text) > 30000 then false
    else coalesce((
      select bool_and(coalesce(
        jsonb_typeof(i) = 'object'
        and jsonb_typeof(i->'id') = 'string' and char_length(i->>'id') between 1 and 16
        and jsonb_typeof(i->'anchor') = 'string' and char_length(i->>'anchor') between 1 and 100
        and jsonb_typeof(i->'claim') = 'string' and char_length(i->>'claim') between 1 and 280
        and jsonb_typeof(i->'question') = 'string' and char_length(i->>'question') between 1 and 240
        and jsonb_typeof(i->'refs') = 'array' and jsonb_array_length(i->'refs') <= 4
        and not exists (select 1 from jsonb_array_elements(i->'refs') r
          where jsonb_typeof(r) is distinct from 'string' or char_length(r #>> '{}') > 100)
        and (jsonb_typeof(i->'quote') = 'null' or (
          jsonb_typeof(i->'quote') = 'object'
          and jsonb_typeof(i->'quote'->'text') = 'string' and char_length(i->'quote'->>'text') between 1 and 400
          and jsonb_typeof(i->'quote'->'at') in ('string', 'null')))
        , false))
      from jsonb_array_elements(p->'insights') i
    ), true)
  end
$$;

alter table public.sermon_talks add constraint sermon_talks_canvas_insights_check
  check (public.sermon_canvas_insights_valid(canvas_insights));
