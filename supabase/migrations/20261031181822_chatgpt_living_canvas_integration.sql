-- Additive integration storage. Existing canvas rows, generated step_count,
-- ownership policies and the signed-in legacy sharing RPC are unchanged.
create schema if not exists canvas_integration_private;
revoke all on schema canvas_integration_private from public, anon, authenticated;
create table canvas_integration_private.oauth_clients (
  client_id text primary key, resource text not null check (resource like 'https://%')
);
alter table canvas_integration_private.oauth_clients enable row level security;
grant usage on schema canvas_integration_private to supabase_auth_admin;
grant select on canvas_integration_private.oauth_clients to supabase_auth_admin;
create policy auth_hook_clients on canvas_integration_private.oauth_clients for select to supabase_auth_admin using (true);

-- Enable explicitly as the Custom Access Token hook (or compose with an
-- existing hook). The allowlist is administrator-managed, never user metadata.
create function public.living_canvas_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare claims jsonb := event->'claims'; resource text;
begin
  select c.resource into resource from canvas_integration_private.oauth_clients c
    where c.client_id = coalesce(event->>'client_id', claims->>'client_id');
  if resource is not null then
    claims := claims || jsonb_build_object('aud', jsonb_build_array('authenticated', resource), 'canvas_integration', true);
  end if;
  return jsonb_set(event, '{claims}', claims);
end $$;
revoke all on function public.living_canvas_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.living_canvas_access_token_hook(jsonb) to supabase_auth_admin;

create table canvas_integration_private.rate_windows (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null, requests integer not null
);
alter table canvas_integration_private.rate_windows enable row level security;
-- This tightly scoped definer is necessary to protect counters from callers
-- resetting them. It cannot read canvas content and takes no user_id argument.
create function public.consume_living_canvas_request()
returns boolean language plpgsql security definer set search_path = '' as $$
declare used integer;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  insert into canvas_integration_private.rate_windows as w values (auth.uid(), clock_timestamp(), 1)
  on conflict (user_id) do update set
    requests = case when w.window_start < clock_timestamp() - interval '1 minute' then 1 else w.requests + 1 end,
    window_start = case when w.window_start < clock_timestamp() - interval '1 minute' then clock_timestamp() else w.window_start end
  returning requests into used;
  return used <= 60;
end $$;
revoke all on function public.consume_living_canvas_request() from public, anon;
grant execute on function public.consume_living_canvas_request() to authenticated;

create table public.living_canvas_receipts (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  request_key text not null check (length(request_key) between 8 and 128),
  request_hash text not null check (length(request_hash) = 64),
  result jsonb not null, created_at timestamptz not null default now(),
  primary key (user_id, request_key)
);
alter table public.living_canvas_receipts enable row level security;
create policy living_canvas_receipts_owner on public.living_canvas_receipts for select to authenticated using ((select auth.uid()) = user_id);
create policy living_canvas_receipts_insert on public.living_canvas_receipts for insert to authenticated with check ((select auth.uid()) = user_id);
grant select, insert on public.living_canvas_receipts to authenticated;
revoke all on public.living_canvas_receipts from anon;

create table public.living_canvas_publications (
  canvas_id uuid primary key references public.study_canvases(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) < 2000000),
  published_at timestamptz not null default now()
);
alter table public.living_canvas_publications enable row level security;
create policy living_canvas_publications_owner on public.living_canvas_publications for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.study_canvases c where c.id = canvas_id and c.user_id = (select auth.uid())));
grant select, insert, update, delete on public.living_canvas_publications to authenticated;
revoke all on public.living_canvas_publications from anon;

