-- Helper: true if current user is a leader (admin, leader, student_leader, parent_leader)
create or replace function public.is_leader()
returns boolean
language sql
stable
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'student'
  ) in ('admin', 'leader', 'student_leader', 'parent_leader')
$$;

-- ── Missing calendar columns ────────────────────────────────────────────────
alter table public.calendar_events
  add column if not exists created_by_email text,
  add column if not exists created_by_name  text;

alter table public.calendar_rsvps
  add column if not exists user_name text;

-- ── sermon_notes ────────────────────────────────────────────────────────────
create table if not exists public.sermon_notes (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        references auth.users(id) on delete cascade,
  user_email   text,
  user_name    text,
  title        text        not null,
  category     text        not null default 'sermon',
  scripture_ref text,
  content      text,
  is_shared    boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.sermon_notes enable row level security;

drop policy if exists "View shared or own notes"  on public.sermon_notes;
drop policy if exists "Leaders insert notes"       on public.sermon_notes;
drop policy if exists "Users update own notes"     on public.sermon_notes;
drop policy if exists "Users delete own notes"     on public.sermon_notes;

create policy "View shared or own notes" on public.sermon_notes
  for select to authenticated
  using (is_shared = true or user_id = auth.uid());

create policy "Leaders insert notes" on public.sermon_notes
  for insert to authenticated
  with check (public.is_leader() and user_id = auth.uid());

create policy "Users update own notes" on public.sermon_notes
  for update to authenticated
  using (user_id = auth.uid());

create policy "Users delete own notes" on public.sermon_notes
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ── sermon_feedback_requests ────────────────────────────────────────────────
create table if not exists public.sermon_feedback_requests (
  id              uuid        primary key default gen_random_uuid(),
  note_id         uuid        references public.sermon_notes(id) on delete cascade,
  note_title      text,
  requester_id    uuid        references auth.users(id) on delete cascade,
  requester_email text,
  requester_name  text,
  recipient_email text        not null,
  message         text,
  status          text        not null default 'pending',
  created_at      timestamptz not null default now()
);

alter table public.sermon_feedback_requests enable row level security;

drop policy if exists "View own feedback requests"        on public.sermon_feedback_requests;
drop policy if exists "Leaders insert feedback requests"  on public.sermon_feedback_requests;
drop policy if exists "Update feedback request status"    on public.sermon_feedback_requests;

create policy "View own feedback requests" on public.sermon_feedback_requests
  for select to authenticated
  using (requester_id = auth.uid() or lower(recipient_email) = lower(auth.jwt() ->> 'email'));

create policy "Leaders insert feedback requests" on public.sermon_feedback_requests
  for insert to authenticated
  with check (public.is_leader() and requester_id = auth.uid());

create policy "Update feedback request status" on public.sermon_feedback_requests
  for update to authenticated
  using (requester_id = auth.uid() or lower(recipient_email) = lower(auth.jwt() ->> 'email'))
  with check (requester_id = auth.uid() or lower(recipient_email) = lower(auth.jwt() ->> 'email'));

-- ── sermon_feedback ─────────────────────────────────────────────────────────
create table if not exists public.sermon_feedback (
  id             uuid        primary key default gen_random_uuid(),
  note_id        uuid        references public.sermon_notes(id) on delete cascade,
  request_id     uuid        references public.sermon_feedback_requests(id) on delete set null,
  responder_id   uuid        references auth.users(id) on delete cascade,
  responder_email text,
  responder_name  text,
  content        text        not null,
  created_at     timestamptz not null default now()
);

alter table public.sermon_feedback enable row level security;

drop policy if exists "View feedback on visible notes"    on public.sermon_feedback;
drop policy if exists "Authenticated users insert feedback" on public.sermon_feedback;

create policy "View feedback on visible notes" on public.sermon_feedback
  for select to authenticated
  using (
    exists (
      select 1 from public.sermon_notes
      where id = note_id
        and (is_shared = true or user_id = auth.uid())
    )
    or responder_id = auth.uid()
  );

create policy "Authenticated users insert feedback" on public.sermon_feedback
  for insert to authenticated
  with check (responder_id = auth.uid());
