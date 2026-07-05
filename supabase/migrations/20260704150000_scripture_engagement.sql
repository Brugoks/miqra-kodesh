-- Per-chapter scripture engagement ledger: which chapters a user touched,
-- from which source, on which local day. Strictly user-initiated actions —
-- reading-plan completions and Bible Lookup lookups. Passive displays (the
-- Dashboard daily verse, previews) are deliberately never recorded.
--
-- The composite PK makes writes idempotent (re-reading a chapter the same
-- day is one row), so the table accumulates history without the overwrite
-- problem scripture_lookup_history has (one row per reference, timestamp
-- replaced on re-lookup) — that table stays as the "recent lookups" list,
-- this one feeds the stats heatmap and books-of-the-Bible map.

create table public.scripture_engagement (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  book       text not null,  -- USFM code, e.g. 'JHN'
  chapter    int  not null,
  source     text not null check (source in ('plan', 'lookup')),
  engaged_on date not null default current_date,
  primary key (user_id, book, chapter, source, engaged_on)
);

create index scripture_engagement_user_time_idx
  on public.scripture_engagement (user_id, engaged_on desc);

alter table public.scripture_engagement enable row level security;

create policy "users manage own scripture engagement"
  on public.scripture_engagement for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
