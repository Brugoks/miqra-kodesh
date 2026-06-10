create table if not exists public.prayers (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  name text not null default 'Anonymous',
  category text not null default 'Faith',
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.prayers enable row level security;

drop policy if exists "Authenticated users read prayers" on public.prayers;
create policy "Authenticated users read prayers"
  on public.prayers for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users create prayers" on public.prayers;
create policy "Authenticated users create prayers"
  on public.prayers for insert
  to authenticated
  with check (auth.uid() = user_id or user_id is null);

drop policy if exists "Users and admins delete prayers" on public.prayers;
create policy "Users and admins delete prayers"
  on public.prayers for delete
  to authenticated
  using (auth.uid() = user_id or public.is_admin());


create table if not exists public.prayer_amens (
  prayer_id text not null references public.prayers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (prayer_id, user_id)
);

alter table public.prayer_amens enable row level security;

drop policy if exists "Authenticated users read prayer amens" on public.prayer_amens;
create policy "Authenticated users read prayer amens"
  on public.prayer_amens for select
  to authenticated
  using (true);

drop policy if exists "Users manage own prayer amens" on public.prayer_amens;
create policy "Users manage own prayer amens"
  on public.prayer_amens for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


create table if not exists public.journal_entries (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  scripture text,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.journal_entries enable row level security;

drop policy if exists "Users manage own journal entries" on public.journal_entries;
create policy "Users manage own journal entries"
  on public.journal_entries for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
