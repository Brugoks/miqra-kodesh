-- Q&R sessions: leader-created, topic-scoped question rounds ("CV Students —
-- Revelation") that persist after the meeting so unanswered questions can be
-- carried forward. Adds guest submission (QR code, no account) and guest
-- upvoting, plus a leader triage workflow.
--
-- Guests never touch Postgres directly: the `qa-guest` edge function holds the
-- service-role key and is the only writer for guest traffic. Nothing here is
-- granted to the `anon` role.

-- ── Join codes ─────────────────────────────────────────────────────────────
-- 8 chars from a 31-char alphabet (~39 bits). Ambiguous glyphs (0/O, 1/I/L)
-- are excluded because these get typed by hand at the shared-laptop kiosk.
create or replace function public.qa_new_join_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  candidate text;
  raw text;
  i integer;
begin
  loop
    candidate := '';
    raw := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    for i in 0..7 loop
      candidate := candidate || substr(
        alphabet,
        (get_byte(decode(substr(raw, i * 2 + 1, 2), 'hex'), 0) % length(alphabet)) + 1,
        1
      );
    end loop;
    exit when not exists (select 1 from public.qa_sessions where join_code = candidate);
  end loop;
  return candidate;
end;
$$;

-- ── Sessions ───────────────────────────────────────────────────────────────
create table if not exists public.qa_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null,
  topic text,
  description text,
  join_code text not null unique default public.qa_new_join_code(),
  status text not null default 'open' check (status in ('open', 'closed', 'archived')),
  guest_submissions_enabled boolean not null default true,
  guest_voting_enabled boolean not null default true,
  require_approval boolean not null default false,
  meets_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qa_sessions_org_idx on public.qa_sessions(organization_id, created_at desc);
create index if not exists qa_sessions_join_code_idx on public.qa_sessions(join_code);

alter table public.qa_sessions enable row level security;

drop policy if exists "qa_sessions_select" on public.qa_sessions;
create policy "qa_sessions_select" on public.qa_sessions
  for select to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

drop policy if exists "qa_sessions_insert" on public.qa_sessions;
create policy "qa_sessions_insert" on public.qa_sessions
  for insert to authenticated
  with check (
    (public.is_leader() or public.is_developer())
    and (public.is_developer() or organization_id = public.get_my_organization_id())
  );

drop policy if exists "qa_sessions_update" on public.qa_sessions;
create policy "qa_sessions_update" on public.qa_sessions
  for update to authenticated
  using (
    (public.is_leader() or public.is_developer())
    and (public.is_developer() or organization_id = public.get_my_organization_id())
  )
  with check (
    (public.is_leader() or public.is_developer())
    and (public.is_developer() or organization_id = public.get_my_organization_id())
  );

drop policy if exists "qa_sessions_delete" on public.qa_sessions;
create policy "qa_sessions_delete" on public.qa_sessions
  for delete to authenticated
  using (
    (public.is_admin() or public.is_developer())
    and (public.is_developer() or organization_id = public.get_my_organization_id())
  );

-- ── Question columns ───────────────────────────────────────────────────────
-- author_id loses NOT NULL so guest rows can exist without a profile. The
-- insert policy still requires `author_id = auth.uid()`, which a NULL fails,
-- so authenticated clients cannot forge a guest row.
alter table public.qa_questions
  add column if not exists session_id uuid references public.qa_sessions(id) on delete set null,
  add column if not exists carried_from_session_id uuid references public.qa_sessions(id) on delete set null,
  add column if not exists guest_name text,
  add column if not exists guest_token_hash text,
  add column if not exists source text not null default 'member',
  add column if not exists status text not null default 'published',
  add column if not exists bucket text;

alter table public.qa_questions alter column author_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'qa_questions_source_check'
       and conrelid = 'public.qa_questions'::regclass
  ) then
    alter table public.qa_questions
      add constraint qa_questions_source_check check (source in ('member', 'guest'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'qa_questions_status_check'
       and conrelid = 'public.qa_questions'::regclass
  ) then
    alter table public.qa_questions
      add constraint qa_questions_status_check check (status in ('pending', 'published', 'hidden'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'qa_questions_bucket_check'
       and conrelid = 'public.qa_questions'::regclass
  ) then
    alter table public.qa_questions
      add constraint qa_questions_bucket_check check (bucket in ('answered', 'parked', 'carried'));
  end if;

  -- A member row must have an author; a guest row must not.
  if not exists (
    select 1 from pg_constraint
     where conname = 'qa_questions_author_source_check'
       and conrelid = 'public.qa_questions'::regclass
  ) then
    alter table public.qa_questions
      add constraint qa_questions_author_source_check check (
        (source = 'member' and author_id is not null)
        or (source = 'guest' and author_id is null)
      );
  end if;
end;
$$;

create index if not exists qa_questions_session_idx on public.qa_questions(session_id, created_at desc);
create index if not exists qa_questions_guest_token_idx on public.qa_questions(guest_token_hash, created_at desc)
  where guest_token_hash is not null;

-- ── Guest votes ────────────────────────────────────────────────────────────
-- Kept separate from qa_question_votes, whose user_id is a NOT NULL FK to
-- profiles. Deduped per device token hash.
create table if not exists public.qa_guest_votes (
  question_id uuid not null references public.qa_questions(id) on delete cascade,
  guest_token_hash text not null,
  created_at timestamptz not null default now(),
  primary key (question_id, guest_token_hash)
);

alter table public.qa_guest_votes enable row level security;

drop policy if exists "qa_guest_votes_select" on public.qa_guest_votes;
create policy "qa_guest_votes_select" on public.qa_guest_votes
  for select to authenticated
  using (
    public.is_developer()
    or question_id in (
      select id from public.qa_questions where organization_id = public.get_my_organization_id()
    )
  );

-- ── Session summary for leaders ────────────────────────────────────────────
create or replace function public.qa_sessions_list(org_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not public.is_developer() and not exists (
    select 1
      from public.profile_organizations po
     where po.profile_id = caller_id
       and po.organization_id = qa_sessions_list.org_id
  ) then
    raise exception 'You can only view your own organization.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'topic', s.topic,
        'description', s.description,
        'join_code', s.join_code,
        'status', s.status,
        'guest_submissions_enabled', s.guest_submissions_enabled,
        'guest_voting_enabled', s.guest_voting_enabled,
        'require_approval', s.require_approval,
        'meets_at', s.meets_at,
        'closed_at', s.closed_at,
        'created_at', s.created_at,
        'question_count', (
          select count(*) from public.qa_questions q
           where q.session_id = s.id and q.status = 'published'
        ),
        'pending_count', (
          select count(*) from public.qa_questions q
           where q.session_id = s.id and q.status = 'pending'
        ),
        'unanswered_count', (
          select count(*) from public.qa_questions q
           where q.session_id = s.id
             and q.status = 'published'
             and q.bucket is null
             and not exists (select 1 from public.qa_answers a where a.question_id = q.id)
        )
      )
      order by s.created_at desc
    )
    from public.qa_sessions s
   where s.organization_id = qa_sessions_list.org_id
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.qa_sessions_list(uuid) to authenticated;

-- ── Session board (member/leader view + present mode) ──────────────────────
-- Returns the whole session rather than a page: a Q&R night is bounded, and
-- present mode must never show a truncated list on the projector.
create or replace function public.qa_session_board(target_session_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  target_org_id uuid;
  caller_is_leader boolean;
begin
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select s.organization_id into target_org_id
    from public.qa_sessions s
   where s.id = target_session_id;

  if target_org_id is null then
    raise exception 'Session not found.' using errcode = 'P0002';
  end if;

  if not public.is_developer() and not exists (
    select 1
      from public.profile_organizations po
     where po.profile_id = caller_id
       and po.organization_id = target_org_id
  ) then
    raise exception 'You can only view your own organization.' using errcode = '42501';
  end if;

  caller_is_leader := public.is_leader() or public.is_developer();

  return (
    with visible_questions as (
      select q.*
        from public.qa_questions q
       where q.session_id = target_session_id
         and (
           caller_is_leader
           or q.status = 'published'
         )
       order by q.created_at desc
       limit 500
    ),
    visible_answers as (
      select a.*
        from public.qa_answers a
       where a.question_id in (select id from visible_questions)
    )
    select jsonb_build_object(
      'session', (
        select jsonb_build_object(
          'id', s.id,
          'title', s.title,
          'topic', s.topic,
          'description', s.description,
          'join_code', s.join_code,
          'status', s.status,
          'guest_submissions_enabled', s.guest_submissions_enabled,
          'guest_voting_enabled', s.guest_voting_enabled,
          'require_approval', s.require_approval,
          'meets_at', s.meets_at,
          'created_at', s.created_at
        )
        from public.qa_sessions s where s.id = target_session_id
      ),
      'questions', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'organization_id', q.organization_id,
            'session_id', q.session_id,
            'carried_from_session_id', q.carried_from_session_id,
            'author_id', case
              when q.is_anonymous and (q.author_id is distinct from caller_id) and not public.is_admin() then null
              else q.author_id
            end,
            'author_name', case
              when q.is_anonymous and (q.author_id is distinct from caller_id) and not public.is_admin() then null
              else coalesce(q.author_name, q.guest_name)
            end,
            'is_mine', coalesce(q.author_id = caller_id, false),
            'is_anonymous', q.is_anonymous,
            'source', q.source,
            'status', q.status,
            'bucket', q.bucket,
            'title', q.title,
            'body', q.body,
            'tag', q.tag,
            'image_path', q.image_path,
            'resolved_at', q.resolved_at,
            'created_at', q.created_at,
            'updated_at', q.updated_at,
            'guest_vote_count', (
              select count(*) from public.qa_guest_votes gv where gv.question_id = q.id
            ),
            'answer_count', (
              select count(*) from public.qa_answers a where a.question_id = q.id
            )
          )
          order by q.created_at desc
        )
        from visible_questions q
      ), '[]'::jsonb),
      'answers', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'question_id', a.question_id,
            'author_id', case
              when a.is_anonymous and a.author_id <> caller_id and not public.is_admin() then null
              else a.author_id
            end,
            'author_name', case
              when a.is_anonymous and a.author_id <> caller_id and not public.is_admin() then null
              else a.author_name
            end,
            'is_mine', a.author_id = caller_id,
            'is_anonymous', a.is_anonymous,
            'author_role', a.author_role,
            'is_accepted', a.is_accepted,
            'body', a.body,
            'created_at', a.created_at,
            'updated_at', a.updated_at
          )
          order by a.created_at asc
        )
        from visible_answers a
      ), '[]'::jsonb),
      'question_votes', coalesce((
        select jsonb_agg(jsonb_build_object('question_id', v.question_id, 'user_id', v.user_id))
        from public.qa_question_votes v
       where v.question_id in (select id from visible_questions)
      ), '[]'::jsonb),
      'answer_votes', coalesce((
        select jsonb_agg(jsonb_build_object('answer_id', v.answer_id, 'user_id', v.user_id))
        from public.qa_answer_votes v
       where v.answer_id in (select id from visible_answers)
      ), '[]'::jsonb)
    )
  );
