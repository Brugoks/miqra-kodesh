// Starts its OWN temporary PostgreSQL cluster. Never reads .env or production URLs.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildSample } from './sample.mjs';
import { createIntegrationHandler, databaseError } from '../../supabase/functions/living-canvas-api/handler.ts';
import { SAMPLE_INPUT } from './sample.mjs';
const pgBin = process.env.CANVAS_TEST_PG_BIN || '/opt/homebrew/opt/postgresql@18/bin';
const dir = mkdtempSync(join(tmpdir(), 'miqra-canvas-db-'));
const run = (bin, args, input) => {
  const r = spawnSync(join(pgBin, bin), args, { input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${bin}: ${r.stderr || r.error || r.stdout}`);
  return r.stdout;
};
let started = false;
try {
  const sample = await buildSample();
  // Older/raw rows may carry unknown metadata. SQL publication must never
  // forward it merely because the frontend's normalizer would discard it.
  sample.board.nodes[1].privateMetadata = 'PRIVATE TEST EXTRA NODE';
  sample.board.sections[0].privateMetadata = 'PRIVATE TEST EXTRA SECTION';
  sample.board.edges[0].privateMetadata = 'PRIVATE TEST EXTRA EDGE';
  sample.journey.entries[6].biblePassage.privateMetadata = 'PRIVATE TEST EXTRA PASSAGE';
  writeFileSync(join(dir, 'sample.json'), JSON.stringify(sample));
  run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '--no-locale', '--encoding=UTF8']);
  // Unix socket ONLY: cannot accidentally connect to an existing network server.
  run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'postgres.log'), '-o', `-k ${dir} -h '' -p 55439`, '-w', 'start']); started = true;
  const sql = (s) => run('psql', ['-h', dir, '-p', '55439', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-qAt'], s);
  sql(`create role anon; create role authenticated; create role supabase_auth_admin;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    grant usage on schema public, auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated;
    create table public.organizations(id uuid primary key); create table public.profiles(id uuid primary key, full_name text);
    create function public.set_organization_id() returns trigger language plpgsql as $$begin new.organization_id := null; return new; end$$;
    alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
    insert into auth.users values ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');`);
  for (const file of ['20260914000000_study_canvases.sql', '20261015195700_living_canvas_moments.sql', '20261017120000_living_canvas_board.sql', '20261031181822_chatgpt_living_canvas_integration.sql']) sql(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  const literal = (s) => `'${String(s).replaceAll("'", "''")}'`;
  const json = (v) => `${literal(JSON.stringify(v))}::jsonb`;
  sql("insert into canvas_integration_private.oauth_clients values ('trusted-client','https://integration.test/mcp');");
  const hooked = JSON.parse(sql(`set role supabase_auth_admin; select public.living_canvas_access_token_hook(${json({ claims: { aud: 'authenticated', client_id: 'trusted-client' } })});`).trim());
  if (!hooked.claims.canvas_integration || !hooked.claims.aud.includes('https://integration.test/mcp')) throw new Error('Trusted OAuth hook did not bind the resource');
  const ordinaryClaims = { aud: 'authenticated', user_metadata: { client_id: 'trusted-client', canvas_integration: true } };
  const normal = JSON.parse(sql(`set role supabase_auth_admin; select public.living_canvas_access_token_hook(${json({ claims: ordinaryClaims })});`).trim());
  if (normal.claims.canvas_integration || normal.claims.aud !== 'authenticated') throw new Error('User metadata influenced OAuth authorization');
  const owner = "set role authenticated; set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';";
  const other = "set role authenticated; set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';";
  const first = JSON.parse(sql(`${owner} select public.commit_living_canvas_change('create_canvas', '${sample.id}', null, 'sample-create-001', repeat('a',64), ${json(sample)});`).trim());
  const stored = JSON.parse(sql(`${owner} select row_to_json(c) from public.study_canvases c where id='${sample.id}';`).trim());
  if (stored.step_count !== 0 || stored.journey.entries.length !== 14 || stored.share_token !== null) throw new Error('Stored sample shape differs');
  const replay = JSON.parse(sql(`${owner} select public.commit_living_canvas_change('create_canvas', '${sample.id}', null, 'sample-create-001', repeat('a',64), ${json(sample)});`).trim());
  if (JSON.stringify(first) !== JSON.stringify(replay)) throw new Error('Idempotency failed');
  const expectedFailure = (statement, message) => { try { sql(statement); } catch (e) { if (e.message.includes(message)) return; throw e; } throw new Error(`Expected ${message}`); };
  expectedFailure(`${other} select public.commit_living_canvas_change('update_canvas','${sample.id}','${first.updated_at}','other-update-001',repeat('b',64),'{}');`, 'canvas_not_found');
  if (sql(`${other} select count(*) from public.study_canvases;`).trim() !== '0') throw new Error('Cross-account read exposed');
  expectedFailure(`${owner} select public.commit_living_canvas_change('update_canvas','${sample.id}','2020-01-01','stale-update-001',repeat('b',64),'{}');`, 'revision_conflict');
  expectedFailure(`${owner} select public.commit_living_canvas_change('create_canvas','${sample.id}',null,'sample-create-001',repeat('b',64),'{}');`, 'idempotency_conflict');
  const update = JSON.parse(sql(`${owner} select public.commit_living_canvas_change('update_canvas','${sample.id}','${first.updated_at}','sample-update-001',repeat('b',64),'{"title":"Wisdom Without Control: Authority, Discovery, and Equipping Others"}');`).trim());
  const ids = sample.journey.entries.filter((e) => e.category !== 'reflection').map((e) => e.id);
  const selected = `array[${ids.map(literal).join(',')}]::text[]`;
  expectedFailure(`${owner} select public.commit_living_canvas_change('publish_canvas','${sample.id}','${update.updated_at}','sample-noauth-001',repeat('c',64),'{}',${selected},false);`, 'explicit_authorization_required');
  expectedFailure(`${owner} select public.commit_living_canvas_change('publish_canvas','${sample.id}','${update.updated_at}','sample-private-001',repeat('c',64),'{}',array['${sample.journey.entries[5].id}'],true);`, 'private_or_missing_card');
  const pub = JSON.parse(sql(`${owner} select public.commit_living_canvas_change('publish_canvas','${sample.id}','${update.updated_at}','sample-publish-001',repeat('c',64),'{}',${selected},true);`).trim());
  const published = JSON.parse(sql(`set role anon; select public.get_published_living_canvas('${pub.token}');`).trim());
  if (published.journey.entries.length !== 13 || JSON.stringify(published).includes('PRIVATE TEST') || JSON.stringify(published).includes(sample.journey.moment) || published.user_id || published.organization_id) throw new Error('Publication leaked private data');
  expectedFailure('set role anon; select * from public.living_canvas_publications;', 'permission denied');
  expectedFailure(`set role anon; update public.study_canvases set title='bad';`, 'permission denied');
  expectedFailure(`${owner} update public.study_canvases set share_token=gen_random_uuid() where id='${sample.id}';`, 'study_canvases_journey_private');
  if (sql(`${owner} select count(*) from generate_series(1,61) where public.consume_living_canvas_request();`).trim() !== '60') throw new Error('Rate limit failed');
  // Further private edits never change the snapshot.
  sql(`${owner} update public.study_canvases set title='Unpublished later edit' where id='${sample.id}';`);
  if (JSON.parse(sql(`set role anon; select public.get_published_living_canvas('${pub.token}');`).trim()).title !== sample.title) throw new Error('Snapshot was not frozen');
  const latest = sql(`${owner} select updated_at from public.study_canvases where id='${sample.id}';`).trim();
  sql(`${owner} select public.commit_living_canvas_change('revoke','${sample.id}','${latest}','sample-revoke-001',repeat('d',64),'{}',null,true);`);
  if (sql(`set role anon; select public.get_published_living_canvas('${pub.token}');`).trim()) throw new Error('Revocation failed');
  // Exercise the real HTTP handler against this database, without mocking SQL.
  sql('delete from canvas_integration_private.rate_windows;');
  const parse = (query) => { const value = sql(query).trim(); return value ? JSON.parse(value) : null; };
  const repository = (identity) => ({
    consume: async () => parse(`${identity} select to_json(public.consume_living_canvas_request());`),
    get: async (id) => parse(`${identity} select row_to_json(c) from public.study_canvases c where id=${literal(id)}::uuid;`),
    receipt: async (key) => parse(`${identity} select row_to_json(r) from public.living_canvas_receipts r where request_key=${literal(key)};`),
    list: async () => ({ canvases: parse(`${identity} select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title)),'[]') from public.study_canvases;`), next_offset: null }),
    commit: async (args) => {
      try {
        return parse(`${identity} select public.commit_living_canvas_change(${literal(args.p_action)},${literal(args.p_canvas_id)}::uuid,${args.p_expected_updated_at ? literal(args.p_expected_updated_at) : 'null'}::timestamptz,${literal(args.p_key)},${literal(args.p_hash)},${json(args.p_patch)},${args.p_entry_ids ? `array[${args.p_entry_ids.map(literal).join(',')}]::text[]` : 'null'},${args.p_authorized});`);
      } catch (e) {
        for (const message of ['revision_conflict','idempotency_conflict','canvas_not_found']) if (e.message.includes(message)) throw databaseError({ message });
        throw e;
      }
    },
  });
  const ownerRepo = repository(owner); const otherRepo = repository(other);
  const handler = createIntegrationHandler({ resource: 'https://integration.test/mcp', issuer: 'https://auth.test/auth/v1', appOrigin: 'https://miqra.test',
    authenticate: async (r) => r.headers.get('authorization') === 'Bearer other-test-user' ? otherRepo : ownerRepo,
    loadScripture: async (ref) => { const passage = sample.journey.entries.find((e) => e.biblePassage?.reference.replaceAll('–','-') === ref.replaceAll('–','-'))?.biblePassage; if (!passage) throw new Error('Missing fetched passage'); return passage; },
  });
  const api = async (action, args, otherUser = false, expected = 200) => {
    const response = await handler(new Request(`https://integration.test/tools/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: otherUser ? 'Bearer other-test-user' : 'Bearer owner-test-user' }, body: JSON.stringify(args) }));
    const body = await response.json(); if (response.status !== expected) throw new Error(`API ${action}: ${response.status} ${JSON.stringify(body)}`); return body.result;
  };
  const created = await api('create_canvas', SAMPLE_INPUT);
  const read = await api('get_canvas', { canvas_id: created.canvas_id });
  if (read.canvas.journey.entries.length !== 14) throw new Error('HTTP create/get did not preserve all cards');
  await api('get_canvas', { canvas_id: created.canvas_id }, true, 404);
  const changed = await api('add_insight', { canvas_id: created.canvas_id, expected_updated_at: created.updated_at, idempotency_key: 'http-insight-001', category: 'open_question', text: 'What should we revisit?' });
  await api('update_canvas', { canvas_id: created.canvas_id, expected_updated_at: created.updated_at, idempotency_key: 'http-stale-001', title: 'Stale overwrite' }, false, 409);
  const after = await api('get_canvas', { canvas_id: created.canvas_id });
  if (after.canvas.journey.entries.length !== 15 || after.updated_at !== changed.updated_at) throw new Error('HTTP update did not persist');
  const publicResult = await api('publish_canvas', { canvas_id: created.canvas_id, expected_updated_at: changed.updated_at, idempotency_key: 'http-publish-001', entry_ids: after.canvas.journey.entries.filter((e) => e.category !== 'reflection').map((e) => e.id), explicit_public_authorization: true });
  if (!publicResult.published_url.includes('/study-canvas/published/')) throw new Error('Missing public URL');
  if (!parse(`set role anon; select public.get_published_living_canvas('${publicResult.token}');`)) throw new Error('HTTP publication cannot be read anonymously');
  if ((await api('list_canvases', {}, true)).canvases.length !== 0) throw new Error('HTTP list crossed ownership');
  // Keep the sample only on disk for the isolated browser harness, never in a real database.
  const output = process.env.CANVAS_TEST_SAMPLE_OUT;
  if (output) writeFileSync(output, JSON.stringify({ private: stored, published }));
  if (sql("select count(*) from pg_class where oid in ('public.living_canvas_receipts'::regclass,'public.living_canvas_publications'::regclass,'canvas_integration_private.oauth_clients'::regclass,'canvas_integration_private.rate_windows'::regclass) and relrowsecurity;").trim() !== '4') throw new Error('Integration table lacks RLS');
  if (sql("select has_function_privilege('anon','public.consume_living_canvas_request()','execute') or has_function_privilege('anon','public.commit_living_canvas_change(text,uuid,timestamptz,text,text,jsonb,text[],boolean)','execute') or has_function_privilege('authenticated','public.living_canvas_access_token_hook(jsonb)','execute');").trim() !== 'f') throw new Error('Unexpected function grant');
  if (sql("select prosecdef from pg_proc where oid='public.commit_living_canvas_change(text,uuid,timestamptz,text,text,jsonb,text[],boolean)'::regprocedure;").trim() !== 'f') throw new Error('Canvas writes bypass RLS');
  console.log('PASS: database accepts sample; 14 cards, 8 verified KJV passages; RLS, generated columns, CAS, idempotency, rate limit, filtered anonymous snapshot, frozen publication and revocation.');
  console.log('PASS: real HTTP handler → caller-scoped PostgreSQL → response: create, retrieve, update, stale-write rejection, cross-account denial, discovery, explicit publication and anonymous readback.');
} finally {
  if (started) run('pg_ctl', ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop']);
  rmSync(dir, { recursive: true, force: true });
}
