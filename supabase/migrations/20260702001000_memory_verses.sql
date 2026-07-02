-- Verse memorization with spaced repetition (SM-2 style scheduling).
-- Cards are added from the Bible Lookup panel; the Dashboard surfaces cards
-- whose due_at has passed for daily review.

create table public.memory_verses (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references public.profiles(id) on delete cascade,
  reference     text        not null,
  verse_text    text        not null,
  translation   text,
  -- Spaced-repetition state (SM-2)
  repetitions   int         not null default 0,
  interval_days int         not null default 0,
  ease          numeric     not null default 2.5,
  due_at        timestamptz not null default now(),
  last_reviewed timestamptz,
  created_at    timestamptz not null default now()
);

-- One card per user + reference
create unique index memory_verses_user_ref_idx
  on public.memory_verses (user_id, reference);

-- Efficient "what's due" queries
create index memory_verses_user_due_idx
  on public.memory_verses (user_id, due_at);

alter table public.memory_verses enable row level security;

create policy "users read own memory verses"
  on public.memory_verses for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users insert own memory verses"
  on public.memory_verses for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users update own memory verses"
  on public.memory_verses for update
  to authenticated
  using (auth.uid() = user_id);

create policy "users delete own memory verses"
  on public.memory_verses for delete
  to authenticated
  using (auth.uid() = user_id);