end;
$$;

grant execute on function public.qa_session_board(uuid) to authenticated;

-- ── Leader moderation / triage ─────────────────────────────────────────────
-- Routed through a definer RPC so the qa_questions UPDATE policy can stay
-- author-or-admin: leaders get moderation rights without edit rights.
create or replace function public.qa_moderate_question(
  target_question_id uuid,
  next_status text default null,
  next_bucket text default null,
  clear_bucket boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  target_org_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not (public.is_leader() or public.is_developer()) then
    raise exception 'Only leaders can moderate questions.' using errcode = '42501';
  end if;

  select q.organization_id into target_org_id
    from public.qa_questions q
   where q.id = target_question_id;

  if target_org_id is null then
    raise exception 'Question not found.' using errcode = 'P0002';
  end if;

  if not public.is_developer() and target_org_id <> public.get_my_organization_id() then
    raise exception 'You can only moderate your own organization.' using errcode = '42501';
  end if;

  if next_status is not null and next_status not in ('pending', 'published', 'hidden') then
    raise exception 'Invalid status.' using errcode = '22023';
  end if;

  if next_bucket is not null and next_bucket not in ('answered', 'parked', 'carried') then
    raise exception 'Invalid bucket.' using errcode = '22023';
  end if;

  update public.qa_questions
     set status = coalesce(next_status, status),
         bucket = case when clear_bucket then null else coalesce(next_bucket, bucket) end,
         updated_at = now()
   where id = target_question_id;

  return (
    select jsonb_build_object('id', q.id, 'status', q.status, 'bucket', q.bucket)
      from public.qa_questions q where q.id = target_question_id
  );
end;
$$;

grant execute on function public.qa_moderate_question(uuid, text, text, boolean) to authenticated;

-- Move questions into another session ("pull them into another thing").
create or replace function public.qa_carry_questions(
  question_ids uuid[],
  target_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  target_org_id uuid;
  moved integer;
begin
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not (public.is_leader() or public.is_developer()) then
    raise exception 'Only leaders can carry questions forward.' using errcode = '42501';
  end if;

  select s.organization_id into target_org_id
    from public.qa_sessions s
   where s.id = target_session_id;

  if target_org_id is null then
    raise exception 'Target session not found.' using errcode = 'P0002';
  end if;

  if not public.is_developer() and target_org_id <> public.get_my_organization_id() then
    raise exception 'You can only carry questions within your own organization.' using errcode = '42501';
  end if;

  with moved_rows as (
    update public.qa_questions q
       set carried_from_session_id = q.session_id,
           session_id = target_session_id,
           bucket = null,
           updated_at = now()
     where q.id = any(question_ids)
       and q.organization_id = target_org_id
       and q.session_id is distinct from target_session_id
    returning 1
  )
  select count(*) into moved from moved_rows;

  return jsonb_build_object('moved', moved, 'session_id', target_session_id);
end;
$$;

grant execute on function public.qa_carry_questions(uuid[], uuid) to authenticated;

-- ── qa_board: carry the new fields, hide unpublished from non-leaders ───────
create or replace function public.qa_board(
  org_id uuid,
  page_limit integer default 50,
  page_offset integer default 0
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  safe_limit integer := least(greatest(coalesce(page_limit, 50), 1), 100);
  safe_offset integer := greatest(coalesce(page_offset, 0), 0);
  caller_is_leader boolean;
begin
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not public.is_developer() and not exists (
    select 1
      from public.profile_organizations po
     where po.profile_id = caller_id
       and po.organization_id = qa_board.org_id
  ) then
    raise exception 'You can only view your own organization.' using errcode = '42501';
  end if;

  caller_is_leader := public.is_leader() or public.is_developer();

  return (
    with paged_questions as (
      select q.*
        from public.qa_questions q
       where q.organization_id = qa_board.org_id
         and (caller_is_leader or q.status = 'published')
       order by q.created_at desc
       limit safe_limit + 1
      offset safe_offset
    ),
    visible_questions as (
      select *
        from paged_questions
       order by created_at desc
       limit safe_limit
    ),
    visible_answers as (
      select a.*
        from public.qa_answers a
       where a.question_id in (select q.id from visible_questions q)
       order by a.created_at asc
    )
    select jsonb_build_object(
      'questions', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'organization_id', q.organization_id,
            'session_id', q.session_id,
            'session_title', (
              select s.title from public.qa_sessions s where s.id = q.session_id
            ),
            'carried_from_session_id', q.carried_from_session_id,
            'author_id', case
              when q.is_anonymous and (q.author_id is distinct from caller_id) and not public.is_admin() then null
              else q.author_id
            end,
            'author_name', case
              when q.is_anonymous and (q.author_id is distinct from caller_id) and not public.is_admin() then null
              else coalesce(q.author_name, q.guest_name)
            end,
            'is_mine', coalesce(q.author_id = caller_id, false),
            'is_anonymous', q.is_anonymous,
            'source', q.source,
            'status', q.status,
            'bucket', q.bucket,
            'title', q.title,
            'body', q.body,
            'tag', q.tag,
            'image_path', q.image_path,
            'resolved_at', q.resolved_at,
            'created_at', q.created_at,
            'updated_at', q.updated_at,
            'guest_vote_count', (
              select count(*) from public.qa_guest_votes gv where gv.question_id = q.id
            )
          )
          order by q.created_at desc
        )
        from visible_questions q
      ), '[]'::jsonb),
      'answers', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'question_id', a.question_id,
            'organization_id', a.organization_id,
            'author_id', case
              when a.is_anonymous and a.author_id <> caller_id and not public.is_admin() then null
              else a.author_id
            end,
            'author_name', case
              when a.is_anonymous and a.author_id <> caller_id and not public.is_admin() then null
              else a.author_name
            end,
            'is_mine', a.author_id = caller_id,
            'is_anonymous', a.is_anonymous,
            'author_role', a.author_role,
            'is_accepted', a.is_accepted,
            'body', a.body,
            'created_at', a.created_at,
            'updated_at', a.updated_at
          )
          order by a.created_at asc
        )
        from visible_answers a
      ), '[]'::jsonb),
      'question_votes', coalesce((
        select jsonb_agg(
          jsonb_build_object('question_id', v.question_id, 'user_id', v.user_id)
        )
        from public.qa_question_votes v
        where v.question_id in (select q.id from visible_questions q)
      ), '[]'::jsonb),
      'answer_votes', coalesce((
        select jsonb_agg(
          jsonb_build_object('answer_id', v.answer_id, 'user_id', v.user_id)
        )
        from public.qa_answer_votes v
        where v.answer_id in (select a.id from visible_answers a)
      ), '[]'::jsonb),
      'has_more', (select count(*) > safe_limit from paged_questions)
    )
  );
