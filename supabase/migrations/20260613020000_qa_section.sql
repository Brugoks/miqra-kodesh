-- Q&R (Q&A) section: org-scoped questions and answers with per-post anonymity
-- and upvotes on both questions and answers.

-- ── Questions ──────────────────────────────────────────────────────────────
create table if not exists public.qa_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_name text,
  is_anonymous boolean not null default false,
  title text not null,
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists qa_questions_org_idx on public.qa_questions(organization_id);
alter table public.qa_questions enable row level security;

-- ── Answers ────────────────────────────────────────────────────────────────
create table if not exists public.qa_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.qa_questions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_name text,
  is_anonymous boolean not null default false,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists qa_answers_question_idx on public.qa_answers(question_id);
create index if not exists qa_answers_org_idx on public.qa_answers(organization_id);
alter table public.qa_answers enable row level security;

-- ── Votes ──────────────────────────────────────────────────────────────────
create table if not exists public.qa_question_votes (
  question_id uuid not null references public.qa_questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)
);
alter table public.qa_question_votes enable row level security;

create table if not exists public.qa_answer_votes (
  answer_id uuid not null references public.qa_answers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (answer_id, user_id)
);
alter table public.qa_answer_votes enable row level security;

-- ── Policies: questions ─────────────────────────────────────────────────────
create policy "qa_questions_select" on public.qa_questions
  for select to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

create policy "qa_questions_insert" on public.qa_questions
  for insert to authenticated
  with check (author_id = auth.uid() and (public.is_developer() or organization_id = public.get_my_organization_id()));

create policy "qa_questions_update" on public.qa_questions
  for update to authenticated
  using (author_id = auth.uid() or public.is_admin() or public.is_developer())
  with check (author_id = auth.uid() or public.is_admin() or public.is_developer());

create policy "qa_questions_delete" on public.qa_questions
  for delete to authenticated
  using (author_id = auth.uid() or public.is_admin() or public.is_developer());

-- ── Policies: answers ───────────────────────────────────────────────────────
create policy "qa_answers_select" on public.qa_answers
  for select to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

create policy "qa_answers_insert" on public.qa_answers
  for insert to authenticated
  with check (author_id = auth.uid() and (public.is_developer() or organization_id = public.get_my_organization_id()));

create policy "qa_answers_update" on public.qa_answers
  for update to authenticated
  using (author_id = auth.uid() or public.is_admin() or public.is_developer())
  with check (author_id = auth.uid() or public.is_admin() or public.is_developer());

create policy "qa_answers_delete" on public.qa_answers
  for delete to authenticated
  using (author_id = auth.uid() or public.is_admin() or public.is_developer());

-- ── Policies: votes (org members may read counts; users manage their own) ────
create policy "qa_question_votes_select" on public.qa_question_votes
  for select to authenticated
  using (
    public.is_developer()
    or question_id in (select id from public.qa_questions where organization_id = public.get_my_organization_id())
  );

create policy "qa_question_votes_insert" on public.qa_question_votes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and question_id in (select id from public.qa_questions where organization_id = public.get_my_organization_id())
  );

create policy "qa_question_votes_delete" on public.qa_question_votes
  for delete to authenticated
  using (user_id = auth.uid());

create policy "qa_answer_votes_select" on public.qa_answer_votes
  for select to authenticated
  using (
    public.is_developer()
    or answer_id in (select id from public.qa_answers where organization_id = public.get_my_organization_id())
  );

create policy "qa_answer_votes_insert" on public.qa_answer_votes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and answer_id in (select id from public.qa_answers where organization_id = public.get_my_organization_id())
  );

create policy "qa_answer_votes_delete" on public.qa_answer_votes
  for delete to authenticated
  using (user_id = auth.uid());
