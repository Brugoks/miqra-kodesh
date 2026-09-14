-- Living Study Canvas: saved canvases, synced to the account, with read-only
-- link sharing.
--
-- Canvases used to live in localStorage only, so a canvas saved on a phone
-- never appeared on the desktop (and vice versa). This table replaces that;
-- the client uploads any device-local saves on first load and then clears them.
--
-- A canvas is a history, not a snapshot:
--   passages  up to four Scripture passages set side by side, each with the
--             verse text and Wiki entries the explanations cite (a snapshot, so
--             a saved or shared canvas renders without calling the Bible API).
--   steps     every question asked and the explanation it produced, plus the
--             student's reflection and card notes. Each step records the step
--             it was asked from (parentId), so the history is a tree: asking
--             from an earlier step branches instead of overwriting.
--   pins      cards set aside on the pinboard for comparison.
-- The shape is validated in src/lib/studyCanvasModel.js.
--
-- Scoped to the owner, not the active organization: a personal study belongs to
-- the person writing it, and scoping by org would hide a canvas whenever two
-- devices sit in different orgs — the exact bug this table exists to fix.
-- organization_id is recorded for context only, as on verse_highlights.

create table if not exists public.study_canvases (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  organization_id      uuid references public.organizations(id) on delete set null,
  title                text not null check (char_length(title) between 1 and 160),
  reference            text not null check (char_length(reference) between 1 and 500),
  passages             jsonb not null check (jsonb_typeof(passages) = 'array' and jsonb_array_length(passages) between 1 and 4),
  steps                jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  pins                 jsonb not null default '[]'::jsonb check (jsonb_typeof(pins) = 'array'),
  -- Lets the saved list show "5 steps" without shipping every explanation.
  step_count           integer generated always as (jsonb_array_length(steps)) stored,
  -- Link sharing. A null token means private; turning sharing off and on again
  -- mints a new token, so an old link stops working.
  share_token          uuid unique,
  share_includes_notes boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint study_canvases_size check (
    octet_length(passages::text) + octet_length(steps::text) + octet_length(pins::text) < 3000000
  )
);

alter table public.study_canvases enable row level security;

-- Strictly the owner, with no admin or developer bypass — the same reasoning
-- as verse_highlights: a personal study, with personal notes, is not org data.
-- Shared readers never touch the table; they go through the function below.
drop policy if exists "study_canvases_owner" on public.study_canvases;
create policy "study_canvases_owner" on public.study_canvases
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Saved list: "my canvases, most recently touched first".
create index if not exists study_canvases_user_updated_idx
  on public.study_canvases (user_id, updated_at desc);

drop trigger if exists study_canvases_set_org on public.study_canvases;
create trigger study_canvases_set_org before insert on public.study_canvases
  for each row execute function public.set_organization_id();

create or replace function public.touch_study_canvas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists study_canvases_touch on public.study_canvases;
create trigger study_canvases_touch before update on public.study_canvases
  for each row execute function public.touch_study_canvas();

-- Read a shared canvas by its link token. Signed-in users only (anon has no
-- grant and the auth.uid() guard backs that up), exactly one row, and never the
-- owner's id or org. Notes and reflections are stripped server-side unless the
-- owner chose to include them — the client is not trusted to hide them.
create or replace function public.get_shared_study_canvas(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id,
    'title', c.title,
    'reference', c.reference,
    'passages', c.passages,
    'pins', c.pins,
    'steps', case when c.share_includes_notes then c.steps else coalesce((
      select jsonb_agg(s.step - 'note' - 'cardNotes' order by s.ord)
      from jsonb_array_elements(c.steps) with ordinality as s(step, ord)
    ), '[]'::jsonb) end,
    'includesNotes', c.share_includes_notes,
    'updatedAt', c.updated_at,
    'ownerName', p.full_name
  )
  from public.study_canvases c
  left join public.profiles p on p.id = c.user_id
  where p_token is not null
    and c.share_token = p_token
    and auth.uid() is not null;
$$;

revoke all on function public.get_shared_study_canvas(uuid) from public, anon;
grant execute on function public.get_shared_study_canvas(uuid) to authenticated;
