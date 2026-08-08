-- Getting-started checklist for new members. Feedback ticket 032815b7.
--
-- Five signals of "this person has found their way around": they have a face,
-- they have opened scripture, they know a gathering is happening, they have
-- said something, and they have marked something worth keeping. Each is read
-- from what the user has actually DONE rather than from a box they ticked, so
-- the checklist cannot disagree with the app.
--
-- One round trip rather than five count queries from the Dashboard, and
-- everything is keyed to auth.uid(), so a caller can only ever see their own
-- progress. That also keeps it clear of the is_developer() org-scoping split
-- in 20260805010000 — there is no cross-org read here to scope.

create or replace function public.onboarding_checklist()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'photo', coalesce(
      (select avatar_url is not null and avatar_url <> '' from public.profiles where id = auth.uid()),
      false
    ),
    'reading', exists (
      select 1 from public.reading_plan_enrollments where user_id = auth.uid()
    ),
    'rsvp', exists (
      select 1 from public.calendar_rsvps where user_id = auth.uid()
    ),
    'chat', exists (
      select 1 from public.chat_messages where author_id = auth.uid() and deleted_at is null
    ),
    'highlight', exists (
      select 1 from public.verse_highlights where user_id = auth.uid()
    )
  );
$$;

revoke all on function public.onboarding_checklist() from public;
grant execute on function public.onboarding_checklist() to authenticated;

-- Preventative, not a current bottleneck: these tables are small today, but
-- this function runs on every Dashboard load for every user and chat_messages
-- is the fastest-growing table in the schema. It had no index on author_id at
-- all, and calendar_rsvps only carries user_id as the trailing half of
-- (event_id, user_id), which an existence check on user_id alone cannot use.
create index if not exists chat_messages_author_active_idx
  on public.chat_messages (author_id) where deleted_at is null;

create index if not exists calendar_rsvps_user_idx
  on public.calendar_rsvps (user_id);
