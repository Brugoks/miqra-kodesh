-- Private chats: channels visible only to explicitly added members.
-- Public channels keep org-wide visibility; private ones are gated by membership.

alter table public.chat_channels add column if not exists is_private boolean not null default false;

create table if not exists public.chat_channel_members (
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index if not exists chat_channel_members_user_idx on public.chat_channel_members(user_id);
alter table public.chat_channel_members enable row level security;

-- Can the current user see/use a channel? Public channels: same org. Private:
-- must be the creator or an explicit member. SECURITY DEFINER avoids RLS
-- recursion when checking membership from other tables' policies.
create or replace function public.can_access_channel(cid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.chat_channels c
    where c.id = cid
      and (
        public.is_developer()
        or (
          c.organization_id = public.get_my_organization_id()
          and (
            not c.is_private
            or c.created_by = auth.uid()
            or exists (
              select 1 from public.chat_channel_members m
              where m.channel_id = c.id and m.user_id = auth.uid()
            )
          )
        )
      )
  );
$$;
grant execute on function public.can_access_channel(uuid) to authenticated;

-- ── Rebuild channel policies to respect privacy ──────────────────────────────
drop policy if exists "chat_channels_select" on public.chat_channels;
create policy "chat_channels_select" on public.chat_channels
  for select to authenticated
  using (public.can_access_channel(id));

drop policy if exists "chat_channels_insert" on public.chat_channels;
create policy "chat_channels_insert" on public.chat_channels
  for insert to authenticated
  with check (
    public.is_developer()
    or (
      organization_id = public.get_my_organization_id()
      -- anyone may create a private chat; public channels stay leader-gated
      and (is_private or public.can_manage_channels())
    )
  );

-- ── Messages respect channel access ──────────────────────────────────────────
drop policy if exists "chat_messages_select" on public.chat_messages;
create policy "chat_messages_select" on public.chat_messages
  for select to authenticated
  using (public.can_access_channel(channel_id));

drop policy if exists "chat_messages_insert" on public.chat_messages;
create policy "chat_messages_insert" on public.chat_messages
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_channel(channel_id));

-- ── Reactions respect channel access ─────────────────────────────────────────
drop policy if exists "chat_reactions_select" on public.chat_message_reactions;
create policy "chat_reactions_select" on public.chat_message_reactions
  for select to authenticated
  using (
    public.is_developer()
    or exists (select 1 from public.chat_messages m where m.id = message_id and public.can_access_channel(m.channel_id))
  );

drop policy if exists "chat_reactions_insert" on public.chat_message_reactions;
create policy "chat_reactions_insert" on public.chat_message_reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.chat_messages m where m.id = message_id and public.can_access_channel(m.channel_id))
  );

-- ── Channel membership policies ──────────────────────────────────────────────
create policy "chat_channel_members_select" on public.chat_channel_members
  for select to authenticated
  using (public.can_access_channel(channel_id));

-- Any member (or the creator) of the channel can add people; developers too.
create policy "chat_channel_members_insert" on public.chat_channel_members
  for insert to authenticated
  with check (added_by = auth.uid() and public.can_access_channel(channel_id));

-- Leave yourself, or the channel creator/admin/developer can remove anyone.
create policy "chat_channel_members_delete" on public.chat_channel_members
  for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or public.is_developer()
    or exists (select 1 from public.chat_channels c where c.id = channel_id and c.created_by = auth.uid())
  );

-- Realtime so newly-added members see the channel appear.
do $$ begin
  alter publication supabase_realtime add table public.chat_channel_members;
exception when duplicate_object then null; end $$;
