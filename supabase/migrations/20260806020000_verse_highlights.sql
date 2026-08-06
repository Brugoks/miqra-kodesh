-- Personal verse highlights and notes.
--
-- Anchored to the canonical verse id used everywhere else in the app
-- ('JHN.3.16' — see src/lib/scripture.js and public.verse_embeddings), never to
-- character offsets into passage HTML. Offsets would rot: the Bible APIs do not
-- return byte-stable text, users switch translations, and compare mode renders
-- the same verse several times. Verse ids survive all of that.
--
-- book_code / chapter / verse are denormalized from verse_id so highlights can
-- be filtered and sorted in canonical order without parsing text in SQL.
--
-- verse_text is a snapshot so a "My Highlights" list renders without re-fetching
-- every verse from the passage API — 200 highlights would otherwise be 200 calls
-- against the ESV quota. translation records which text the snapshot came from.

create table if not exists public.verse_highlights (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  -- Recorded for context only; never used for access control. Cheap to store
  -- now and impossible to reconstruct later if highlights ever become
  -- shareable, since it captures the org the user was reading in at the time.
  organization_id uuid references public.organizations(id),
  verse_id        text not null,
  book_code       text not null,
  chapter         integer not null,
  verse           integer not null,
  color           text not null default 'gold',
  note            text,
  verse_text      text,
  translation     text,
  source          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint verse_highlights_user_verse_key unique (user_id, verse_id)
);

alter table public.verse_highlights enable row level security;

-- Strictly the owner. No is_admin() and deliberately no is_developer() bypass:
-- notes on Scripture are among the most personal things in this app, and a
-- developer toggling org scoping off must not become a way to read them. The
-- discipleship-style opt-in sharing on memory_verses is the pattern to follow
-- if these are ever shared; that stays an explicit, per-row decision.
drop policy if exists "verse_highlights_owner" on public.verse_highlights;
create policy "verse_highlights_owner" on public.verse_highlights
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Reader lookup: "my highlights in this chapter".
create index if not exists verse_highlights_user_chapter_idx
  on public.verse_highlights (user_id, book_code, chapter);

-- Review page: "my highlights, newest first".
create index if not exists verse_highlights_user_created_idx
  on public.verse_highlights (user_id, created_at desc);

create trigger verse_highlights_set_org before insert on public.verse_highlights
  for each row execute function public.set_organization_id();

create or replace function public.touch_verse_highlight()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger verse_highlights_touch before update on public.verse_highlights
  for each row execute function public.touch_verse_highlight();