end;
$$;

grant execute on function public.qa_board(uuid, integer, integer) to authenticated;

-- ── Guest surface (service-role only; never granted to anon) ───────────────
-- Resolves a join code to the public shape of a session plus its published
-- question list. Titles only — no answers, no author identities.
create or replace function public.qa_guest_session(code text, voter_hash text default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  s public.qa_sessions%rowtype;
begin
  select * into s from public.qa_sessions where join_code = upper(trim(code));

  if s.id is null then
    return jsonb_build_object('found', false);
  end if;

  return jsonb_build_object(
    'found', true,
    'session', jsonb_build_object(
      'id', s.id,
      'title', s.title,
      'topic', s.topic,
      'description', s.description,
      'status', s.status,
      'accepting', s.status = 'open' and s.guest_submissions_enabled,
      'voting_enabled', s.guest_voting_enabled,
      'require_approval', s.require_approval
    ),
    'organization', (
      select jsonb_build_object(
        'name', o.name,
        'logo_url', o.logo_url,
        'primary_color', o.primary_color,
        'secondary_color', o.secondary_color
      )
        from public.organizations o where o.id = s.organization_id
    ),
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'title', q.title,
          'body', q.body,
          'author_label', case
            when q.is_anonymous then null
            else coalesce(q.guest_name, q.author_name)
          end,
          'created_at', q.created_at,
          'answered', exists (select 1 from public.qa_answers a where a.question_id = q.id),
          'vote_count', (
            (select count(*) from public.qa_question_votes v where v.question_id = q.id)
            + (select count(*) from public.qa_guest_votes gv where gv.question_id = q.id)
          ),
          'voted', voter_hash is not null and exists (
            select 1 from public.qa_guest_votes gv
             where gv.question_id = q.id and gv.guest_token_hash = voter_hash
          )
        )
        order by q.created_at desc
      )
      from public.qa_questions q
     where q.session_id = s.id
       and q.status = 'published'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.qa_guest_session(text, text) from public, anon, authenticated;

