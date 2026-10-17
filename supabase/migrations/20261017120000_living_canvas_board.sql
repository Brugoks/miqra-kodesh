-- Where each thought of a personal Living Canvas sits: card positions, named
-- sections and labelled connections. It lives beside `journey`, never inside
-- it, so a client that predates the board rewrites the words without erasing
-- the layout. The board holds placements only; the text stays in `journey`.
--
-- The owner-only RLS policy already covers every column. A board needs a
-- journey, and a journey can never be shared, so layout is never reachable
-- through get_shared_study_canvas (which selects explicit fields anyway).
alter table public.study_canvases add column board jsonb;

-- Structural limits enforced here as well as in the client (canvasBoard.js):
-- version, caps, bounded numbers, unique ids, known colours and directions,
-- sections that exist, and connections between distinct, existing cards.
-- Whether a card points at a real journey entry is checked by the client;
-- a layout that outlives an entry is tolerated and omitted when read.
--
-- Every test below goes through a helper that answers true or false and never
-- null: a missing key must reject the board, not make the whole check unknown.
create or replace function public.study_canvas_json_number(j jsonb, low numeric, high numeric)
returns boolean language sql immutable set search_path = public as $$
  select case when jsonb_typeof(j) = 'number' then (j #>> '{}')::numeric between low and high else false end
$$;

create or replace function public.study_canvas_json_text(j jsonb, min_length integer, max_length integer)
returns boolean language sql immutable set search_path = public as $$
  select case when jsonb_typeof(j) = 'string' then char_length(j #>> '{}') between min_length and max_length else false end
$$;

create or replace function public.study_canvas_board_valid(b jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  item jsonb;
  all_ids text[] := '{}';
  node_ids text[] := '{}';
  section_ids text[] := '{}';
  refs text[] := '{}';
  pairs text[] := '{}';
  ref text;
  pair text;
begin
  if b is null then return true; end if;
  if jsonb_typeof(b) is distinct from 'object'
    or not public.study_canvas_json_number(b->'version', 1, 1)
    or jsonb_typeof(b->'nodes') is distinct from 'array'
    or jsonb_typeof(b->'sections') is distinct from 'array'
    or jsonb_typeof(b->'edges') is distinct from 'array'
  then return false; end if;
  if jsonb_array_length(b->'nodes') > 101 or jsonb_array_length(b->'sections') > 20 or jsonb_array_length(b->'edges') > 200 then return false; end if;

  for item in select * from jsonb_array_elements(b->'sections') loop
    if jsonb_typeof(item) is distinct from 'object'
      or not public.study_canvas_json_text(item->'id', 1, 200) or coalesce((item->>'id') = any(all_ids), false)
      or not public.study_canvas_json_text(item->'title', 0, 80)
      or not coalesce((item->>'color') = any (array['neutral', 'teal', 'purple', 'amber']), false)
      or not public.study_canvas_json_number(item->'x', -100000, 100000)
      or not public.study_canvas_json_number(item->'y', -100000, 100000)
      or not public.study_canvas_json_number(item->'width', 280, 20000)
      or not public.study_canvas_json_number(item->'height', 280, 20000)
      or jsonb_typeof(item->'collapsed') is distinct from 'boolean'
    then return false; end if;
    all_ids := all_ids || (item->>'id');
    section_ids := section_ids || (item->>'id');
  end loop;

  for item in select * from jsonb_array_elements(b->'nodes') loop
    if jsonb_typeof(item) is distinct from 'object'
      or not public.study_canvas_json_text(item->'id', 1, 200) or coalesce((item->>'id') = any(all_ids), false)
      or jsonb_typeof(item->'contentRef') is distinct from 'object'
      or not public.study_canvas_json_number(item->'x', -100000, 100000)
      or not public.study_canvas_json_number(item->'y', -100000, 100000)
      or not public.study_canvas_json_number(item->'width', 200, 640)
      or not coalesce(jsonb_typeof(item->'sectionId') = 'null'
        or (jsonb_typeof(item->'sectionId') = 'string' and (item->>'sectionId') = any(section_ids)), false)
    then return false; end if;
    if item#>>'{contentRef,type}' = 'moment' then ref := 'moment';
    elsif item#>>'{contentRef,type}' = 'entry' and public.study_canvas_json_text(item#>'{contentRef,entryId}', 1, 200)
    then ref := 'entry:' || (item#>>'{contentRef,entryId}');
    else return false; end if;
    if ref = any(refs) then return false; end if;
    refs := refs || ref;
    all_ids := all_ids || (item->>'id');
    node_ids := node_ids || (item->>'id');
  end loop;

  for item in select * from jsonb_array_elements(b->'edges') loop
    if jsonb_typeof(item) is distinct from 'object'
      or not public.study_canvas_json_text(item->'id', 1, 200) or coalesce((item->>'id') = any(all_ids), false)
      or not public.study_canvas_json_text(item->'source', 1, 200) or not public.study_canvas_json_text(item->'target', 1, 200)
      or not coalesce((item->>'source') = any(node_ids), false) or not coalesce((item->>'target') = any(node_ids), false)
      or (item->>'source') = (item->>'target')
      or not public.study_canvas_json_text(item->'label', 0, 120)
      or not coalesce((item->>'direction') = any (array['none', 'forward']), false)
    then return false; end if;
    pair := least(item->>'source', item->>'target') || chr(1) || greatest(item->>'source', item->>'target');
    if pair = any(pairs) then return false; end if;
    pairs := pairs || pair;
    all_ids := all_ids || (item->>'id');
  end loop;
  return true;
end;
$$;

alter table public.study_canvases add constraint study_canvases_board_check check (
  board is null or (journey is not null and coalesce(public.study_canvas_board_valid(board), false))
);

-- The row limit now counts the layout too.
alter table public.study_canvases drop constraint study_canvases_size;
alter table public.study_canvases add constraint study_canvases_size check (
  octet_length(passages::text) + octet_length(steps::text) + octet_length(pins::text)
  + coalesce(octet_length(journey::text), 0) + coalesce(octet_length(board::text), 0) < 3000000
);
