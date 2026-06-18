-- Journal comments table for reflection engagement
create table public.journal_comments (
  id              uuid default gen_random_uuid() primary key,
  journal_id      text not null references public.journal_entries(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  parent_id       uuid references public.journal_comments(id) on delete cascade,
  body            text not null,
  organization_id uuid references public.organizations(id),
  created_at      timestamptz default now()
);

-- Index for fast lookup by journal entry
create index idx_journal_comments_journal_id on public.journal_comments(journal_id);

-- Enable RLS
alter table public.journal_comments enable row level security;

-- SELECT: users can read comments on journal entries they can already see
-- (leverages the existing RLS on journal_entries to determine visibility)
create policy "journal_comments_select" on public.journal_comments
  for select to authenticated
  using (
    public.is_developer() or
    (
      organization_id = public.get_my_organization_id() and
      exists (
        select 1 from public.journal_entries je
        where je.id = journal_comments.journal_id
      )
    )
  );

-- INSERT: authenticated users can comment on non-private entries they can see,
-- or on their own entries (to reply to others)
create policy "journal_comments_insert" on public.journal_comments
  for insert to authenticated
  with check (
    public.is_developer() or
    (
      organization_id = public.get_my_organization_id() and
      auth.uid() = user_id and
      exists (
        select 1 from public.journal_entries je
        where je.id = journal_comments.journal_id
          and (je.user_id = auth.uid() or je.visibility != 'private')
      )
    )
  );

-- DELETE: only the comment author can delete their own comment
create policy "journal_comments_delete" on public.journal_comments
  for delete to authenticated
  using (
    public.is_developer() or
    (
      organization_id = public.get_my_organization_id() and
      auth.uid() = user_id
    )
  );