-- Atomic transaction: user-scoped idempotency lock, RLS-authorized row lock,
-- revision comparison, whitelisted write, and cached acknowledgement.
create function public.commit_living_canvas_change(
  p_action text, p_canvas_id uuid, p_expected_updated_at timestamptz,
  p_key text, p_hash text, p_patch jsonb default '{}'::jsonb,
  p_entry_ids text[] default null, p_authorized boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare receipt public.living_canvas_receipts; c public.study_canvases; result jsonb;
  selected jsonb; nodes jsonb; sections jsonb; edges jsonb; snapshot jsonb; pub public.living_canvas_publications;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_action not in ('create_canvas', 'update_canvas', 'add_scripture', 'add_insight', 'connect_concepts', 'publish_canvas', 'revoke') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_key, 0));
  select * into receipt from public.living_canvas_receipts where user_id = auth.uid() and request_key = p_key;
  if found then
    if receipt.request_hash <> p_hash then raise exception 'idempotency_conflict' using errcode = 'P0001'; end if;
    return receipt.result;
  end if;
  if p_action = 'create_canvas' then
    insert into public.study_canvases (id, title, reference, passages, steps, pins, journey, board)
    values (p_canvas_id, p_patch->>'title', p_patch->>'reference', p_patch->'passages', p_patch->'steps', p_patch->'pins', p_patch->'journey', p_patch->'board') returning * into c;
  else
    select * into c from public.study_canvases where id = p_canvas_id for update;
    if not found then raise exception 'canvas_not_found' using errcode = 'P0002'; end if;
    if p_expected_updated_at is null or c.updated_at <> p_expected_updated_at then raise exception 'revision_conflict' using errcode = 'P0001'; end if;
    if p_action not in ('publish_canvas', 'revoke') then
      update public.study_canvases set
        title = coalesce(p_patch->>'title', title), reference = coalesce(p_patch->>'reference', reference),
        passages = coalesce(p_patch->'passages', passages), steps = coalesce(p_patch->'steps', steps),
        pins = coalesce(p_patch->'pins', pins), journey = coalesce(p_patch->'journey', journey), board = coalesce(p_patch->'board', board)
      where id = p_canvas_id returning * into c;
    end if;
  end if;
  if p_action in ('publish_canvas', 'revoke') then
    if p_authorized is distinct from true then raise exception 'explicit_authorization_required' using errcode = '42501'; end if;
    if p_action = 'revoke' then
      delete from public.living_canvas_publications where canvas_id = c.id;
      result := jsonb_build_object('canvas_id', c.id, 'updated_at', c.updated_at, 'revoked', true);
    else
      if c.journey is null or p_entry_ids is null or cardinality(p_entry_ids) < 1 or cardinality(p_entry_ids) > 100
        or cardinality(p_entry_ids) <> (select count(distinct x) from unnest(p_entry_ids) x)
      then raise exception 'invalid_publication_selection' using errcode = '22023'; end if;
      -- Build the entire public projection here, not from a caller's snapshot.
      select jsonb_agg(jsonb_build_object('id', e->>'id', 'kind', e->>'kind', 'category', e->>'category',
        'text', e->>'text', 'createdAt', now()) ||
        case when e ? 'reference' then jsonb_build_object('reference', e->>'reference') else '{}'::jsonb end ||
        case when e ? 'biblePassage' then jsonb_build_object('biblePassage', jsonb_build_object(
          'reference', e#>>'{biblePassage,reference}', 'translation', e#>>'{biblePassage,translation}',
          'verses', (select jsonb_agg(jsonb_build_object('reference', v->>'reference', 'text', v->>'text') order by verse_ord)
            from jsonb_array_elements(e#>'{biblePassage,verses}') with ordinality vs(v,verse_ord)))) else '{}'::jsonb end ||
        case when e->>'provenance' = 'ai' then '{"provenance":"ai"}'::jsonb else '{}'::jsonb end order by ord)
      into selected from jsonb_array_elements(c.journey->'entries') with ordinality t(e, ord)
      where e->>'id' = any(p_entry_ids) and e->>'kind' <> 'prayer'
        and e->>'category' in ('scripture','historical_context','observation','interpretation','application','counterargument','open_question');
      if coalesce(jsonb_array_length(selected), 0) <> cardinality(p_entry_ids) then
        raise exception 'private_or_missing_card' using errcode = '22023';
      end if;
      select coalesce(jsonb_agg(jsonb_build_object('id',n->>'id','contentRef',jsonb_build_object('type','entry','entryId',n#>>'{contentRef,entryId}'),
        'x',n->'x','y',n->'y','width',n->'width','sectionId',n->'sectionId')), '[]'::jsonb) into nodes from jsonb_array_elements(c.board->'nodes') n
        where n#>>'{contentRef,type}' = 'entry' and n#>>'{contentRef,entryId}' = any(p_entry_ids);
      select coalesce(jsonb_agg(jsonb_build_object('id',s->>'id','title','Theme ' || ord,'color',s->>'color',
        'x',s->'x','y',s->'y','width',s->'width','height',s->'height','collapsed',s->'collapsed')), '[]'::jsonb) into sections
        from jsonb_array_elements(c.board->'sections') with ordinality t(s,ord)
        where exists (select 1 from jsonb_array_elements(nodes) n where n->>'sectionId' = s->>'id');
      select coalesce(jsonb_agg(jsonb_build_object('id',e->>'id','source',e->>'source','target',e->>'target','label',e->>'label','direction',e->>'direction')), '[]'::jsonb) into edges from jsonb_array_elements(c.board->'edges') e
        where exists (select 1 from jsonb_array_elements(nodes) n where n->>'id' = e->>'source')
          and exists (select 1 from jsonb_array_elements(nodes) n where n->>'id' = e->>'target');
      snapshot := jsonb_build_object('id', c.id, 'title', c.title, 'passages', '[]'::jsonb, 'steps', '[]'::jsonb, 'pins', '[]'::jsonb,
        'journey', jsonb_build_object('kind','moment','moment',c.title,'createdAt',now(),'revisitOn',null,'entries',selected),
        'board', jsonb_build_object('version',1,'nodes',nodes,'sections',sections,'edges',edges));
      insert into public.living_canvas_publications (canvas_id, snapshot) values (c.id, snapshot)
      on conflict (canvas_id) do update set snapshot = excluded.snapshot, published_at = now()
      returning * into pub;
      result := jsonb_build_object('canvas_id', c.id, 'updated_at', c.updated_at, 'token', pub.token, 'published_at', pub.published_at);
    end if;
  else
    result := jsonb_build_object('canvas_id', c.id, 'updated_at', c.updated_at);
  end if;
  insert into public.living_canvas_receipts (request_key, request_hash, result) values (p_key, p_hash, result);
  return result;
end $$;
revoke all on function public.commit_living_canvas_change(text,uuid,timestamptz,text,text,jsonb,text[],boolean) from public, anon;
grant execute on function public.commit_living_canvas_change(text,uuid,timestamptz,text,text,jsonb,text[],boolean) to authenticated;

-- The only anonymous reader: an unguessable token, a deliberate frozen
-- projection, no table access, owner profile, organization, or private journey.
create function public.get_published_living_canvas(p_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select snapshot from public.living_canvas_publications where token = p_token and p_token is not null;
$$;
revoke all on function public.get_published_living_canvas(uuid) from public;
grant execute on function public.get_published_living_canvas(uuid) to anon, authenticated;
