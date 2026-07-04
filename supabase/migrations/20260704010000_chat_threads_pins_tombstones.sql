-- Threads, pinned messages, edited markers, and soft-delete tombstones for chat.

alter table public.chat_messages
  add column if not exists thread_root_id uuid references public.chat_messages(id) on delete cascade,
  add column if not exists reply_count integer not null default 0,
  add column if not exists last_reply_at timestamptz,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

create index if not exists chat_messages_thread_root_created_idx
  on public.chat_messages(thread_root_id, created_at);
create index if not exists chat_messages_channel_root_created_idx
  on public.chat_messages(channel_id, thread_root_id, created_at);

create or replace function public.refresh_chat_thread_root(root_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if root_id is null then
    return;
  end if;

  update public.chat_messages root
  set
    reply_count = coalesce(stats.reply_count, 0),
    last_reply_at = stats.last_reply_at
  from (
    select
      count(*)::integer as reply_count,
      max(created_at) as last_reply_at
    from public.chat_messages
    where thread_root_id = root_id
      and deleted_at is null
  ) stats
  where root.id = root_id;
end;
$$;

create or replace function public.maintain_chat_thread_root()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.refresh_chat_thread_root(new.thread_root_id);
    return new;
  elsif tg_op = 'UPDATE' then
    if new.thread_root_id is distinct from old.thread_root_id then
      perform public.refresh_chat_thread_root(old.thread_root_id);
      perform public.refresh_chat_thread_root(new.thread_root_id);
    elsif new.deleted_at is distinct from old.deleted_at then
      perform public.refresh_chat_thread_root(new.thread_root_id);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    perform public.refresh_chat_thread_root(old.thread_root_id);
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists maintain_chat_thread_root on public.chat_messages;
create trigger maintain_chat_thread_root
after insert or update or delete on public.chat_messages
for each row execute function public.maintain_chat_thread_root();

create table if not exists public.chat_pinned_messages (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  pinned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (channel_id, message_id)
);
create index if not exists chat_pinned_messages_org_idx on public.chat_pinned_messages(organization_id);
create index if not exists chat_pinned_messages_message_idx on public.chat_pinned_messages(message_id);
alter table public.chat_pinned_messages enable row level security;

create policy "chat_pinned_messages_select" on public.chat_pinned_messages
  for select to authenticated
  using (public.can_access_channel(channel_id));

create policy "chat_pinned_messages_insert" on public.chat_pinned_messages
  for insert to authenticated
  with check (
    pinned_by = auth.uid()
    and public.can_access_channel(channel_id)
    and exists (
      select 1
      from public.chat_channels c
      where c.id = channel_id
        and c.organization_id = organization_id
        and (c.created_by = auth.uid() or public.can_manage_channels() or public.is_developer())
    )
    and exists (
      select 1
      from public.chat_messages m
      where m.id = message_id
        and m.channel_id = channel_id
        and m.organization_id = organization_id
        and m.thread_root_id is null
    )
  );

create policy "chat_pinned_messages_delete" on public.chat_pinned_messages
  for delete to authenticated
  using (
    public.can_access_channel(channel_id)
    and exists (
      select 1
      from public.chat_channels c
      where c.id = channel_id
        and (c.created_by = auth.uid() or public.can_manage_channels() or public.is_developer())
    )
  );

do $$ begin
  alter publication supabase_realtime add table public.chat_pinned_messages;
exception when duplicate_object then null; end $$;
