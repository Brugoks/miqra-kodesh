-- Sermons & Messages library: org-wide "talks" with raw transcript, summary notes,
-- key takeaways, a discussion thread, and an optional link to a calendar event.

-- ── sermon_talks ────────────────────────────────────────────────────────────
create table if not exists public.sermon_talks (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id),
  event_id        uuid        references public.calendar_events(id) on delete set null,
  title           text        not null,
  category        text        not null default 'sermon' check (category in ('sermon', 'message')),
  speaker_name    text,
  scripture_ref   text,
  talk_date       date,
  summary         text,
  transcript      text,
  key_takeaways   jsonb       not null default '[]'::jsonb,
  video_url       text,
  is_published    boolean     not null default false,
  created_by      uuid        references auth.users(id) on delete set null,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists sermon_talks_org_idx   on public.sermon_talks (organization_id, talk_date desc);
create index if not exists sermon_talks_event_idx on public.sermon_talks (event_id);

create trigger sermon_talks_set_org before insert on public.sermon_talks
  for each row execute function public.set_organization_id();

alter table public.sermon_talks enable row level security;

-- Published talks are visible to the whole org; drafts only to their author and leaders.
create policy "sermon_talks_select" on public.sermon_talks
  for select to authenticated
  using (
    public.is_developer() or (
      organization_id = public.get_my_organization_id()
      and (is_published = true or created_by = auth.uid() or public.is_leader())
    )
  );

create policy "sermon_talks_insert" on public.sermon_talks
  for insert to authenticated
  with check (
    public.is_developer() or (
      organization_id = public.get_my_organization_id()
      and public.is_leader()
      and created_by = auth.uid()
    )
  );

create policy "sermon_talks_update" on public.sermon_talks
  for update to authenticated
  using (
    public.is_developer() or (
      organization_id = public.get_my_organization_id()
      and (created_by = auth.uid() or public.is_admin())
    )
  )
  with check (
    public.is_developer() or (
      organization_id = public.get_my_organization_id()
      and (created_by = auth.uid() or public.is_admin())
    )
  );

create policy "sermon_talks_delete" on public.sermon_talks
  for delete to authenticated
  using (
    public.is_developer() or (
      organization_id = public.get_my_organization_id()
      and (created_by = auth.uid() or public.is_admin())
    )
  );

-- ── sermon_talk_comments (discussion) ───────────────────────────────────────
create table if not exists public.sermon_talk_comments (
  id              uuid        primary key default gen_random_uuid(),
  talk_id         uuid        not null references public.sermon_talks(id) on delete cascade,
  organization_id uuid        not null references public.organizations(id),
  user_id         uuid        references auth.users(id) on delete cascade,
  user_name       text,
  user_email      text,
  content         text        not null,
  created_at      timestamptz not null default now()
);

create index if not exists sermon_talk_comments_talk_idx on public.sermon_talk_comments (talk_id, created_at);

create trigger sermon_talk_comments_set_org before insert on public.sermon_talk_comments
  for each row execute function public.set_organization_id();

alter table public.sermon_talk_comments enable row level security;

-- Comments are visible wherever the parent talk is visible (talk RLS applies in the subquery).
create policy "sermon_talk_comments_select" on public.sermon_talk_comments
  for select to authenticated
  using (
    public.is_developer() or (
      organization_id = public.get_my_organization_id()
      and exists (select 1 from public.sermon_talks t where t.id = talk_id)
    )
  );

create policy "sermon_talk_comments_insert" on public.sermon_talk_comments
  for insert to authenticated
  with check (
    public.is_developer() or (
      organization_id = public.get_my_organization_id()
      and user_id = auth.uid()
      and exists (select 1 from public.sermon_talks t where t.id = talk_id and t.is_published = true)
    )
  );

create policy "sermon_talk_comments_delete" on public.sermon_talk_comments
  for delete to authenticated
  using (
    public.is_developer() or (
      organization_id = public.get_my_organization_id()
      and (user_id = auth.uid() or public.is_admin())
    )
  );
