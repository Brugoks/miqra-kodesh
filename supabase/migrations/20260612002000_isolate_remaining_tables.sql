-- Migration to isolate sermon notes, sermon feedback, and discipleship messages by organization,
-- and fix profiles RLS leak.

-- 1. Drop the leaking RLS policy on profiles table
drop policy if exists "Authenticated users view profiles for discipleship mail" on public.profiles;

-- 2. Add organization_id column to tables
alter table public.sermon_notes add column if not exists organization_id uuid references public.organizations(id);
alter table public.sermon_feedback_requests add column if not exists organization_id uuid references public.organizations(id);
alter table public.sermon_feedback add column if not exists organization_id uuid references public.organizations(id);
alter table public.discipleship_messages add column if not exists organization_id uuid references public.organizations(id);

-- 3. Update existing rows to default organization (Charleston Baptist Church)
update public.sermon_notes set organization_id = public.get_default_organization_id() where organization_id is null;
update public.sermon_feedback_requests set organization_id = public.get_default_organization_id() where organization_id is null;
update public.sermon_feedback set organization_id = public.get_default_organization_id() where organization_id is null;
update public.discipleship_messages set organization_id = public.get_default_organization_id() where organization_id is null;

-- 4. Make organization_id NOT NULL
alter table public.sermon_notes alter column organization_id set not null;
alter table public.sermon_feedback_requests alter column organization_id set not null;
alter table public.sermon_feedback alter column organization_id set not null;
alter table public.discipleship_messages alter column organization_id set not null;

-- 5. Create triggers to automatically stamp organization_id on insert
create trigger sermon_notes_set_org before insert on public.sermon_notes
  for each row execute function public.set_organization_id();

create trigger sermon_feedback_requests_set_org before insert on public.sermon_feedback_requests
  for each row execute function public.set_organization_id();

create trigger sermon_feedback_set_org before insert on public.sermon_feedback
  for each row execute function public.set_organization_id();

create trigger discipleship_messages_set_org before insert on public.discipleship_messages
  for each row execute function public.set_organization_id();

-- 6. Drop old RLS policies for these tables
drop policy if exists "View shared or own notes" on public.sermon_notes;
drop policy if exists "Insert own notes" on public.sermon_notes;
drop policy if exists "Update own notes" on public.sermon_notes;
drop policy if exists "Delete own notes" on public.sermon_notes;

drop policy if exists "View own requests" on public.sermon_feedback_requests;
drop policy if exists "Insert feedback requests" on public.sermon_feedback_requests;
drop policy if exists "Update request status" on public.sermon_feedback_requests;

drop policy if exists "View feedback on visible notes" on public.sermon_feedback;
drop policy if exists "Insert feedback" on public.sermon_feedback;

drop policy if exists "Users read their discipleship messages" on public.discipleship_messages;
drop policy if exists "Users create their discipleship messages" on public.discipleship_messages;
drop policy if exists "Users update their discipleship messages" on public.discipleship_messages;
drop policy if exists "Users delete their discipleship messages" on public.discipleship_messages;

-- 7. Define organization-aware RLS policies with developer bypass

-- Sermon Notes policies
create policy "sermon_notes_select" on public.sermon_notes
  for select to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and (is_shared = true or user_id = auth.uid())));

create policy "sermon_notes_insert" on public.sermon_notes
  for insert to authenticated
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and user_id = auth.uid()));

create policy "sermon_notes_update" on public.sermon_notes
  for update to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and user_id = auth.uid()))
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and user_id = auth.uid()));

create policy "sermon_notes_delete" on public.sermon_notes
  for delete to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and user_id = auth.uid()));

-- Sermon Feedback Requests policies
create policy "sermon_feedback_requests_select" on public.sermon_feedback_requests
  for select to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and (requester_id = auth.uid() or lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', '')))));

create policy "sermon_feedback_requests_insert" on public.sermon_feedback_requests
  for insert to authenticated
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and requester_id = auth.uid()));

create policy "sermon_feedback_requests_update" on public.sermon_feedback_requests
  for update to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))))
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))));

-- Sermon Feedback policies
create policy "sermon_feedback_select" on public.sermon_feedback
  for select to authenticated
  using (
    public.is_developer() or (
      organization_id = public.get_my_organization_id() and (
        exists (select 1 from public.sermon_notes where id = note_id and (is_shared = true or user_id = auth.uid()))
        or responder_id = auth.uid()
      )
    )
  );

create policy "sermon_feedback_insert" on public.sermon_feedback
  for insert to authenticated
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and responder_id = auth.uid()));

-- Discipleship Messages policies
create policy "discipleship_messages_select" on public.discipleship_messages
  for select to authenticated
  using (
    public.is_developer() or (
      organization_id = public.get_my_organization_id() and (
        sender_id = auth.uid()
        or recipient_id = auth.uid()
        or lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    )
  );

create policy "discipleship_messages_insert" on public.discipleship_messages
  for insert to authenticated
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and sender_id = auth.uid()));

create policy "discipleship_messages_update" on public.discipleship_messages
  for update to authenticated
  using (
    public.is_developer() or (
      organization_id = public.get_my_organization_id() and (
        sender_id = auth.uid()
        or recipient_id = auth.uid()
        or lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    )
  )
  with check (
    public.is_developer() or (
      organization_id = public.get_my_organization_id() and (
        sender_id = auth.uid()
        or recipient_id = auth.uid()
        or lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    )
  );

create policy "discipleship_messages_delete" on public.discipleship_messages
  for delete to authenticated
  using (
    public.is_developer() or (
      organization_id = public.get_my_organization_id() and (
        sender_id = auth.uid()
        or recipient_id = auth.uid()
        or lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    )
  );
