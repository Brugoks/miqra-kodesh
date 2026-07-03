-- Phase 4: cached AI scripture exploration suggestions for Q&R questions.

create table if not exists public.qa_passage_suggestions (
  question_id uuid primary key references public.qa_questions(id) on delete cascade,
  prompt_version text not null,
  source_hash text not null,
  content jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.qa_passage_suggestions enable row level security;

drop policy if exists "qa_passage_suggestions_select" on public.qa_passage_suggestions;
create policy "qa_passage_suggestions_select" on public.qa_passage_suggestions
  for select to authenticated
  using (
    public.is_developer()
    or exists (
      select 1
        from public.qa_questions q
       where q.id = question_id
         and q.organization_id = public.get_my_organization_id()
    )
  );
