-- Berean review (Acts 17:11): AI-assisted scripture-alignment analysis of a
-- talk transcript, plus per-leader verdicts on each alignment card.
-- Leader-only feature — members never see analyses or verdicts.

-- ── sermon_talk_berean ──────────────────────────────────────────────────────
-- One analysis per talk (re-running replaces it). Rows are written by the
-- berean-analysis edge function with the service role, so there are no
-- insert/update policies for authenticated users — leaders can only read.
create table if not exists public.sermon_talk_berean (
  id              uuid        primary key default gen_random_uuid(),
  talk_id         uuid        not null unique references public.sermon_talks(id) on delete cascade,
  organization_id uuid        not null references public.organizations(id),
  report          jsonb       not null,
  model           text,
  prompt_version  text,
  created_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists sermon_talk_berean_org_idx on public.sermon_talk_berean (organization_id);

alter table public.sermon_talk_berean enable row level security;

create policy "sermon_talk_berean_select" on public.sermon_talk_berean
  for select to authenticated
  using (
    public.is_developer() or (
      organization_id = public.get_my_organization_id()
      and public.is_leader()
    )
  );

-- ── sermon_talk_berean_verdicts ─────────────────────────────────────────────
-- A leader's judgment on one alignment card. Shared among the org's leaders
-- so review is collaborative; one verdict per leader per card.
create table if not exists public.sermon_talk_berean_verdicts (
  id              uuid        primary key default gen_random_uuid(),
  analysis_id     uuid        not null references public.sermon_talk_berean(id) on delete cascade,
  organization_id uuid        not null references public.organizations(id),
  card_id         text        not null,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  user_name       text,
  verdict         text        not null check (verdict in ('sound', 'discuss', 'concern')),
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (analysis_id, card_id, user_id)
);

create index if not exists sermon_talk_berean_verdicts_analysis_idx
  on public.sermon_talk_berean_verdicts (analysis_id, card_id);

create trigger sermon_talk_berean_verdicts_set_org before insert on public.sermon_talk_berean_verdicts
  for each row execute function public.set_organization_id();

alter table public.sermon_talk_berean_verdicts enable row level security;

create policy "sermon_talk_berean_verdicts_select" on public.sermon_talk_berean_verdicts
  for select to authenticated
  using (
    public.is_developer() or (
      organization_id = public.get_my_organization_id()
      and public.is_leader()
    )
  );

create policy "sermon_talk_berean_verdicts_insert" on public.sermon_talk_berean_verdicts
  for insert to authenticated
  with check (
    public.is_developer() or (
      organization_id = public.get_my_organization_id()
      and public.is_leader()
      and user_id = auth.uid()
    )
  );

create policy "sermon_talk_berean_verdicts_update" on public.sermon_talk_berean_verdicts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "sermon_talk_berean_verdicts_delete" on public.sermon_talk_berean_verdicts
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());
