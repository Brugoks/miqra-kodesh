-- A personal moment can be saved before Scripture or an AI study exists.
-- The existing owner-only RLS policy also covers this private JSON field.
alter table public.study_canvases
  add column journey jsonb;

alter table public.study_canvases drop constraint study_canvases_passages_check;
alter table public.study_canvases add constraint study_canvases_passages_check check (
  jsonb_typeof(passages) = 'array' and jsonb_array_length(passages) between 0 and 4
  and (jsonb_array_length(passages) > 0 or journey is not null)
);
alter table public.study_canvases add constraint study_canvases_journey_check check (
  journey is null or (
    jsonb_typeof(journey) = 'object'
    and journey->>'kind' = 'moment'
    and jsonb_typeof(journey->'moment') = 'string'
    and char_length(btrim(journey->>'moment')) between 1 and 4000
    and jsonb_typeof(journey->'createdAt') = 'string'
    and jsonb_typeof(journey->'entries') = 'array'
    and jsonb_array_length(journey->'entries') <= 100
    and journey ?& array['kind', 'moment', 'createdAt', 'entries', 'revisitOn']
  ) is true
);
-- Personal journeys are never exposed through the existing study share RPC.
-- Enforced on the server, even when a client tries to mint a share token.
alter table public.study_canvases add constraint study_canvases_journey_private
  check (journey is null or share_token is null);
alter table public.study_canvases drop constraint study_canvases_size;
alter table public.study_canvases add constraint study_canvases_size check (
  octet_length(passages::text) + octet_length(steps::text) + octet_length(pins::text)
  + coalesce(octet_length(journey::text), 0) < 3000000
);
