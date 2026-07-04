-- Broadcast Fellowship tables over Supabase Realtime so the Fellowship page
-- can live-refresh polls, prayers, journal comments, and join requests
-- (matching the pattern already used for chat and Q&A tables).

do $$
begin
  alter publication supabase_realtime add table public.polls;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.poll_votes;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.prayers;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.prayer_amens;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.prayer_updates;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.journal_comments;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.attendance_groups;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.group_join_requests;
exception when duplicate_object then null;
end $$;
