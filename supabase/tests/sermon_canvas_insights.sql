-- Run against a disposable database that has a public.sermon_talks table and
-- 20261018190000_sermon_canvas_insights.sql installed (the rest of the table is
-- not exercised). Everything is rolled back.
begin;

do $$
declare
  good jsonb := '{"version":1,"generatedAt":"2026-10-18T20:00:00Z","model":"m","basedOn":"berean-v4","insights":[
    {"id":"i1","anchor":"Luke 4:18-19","refs":["Luke 4:14-30"],"claim":"Jesus'' assignment was settled first.",
     "quote":{"text":"Your assignment is greater than the applause","at":"10:05"},"question":"What has God already given you to do?","cards":["c1"]},
    {"id":"i2","anchor":"Luke 4:30","refs":[],"claim":"He went his way.","quote":null,"question":"Where is your next step?","cards":["c2"]}]}';
  attempt jsonb;
  insight jsonb;
  talk uuid := '30000000-0000-0000-0000-000000000001';
begin
  insert into public.sermon_talks (id, canvas_insights) values (talk, null);
  -- A talk with no pack is fine, and so is a valid one; both are readable back.
  update public.sermon_talks set canvas_insights = good where id = talk;
  if (select canvas_insights->'insights'->0->>'anchor' from public.sermon_talks where id = talk) <> 'Luke 4:18-19' then
    raise exception 'A valid pack was not saved';
  end if;
  update public.sermon_talks set canvas_insights = '{"version":1,"insights":[]}' where id = talk; -- empty is allowed
  update public.sermon_talks set canvas_insights = null where id = talk;

  insight := good->'insights'->0;
  for attempt in
    select * from (values
      ('[]'::jsonb),                                                                  -- not an object
      ('{"insights":[]}'),                                                            -- no version
      ('{"version":2,"insights":[]}'),                                                -- wrong version
      ('{"version":1}'),                                                              -- no insights
      ('{"version":1,"insights":{}}'),                                                -- insights not an array
      (jsonb_build_object('version', 1, 'insights', (select jsonb_agg(insight) from generate_series(1, 7)))), -- too many
      (jsonb_build_object('version', 1, 'insights', jsonb_build_array(insight - 'id'))),
      (jsonb_build_object('version', 1, 'insights', jsonb_build_array(insight - 'anchor'))),
      (jsonb_build_object('version', 1, 'insights', jsonb_build_array(insight - 'claim'))),
      (jsonb_build_object('version', 1, 'insights', jsonb_build_array(insight - 'question'))),
      (jsonb_build_object('version', 1, 'insights', jsonb_build_array(insight - 'refs'))),
      (jsonb_build_object('version', 1, 'insights', jsonb_build_array(insight - 'quote'))),
      (jsonb_build_object('version', 1, 'insights', jsonb_build_array(insight || '{"id":""}'))),
      (jsonb_build_object('version', 1, 'insights', jsonb_build_array(insight || jsonb_build_object('claim', repeat('x', 281))))),
      (jsonb_build_object('version', 1, 'insights', jsonb_build_array(insight || jsonb_build_object('question', repeat('x', 241))))),
      (jsonb_build_object('version', 1, 'insights', jsonb_build_array(insight || '{"refs":["a","b","c","d","e"]}'))),
      (jsonb_build_object('version', 1, 'insights', jsonb_build_array(insight || '{"refs":[42]}'))),
      (jsonb_build_object('version', 1, 'insights', jsonb_build_array(insight || jsonb_build_object('refs', jsonb_build_array(repeat('x', 101)))))),
      (jsonb_build_object('version', 1, 'insights', jsonb_build_array(insight || jsonb_build_object('quote', jsonb_build_object('text', repeat('x', 401), 'at', null))))),
      (jsonb_build_object('version', 1, 'insights', jsonb_build_array(insight || '{"quote":{"at":"1:00"}}'))),
      (jsonb_build_object('version', 1, 'insights', jsonb_build_array('"not an object"'::jsonb))),
      (jsonb_build_object('version', 1, 'insights', jsonb_build_array(insight), 'padding', repeat('x', 31000)))
    ) as t(v)
  loop
    begin
      update public.sermon_talks set canvas_insights = attempt where id = talk;
      raise exception 'Accepted an invalid pack: %', left(attempt::text, 120);
    exception when check_violation then null;
    end;
  end loop;
end $$;

rollback;
