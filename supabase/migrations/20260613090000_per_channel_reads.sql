-- (1) Allow duplicate names for private chats; keep names unique only among
-- public channels in an organization.
alter table public.chat_channels drop constraint if exists chat_channels_organization_id_name_key;
create unique index if not exists chat_channels_org_name_public_key
  on public.chat_channels (organization_id, name)
  where (not is_private);

-- (2) Per-channel read tracking for unread badges.
create table if not exists public.chat_channel_reads (
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
alter table public.chat_channel_reads enable row level security;

create policy "chat_channel_reads_select" on public.chat_channel_reads
  for select to authenticated using (user_id = auth.uid());
create policy "chat_channel_reads_insert" on public.chat_channel_reads
  for insert to authenticated with check (user_id = auth.uid());
create policy "chat_channel_reads_update" on public.chat_channel_reads
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Per-channel unread counts for the current user, across accessible channels,
-- excluding their own messages. SECURITY DEFINER to read membership rows.
create or replace function public.chat_unread_counts()
returns table(channel_id uuid, unread bigint)
language sql
security definer
stable
set search_path = public
as $$
  select m.channel_id, count(*)::bigint as unread
  from public.chat_messages m
  join public.chat_channels c on c.id = m.channel_id
  left join public.chat_channel_reads r
    on r.channel_id = m.channel_id and r.user_id = auth.uid()
  where m.author_id <> auth.uid()
    and (r.last_read_at is null or m.created_at > r.last_read_at)
    and (
      public.is_developer()
      or (not c.is_private and c.organization_id = public.get_my_organization_id())
      or c.created_by = auth.uid()
      or exists (
        select 1 from public.chat_channel_members cm
        where cm.channel_id = c.id and cm.user_id = auth.uid()
      )
    )
  group by m.channel_id;
$$;
grant execute on function public.chat_unread_counts() to authenticated;
