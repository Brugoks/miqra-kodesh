-- Include the newer normal leader role in sermon-note permissions and avoid
-- relying on auth.email(), which is not available in every Supabase project.

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

drop policy if exists "View own feedback requests" on public.sermon_feedback_requests;
drop policy if exists "Update feedback request status" on public.sermon_feedback_requests;

create policy "View own feedback requests" on public.sermon_feedback_requests
  for select to authenticated
  using (
    requester_id = auth.uid()
    or lower(recipient_email) = lower(auth.jwt() ->> 'email')
  );

create policy "Update feedback request status" on public.sermon_feedback_requests
  for update to authenticated
  using (
    requester_id = auth.uid()
    or lower(recipient_email) = lower(auth.jwt() ->> 'email')
  )
  with check (
    requester_id = auth.uid()
    or lower(recipient_email) = lower(auth.jwt() ->> 'email')
  );

