-- One-tap reactions on shared journal reflections (Amen / Praying / Heart)
create table public.journal_reactions (
  id              uuid default gen_random_uuid() primary key,
  journal_id      text not null references public.journal_entries(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  reaction        text not null check (reaction in ('amen', 'praying', 'heart')),
  organization_id uuid references public.organizations(id),
  created_at      timestamptz default now(),
  unique (journal_id, user_id, reaction)
);

create index idx_journal_reactions_journal_id on public.journal_reactions(journal_id);

alter table public.journal_reactions enable row level security;

-- SELECT: reactions are visible wherever the underlying entry is visible
-- (the subquery runs under journal_entries RLS, so visibility rules carry over)
create policy "journal_reactions_select" on public.journal_reactions
  for select to authenticated
  using (
    exists (
      select 1 from public.journal_entries je
      where je.id = journal_reactions.journal_id
    )
  );

-- INSERT: react as yourself on any non-private entry you can see, or your own
create policy "journal_reactions_insert" on public.journal_reactions
  for insert to authenticated
  with check (
    auth.uid() = user_id and
    exists (
      select 1 from public.journal_entries je
      where je.id = journal_reactions.journal_id
        and (je.user_id = auth.uid() or je.visibility != 'private')
    )
  );

-- DELETE: remove your own reaction only
create policy "journal_reactions_delete" on public.journal_reactions
  for delete to authenticated
  using (auth.uid() = user_id);
