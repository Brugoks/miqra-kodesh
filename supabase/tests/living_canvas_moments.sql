-- Run against a disposable database with auth.uid(), the study_canvases base
-- migration, and the living_canvas_moments migration installed.
-- Every fixture and grant is rolled back.
begin;
grant select, insert, update, delete on public.study_canvases to authenticated;
insert into auth.users(id) values ('10000000-0000-0000-0000-000000000001'), ('10000000-0000-0000-0000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
insert into public.study_canvases (id, title, reference, passages, journey) values (
 '20000000-0000-0000-0000-000000000001', 'A private moment', 'Personal moment', '[]',
 '{"kind":"moment","moment":"Receiving kindness","createdAt":"2026-10-15T12:00:00Z","revisitOn":"2026-10-22","entries":[]}'
);
do $$ begin
 if (select count(*) from public.study_canvases) <> 1 then raise exception 'Owner cannot read own moment'; end if;
 begin
  update public.study_canvases set share_token = '30000000-0000-0000-0000-000000000001';
  raise exception 'Personal moment unexpectedly became shareable';
 exception when check_violation then null; end;
 begin
  update public.study_canvases set user_id = '10000000-0000-0000-0000-000000000002';
  raise exception 'Owner unexpectedly reassigned a moment';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.study_canvases(title,reference,passages,journey) values ('Broken','Personal moment','[]','{"kind":"moment"}');
  raise exception 'Malformed journey unexpectedly accepted';
 exception when check_violation then null; end;
 begin
  insert into public.study_canvases(title,reference,passages) values ('Empty study','No passage','[]');
  raise exception 'Study without passages unexpectedly accepted';
 exception when check_violation then null; end;
end $$;
-- Existing shared studies continue to work, with notes stripped by the RPC.
insert into public.study_canvases (id,title,reference,passages,steps,share_token) values (
 '20000000-0000-0000-0000-000000000002','Existing study','John 3','[{}]',
 '[{"id":"s1","note":"Private note","cardNotes":{"card":"Private card note"}}]',
 '30000000-0000-0000-0000-000000000002'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
do $$ declare shared jsonb; affected integer; begin
 if (select count(*) from public.study_canvases) <> 0 then raise exception 'Another member read private rows'; end if;
 update public.study_canvases set title='Changed by another member'; get diagnostics affected = row_count;
 if affected <> 0 then raise exception 'Another member updated a private row'; end if;
 if public.get_shared_study_canvas('30000000-0000-0000-0000-000000000001') is not null then raise exception 'Personal moment leaked through sharing'; end if;
 shared := public.get_shared_study_canvas('30000000-0000-0000-0000-000000000002');
 if shared->>'title' <> 'Existing study' then raise exception 'Existing shared study is broken'; end if;
 if (shared->'steps'->0) ? 'note' or (shared->'steps'->0) ? 'cardNotes' or shared ? 'journey' then raise exception 'Private content leaked through shared study'; end if;
end $$;
reset role;
rollback;
select 'PASS: capture without passages; owner access; no reassignment; cross-user isolation; private journeys; existing shared study redaction' as result;
