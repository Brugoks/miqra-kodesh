-- Per-user channel notification preferences and mute state.

create table if not exists public.chat_channel_prefs (
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  level text not null default 'mentions' check (level in ('all', 'mentions', 'none')),
  muted_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
alter table public.chat_channel_prefs enable row level security;

create index if not exists chat_channel_prefs_user_idx on public.chat_channel_prefs(user_id);

create policy "chat_channel_prefs_select" on public.chat_channel_prefs
  for select to authenticated
  using (user_id = auth.uid());

create policy "chat_channel_prefs_insert" on public.chat_channel_prefs
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_channel(channel_id));

create policy "chat_channel_prefs_update" on public.chat_channel_prefs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_access_channel(channel_id));

create or replace function public.touch_chat_channel_prefs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_chat_channel_prefs on public.chat_channel_prefs;
create trigger touch_chat_channel_prefs
before update on public.chat_channel_prefs
for each row execute function public.touch_chat_channel_prefs();
