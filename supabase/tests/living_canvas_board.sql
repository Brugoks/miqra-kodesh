-- Run against a disposable database with auth.uid(), the study_canvases base
-- migration, living_canvas_moments, and living_canvas_board installed.
-- Every fixture and grant is rolled back.
begin;
grant select, insert, update, delete on public.study_canvases to authenticated;
insert into auth.users(id) values ('10000000-0000-0000-0000-000000000001'), ('10000000-0000-0000-0000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

insert into public.study_canvases (id, title, reference, passages, journey) values (
 '20000000-0000-0000-0000-000000000001', 'A private moment', 'Personal moment', '[]',
 '{"kind":"moment","moment":"Receiving kindness","createdAt":"2026-10-15T12:00:00Z","revisitOn":null,"entries":[]}'
);

do $$
declare
  good jsonb := '{"version":1,
    "nodes":[{"id":"moment:1","contentRef":{"type":"moment"},"x":0,"y":0,"width":320,"sectionId":"section:1"},
             {"id":"entry:a","contentRef":{"type":"entry","entryId":"a"},"x":500,"y":0,"width":320,"sectionId":null}],
    "sections":[{"id":"section:1","title":"Noticing","color":"teal","x":-24,"y":-72,"width":400,"height":360,"collapsed":false}],
    "edges":[{"id":"edge:1","source":"moment:1","target":"entry:a","label":"leads to","direction":"forward"}]}';
  too_many_nodes jsonb;
  attempt jsonb;
  reason text;
begin
  -- A layout can be saved, read back, and replaced; a canvas without one is unaffected.
  update public.study_canvases set board = good where id = '20000000-0000-0000-0000-000000000001';
  if (select board->'edges'->0->>'label' from public.study_canvases) <> 'leads to' then raise exception 'Board was not saved'; end if;
  update public.study_canvases set title = 'Renamed, board untouched' where id = '20000000-0000-0000-0000-000000000001';
  if (select board is null from public.study_canvases) then raise exception 'A write that omitted board erased it'; end if;
  update public.study_canvases set board = null where id = '20000000-0000-0000-0000-000000000001';
  update public.study_canvases set board = good where id = '20000000-0000-0000-0000-000000000001';

  for reason, attempt in
    select * from (values
      ('newer version',            good || '{"version":2}'),
      ('not an object',            '[]'::jsonb),
      ('missing edges',            good - 'edges'),
      ('coordinate too large',     jsonb_set(good, '{nodes,0,x}', '100001')),
      ('card too narrow',          jsonb_set(good, '{nodes,0,width}', '199')),
      ('card too wide',            jsonb_set(good, '{nodes,0,width}', '641')),
      ('section too small',        jsonb_set(good, '{sections,0,width}', '100')),
      ('section too large',        jsonb_set(good, '{sections,0,height}', '20001')),
      ('unknown color',            jsonb_set(good, '{sections,0,color}', '"hotpink"')),
      ('collapsed not boolean',    jsonb_set(good, '{sections,0,collapsed}', '"no"')),
      ('section does not exist',   jsonb_set(good, '{nodes,1,sectionId}', '"section:ghost"')),
      ('duplicate id',             jsonb_set(good, '{nodes,1,id}', '"moment:1"')),
      ('card and section share id',jsonb_set(good, '{sections,0,id}', '"entry:a"')),
      ('same entry twice',         jsonb_set(good, '{nodes,1,contentRef}', '{"type":"moment"}')),
      ('edge to nowhere',          jsonb_set(good, '{edges,0,target}', '"entry:ghost"')),
      ('self link',                jsonb_set(good, '{edges,0,target}', '"moment:1"')),
      ('label too long',           jsonb_set(good, '{edges,0,label}', to_jsonb(repeat('x', 121)))),
      ('unknown direction',        jsonb_set(good, '{edges,0,direction}', '"both"')),
      ('duplicate pair reversed',  jsonb_set(good, '{edges}', (good->'edges') || '[{"id":"edge:2","source":"entry:a","target":"moment:1","label":"","direction":"none"}]'::jsonb))
    ) as t(reason, attempt)
  loop
    begin
      update public.study_canvases set board = attempt where id = '20000000-0000-0000-0000-000000000001';
      raise exception 'Invalid board accepted: %', reason;
    exception when check_violation then null; end;
  end loop;

  -- Caps: 101 cards, 20 sections and 200 connections fit; one more of each does not.
  select jsonb_build_object('version', 1, 'sections', '[]'::jsonb, 'edges', '[]'::jsonb,
    'nodes', (select jsonb_agg(jsonb_build_object('id', 'n' || i, 'contentRef', jsonb_build_object('type', 'entry', 'entryId', 'e' || i), 'x', i, 'y', 0, 'width', 320, 'sectionId', null)) from generate_series(1, 101) i))
    into too_many_nodes;
  update public.study_canvases set board = too_many_nodes where id = '20000000-0000-0000-0000-000000000001';
  begin
    update public.study_canvases set board = jsonb_set(too_many_nodes, '{nodes}', (too_many_nodes->'nodes') || '[{"id":"n102","contentRef":{"type":"entry","entryId":"e102"},"x":0,"y":0,"width":320,"sectionId":null}]'::jsonb)
      where id = '20000000-0000-0000-0000-000000000001';
    raise exception '102 cards unexpectedly accepted';
  exception when check_violation then null; end;

  begin
    update public.study_canvases set board = jsonb_set(good, '{sections}', (select jsonb_agg(jsonb_build_object('id', 's' || i, 'title', '', 'color', 'neutral', 'x', 0, 'y', 0, 'width', 280, 'height', 280, 'collapsed', false)) from generate_series(1, 21) i))
      where id = '20000000-0000-0000-0000-000000000001';
    raise exception '21 sections unexpectedly accepted';
  exception when check_violation then null; end;

  -- The layout cannot be added to a study that has no personal journey.
  begin
    insert into public.study_canvases (title, reference, passages, board) values ('Study', 'John 3', '[{}]', good);
    raise exception 'Board on a study unexpectedly accepted';
  exception when check_violation then null; end;

  -- A layout does not make a personal canvas shareable.
  begin
    update public.study_canvases set share_token = '30000000-0000-0000-0000-000000000001' where id = '20000000-0000-0000-0000-000000000001';
    raise exception 'Canvas with a board unexpectedly became shareable';
  exception when check_violation then null; end;
end $$;

-- Another member can neither read nor change someone's layout, and ownership cannot move.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
do $$ declare affected integer; begin
  if (select count(*) from public.study_canvases) <> 0 then raise exception 'Another member read a private board'; end if;
  update public.study_canvases set board = null; get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Another member changed a private board'; end if;
  if public.get_shared_study_canvas('30000000-0000-0000-0000-000000000001') is not null then raise exception 'Personal canvas leaked through sharing'; end if;
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
do $$ begin
  begin
    update public.study_canvases set user_id = '10000000-0000-0000-0000-000000000002';
    raise exception 'Owner unexpectedly reassigned a canvas with a board';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: board saved and preserved by omitting writes; every structural rule; caps; journey-only; never shareable; owner isolation' as result;