-- Guest insert. Rate limiting and length caps live here so the edge function
-- cannot be tricked into skipping them.
create or replace function public.qa_guest_submit(
  code text,
  q_title text,
  q_body text,
  q_name text,
  voter_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.qa_sessions%rowtype;
  clean_title text := nullif(trim(q_title), '');
  clean_body text := nullif(trim(q_body), '');
  clean_name text := nullif(trim(q_name), '');
  recent_count integer;
  new_status text;
  new_id uuid;
begin
  select * into s from public.qa_sessions where join_code = upper(trim(code));

  if s.id is null then
    raise exception 'Session not found.' using errcode = 'P0002';
  end if;

  if s.status <> 'open' or not s.guest_submissions_enabled then
    raise exception 'This session is not accepting questions right now.' using errcode = '42501';
  end if;

  if clean_title is null then
    raise exception 'Please enter a question.' using errcode = '22023';
  end if;

  if length(clean_title) > 300 then
    raise exception 'Question is too long.' using errcode = '22023';
  end if;

  if clean_body is not null and length(clean_body) > 2000 then
    raise exception 'Details are too long.' using errcode = '22023';
  end if;

  if clean_name is not null and length(clean_name) > 60 then
    clean_name := left(clean_name, 60);
  end if;

  if voter_hash is null then
    raise exception 'Missing device token.' using errcode = '22023';
  end if;

  select count(*) into recent_count
    from public.qa_questions q
   where q.guest_token_hash = voter_hash
     and q.created_at > now() - interval '1 minute';

  if recent_count >= 3 then
    raise exception 'You are sending questions too quickly. Give it a minute.' using errcode = '53400';
  end if;

  select count(*) into recent_count
    from public.qa_questions q
   where q.guest_token_hash = voter_hash
     and q.created_at > now() - interval '1 hour';

  if recent_count >= 25 then
    raise exception 'You have reached the limit for this hour.' using errcode = '53400';
  end if;

  -- Exact-duplicate guard for the shared kiosk, where a double-tap on a slow
  -- connection is the common failure.
  if exists (
    select 1 from public.qa_questions q
     where q.session_id = s.id
       and q.guest_token_hash = voter_hash
       and lower(q.title) = lower(clean_title)
       and q.created_at > now() - interval '5 minutes'
  ) then
    raise exception 'That question was already sent.' using errcode = '23505';
  end if;

  new_status := case when s.require_approval then 'pending' else 'published' end;

  insert into public.qa_questions (
    organization_id, session_id, author_id, author_name, guest_name,
    guest_token_hash, is_anonymous, source, status, title, body, tag
  ) values (
    s.organization_id, s.id, null, null, clean_name,
    voter_hash, clean_name is null, 'guest', new_status, clean_title, clean_body, 'other'
  )
  returning id into new_id;

  return jsonb_build_object('id', new_id, 'status', new_status);
end;
$$;

revoke all on function public.qa_guest_submit(text, text, text, text, text) from public, anon, authenticated;

create or replace function public.qa_guest_vote(
  code text,
  target_question_id uuid,
  voter_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.qa_sessions%rowtype;
  already boolean;
  next_count integer;
begin
  select * into s from public.qa_sessions where join_code = upper(trim(code));

  if s.id is null then
    raise exception 'Session not found.' using errcode = 'P0002';
  end if;

  if not s.guest_voting_enabled or s.status <> 'open' then
    raise exception 'Voting is closed for this session.' using errcode = '42501';
  end if;

  if voter_hash is null then
    raise exception 'Missing device token.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.qa_questions q
     where q.id = target_question_id
       and q.session_id = s.id
       and q.status = 'published'
  ) then
    raise exception 'Question not found in this session.' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.qa_guest_votes
     where question_id = target_question_id and guest_token_hash = voter_hash
  ) into already;

  if already then
    delete from public.qa_guest_votes
     where question_id = target_question_id and guest_token_hash = voter_hash;
  else
    insert into public.qa_guest_votes (question_id, guest_token_hash)
    values (target_question_id, voter_hash)
    on conflict do nothing;
  end if;

  select (
    (select count(*) from public.qa_question_votes v where v.question_id = target_question_id)
    + (select count(*) from public.qa_guest_votes gv where gv.question_id = target_question_id)
  ) into next_count;

  return jsonb_build_object(
    'question_id', target_question_id,
    'voted', not already,
    'vote_count', next_count
  );
