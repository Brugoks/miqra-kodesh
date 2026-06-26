-- Per-user scripture lookup history for the Bible Lookup panel.
-- Upsert on (user_id, reference) keeps one row per reference with the latest timestamp.

create table public.scripture_lookup_history (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.profiles(id) on delete cascade,
  reference    text        not null,
  looked_up_at timestamptz not null default now()
);

-- Deduplicate: one row per user + reference, updated on re-lookup
create unique index scripture_lookup_history_user_ref_idx
  on public.scripture_lookup_history (user_id, reference);

-- Efficient recency queries
create index scripture_lookup_history_user_time_idx
  on public.scripture_lookup_history (user_id, looked_up_at desc);

alter table public.scripture_lookup_history enable row level security;

create policy "users read own history"
  on public.scripture_lookup_history for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users insert own history"
  on public.scripture_lookup_history for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users update own history"
  on public.scripture_lookup_history for update
  to authenticated
  using (auth.uid() = user_id);

create policy "users delete own history"
  on public.scripture_lookup_history for delete
  to authenticated
  using (auth.uid() = user_id);
