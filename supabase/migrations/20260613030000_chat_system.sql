-- Church chat system: org-scoped channels with real-time text messages and
-- emoji reactions. Leaders/admins/developers create channels; everyone posts.

-- Who may create/manage channels (mirrors the app's leader roles + developer).
create or replace function public.can_manage_channels()
returns boolean
language sql
stable
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'student')
    in ('developer', 'admin', 'leader', 'student_leader', 'parent_leader')
$$;

-- ── Channels ─────────────────────────────────────────────────────────────────
create table if not exists public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  category text not null default 'General',
  position integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);
create index if not exists chat_channels_org_idx on public.chat_channels(organization_id);
alter table public.chat_channels enable row level security;

-- ── Messages ─────────────────────────────────────────────────────────────────
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_name text,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_channel_idx on public.chat_messages(channel_id, created_at);
alter table public.chat_messages enable row level security;

-- ── Reactions ────────────────────────────────────────────────────────────────
create table if not exists public.chat_message_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
alter table public.chat_message_reactions enable row level security;

-- ── Policies: channels ───────────────────────────────────────────────────────
create policy "chat_channels_select" on public.chat_channels
  for select to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

create policy "chat_channels_insert" on public.chat_channels
  for insert to authenticated
  with check (
    (public.is_developer() or (organization_id = public.get_my_organization_id() and public.can_manage_channels()))
  );

create policy "chat_channels_update" on public.chat_channels
  for update to authenticated
  using (created_by = auth.uid() or public.is_admin() or public.is_developer())
  with check (created_by = auth.uid() or public.is_admin() or public.is_developer());

create policy "chat_channels_delete" on public.chat_channels
  for delete to authenticated
  using (created_by = auth.uid() or public.is_admin() or public.is_developer());

-- ── Policies: messages ───────────────────────────────────────────────────────
create policy "chat_messages_select" on public.chat_messages
  for select to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

create policy "chat_messages_insert" on public.chat_messages
  for insert to authenticated
  with check (author_id = auth.uid() and (public.is_developer() or organization_id = public.get_my_organization_id()));

create policy "chat_messages_delete" on public.chat_messages
  for delete to authenticated
  using (author_id = auth.uid() or public.is_admin() or public.is_developer());

-- ── Policies: reactions ──────────────────────────────────────────────────────
create policy "chat_reactions_select" on public.chat_message_reactions
  for select to authenticated
  using (
    public.is_developer()
    or message_id in (select id from public.chat_messages where organization_id = public.get_my_organization_id())
  );

create policy "chat_reactions_insert" on public.chat_message_reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and message_id in (select id from public.chat_messages where organization_id = public.get_my_organization_id())
  );

create policy "chat_reactions_delete" on public.chat_message_reactions
  for delete to authenticated
  using (user_id = auth.uid());

-- ── Realtime: broadcast inserts/deletes (RLS still applies per subscriber) ────
do $$ begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.chat_message_reactions;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.chat_channels;
exception when duplicate_object then null; end $$;

-- ── Seed starter channels for every existing organization ─────────────────────
insert into public.chat_channels (organization_id, name, description, category, position)
select o.id, c.name, c.description, c.category, c.position
from public.organizations o
cross join (values
  ('prayer-requests', 'Share requests and pray for one another', 'Faith', 1),
  ('music', 'Songs, playlists, and worship sets', 'Faith', 2),
  ('church-activities', 'Events, serving, and announcements', 'Faith', 3),
  ('general', 'Hang out and have fun', 'Community', 4)
) as c(name, description, category, position)
on conflict (organization_id, name) do nothing;