end;
$$;

revoke all on function public.qa_guest_vote(text, uuid, text) from public, anon, authenticated;

-- ── Accepting answers on authorless questions ──────────────────────────────
-- qa_accept_answer previously required the caller to be the question's author
-- or an admin. A guest question has no author, which would leave the main flow
-- of this feature — a leader answers what the room asked and marks it settled
-- — impossible for anyone below admin. Leaders stand in for the missing author
-- on guest questions only; member questions keep the original rule.
create or replace function public.qa_accept_answer(target_answer_id uuid, accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  target_question_id uuid;
  question_author_id uuid;
  next_resolved_at timestamptz;
begin
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select a.question_id, q.author_id
    into target_question_id, question_author_id
    from public.qa_answers a
    join public.qa_questions q on q.id = a.question_id
   where a.id = target_answer_id;

  if target_question_id is null then
    raise exception 'Answer not found.' using errcode = 'P0002';
  end if;

  if question_author_id is distinct from caller_id
     and not public.is_admin()
     and not (question_author_id is null and public.is_leader())
  then
    raise exception 'Only the question author or a leader can accept an answer.' using errcode = '42501';
  end if;

  if accept then
    update public.qa_answers
       set is_accepted = false
     where question_id = target_question_id
       and id <> target_answer_id
       and is_accepted = true;

    update public.qa_answers
       set is_accepted = true
     where id = target_answer_id;

    update public.qa_questions
       set resolved_at = coalesce(resolved_at, now()),
           updated_at = now()
     where id = target_question_id
     returning resolved_at into next_resolved_at;
  else
    update public.qa_answers
       set is_accepted = false
     where id = target_answer_id;

    if exists (
      select 1 from public.qa_answers
       where question_id = target_question_id
         and is_accepted = true
    ) then
      select resolved_at into next_resolved_at
        from public.qa_questions
       where id = target_question_id;
    else
      update public.qa_questions
         set resolved_at = null,
             updated_at = now()
       where id = target_question_id
       returning resolved_at into next_resolved_at;
    end if;
  end if;

  return jsonb_build_object(
    'question_id', target_question_id,
    'answer_id', target_answer_id,
    'accepted', accept,
    'resolved_at', next_resolved_at
  );
end;
$$;

grant execute on function public.qa_accept_answer(uuid, boolean) to authenticated;

-- Note: the vote tables are deliberately NOT added to supabase_realtime.
-- Present mode polls qa_session_board instead — a subscription that silently
-- stops delivering is far worse on a screen nobody is watching the console of
-- than a refresh that is a few seconds behind.
