-- Chat enhancements: image sharing, threaded replies, and @mentions + in-app
-- notifications.

-- ── Messages: image + reply support ──────────────────────────────────────────
alter table public.chat_messages alter column body drop not null;
alter table public.chat_messages add column if not exists image_url text;
alter table public.chat_messages add column if not exists reply_to_id uuid
  references public.chat_messages(id) on delete set null;

-- ── Mentions (one row per mentioned user per message) ────────────────────────
create table if not exists public.chat_mentions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists chat_mentions_user_idx on public.chat_mentions(mentioned_user_id, read_at);
alter table public.chat_mentions enable row level security;

-- A user sees only their own mentions; the message author creates them.
create policy "chat_mentions_select" on public.chat_mentions
  for select to authenticated
  using (mentioned_user_id = auth.uid() or public.is_developer());

create policy "chat_mentions_insert" on public.chat_mentions
  for insert to authenticated
  with check (actor_id = auth.uid() and (public.is_developer() or organization_id = public.get_my_organization_id()));

create policy "chat_mentions_update" on public.chat_mentions
  for update to authenticated
  using (mentioned_user_id = auth.uid())
  with check (mentioned_user_id = auth.uid());

-- ── Storage bucket for chat images ───────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-images',
  'chat-images',
  true,
  5242880,  -- 5 MB
  array['image/png','image/jpeg','image/webp','image/gif','image/heic','image/heif']
)
on conflict (id) do nothing;

create policy "Users upload chat images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Public read chat images" on storage.objects
  for select using (bucket_id = 'chat-images');

create policy "Users delete own chat images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── Realtime: notify mentioned users live ────────────────────────────────────
do $$ begin
  alter publication supabase_realtime add table public.chat_mentions;
exception when duplicate_object then null; end $$;
