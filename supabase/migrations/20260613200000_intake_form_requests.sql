-- Leader-to-student intake forms. A leader sends a form to specific students;
-- each student fills it out on their dashboard (group + ranked role preferences
-- + availability), and it returns to the leader as a review queue. On approval
-- the response is upserted into leader_roster_preferences for placement.

create table if not exists public.intake_form_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  student_name text,                       -- snapshot of recipient name at send time
  sent_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'submitted', 'approved', 'declined')),
  -- Student response (mirrors leader_roster_preferences):
  gender text check (gender in ('male', 'female')),
  preferences text[],                      -- up to 6 ranked role names
  availability_notes text,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz
);

create index if not exists intake_form_requests_student_idx
  on public.intake_form_requests (student_id, status);
create index if not exists intake_form_requests_org_status_idx
  on public.intake_form_requests (organization_id, status);

alter table public.intake_form_requests enable row level security;

-- Recipient sees their own forms; leaders see their org's forms.
drop policy if exists "intake_forms_select" on public.intake_form_requests;
create policy "intake_forms_select"
  on public.intake_form_requests for select
  to authenticated
  using (
    student_id = auth.uid()
    or (public.is_leader() and organization_id = public.get_my_organization_id())
  );

-- Only leaders create requests, scoped to their org.
drop policy if exists "intake_forms_insert" on public.intake_form_requests;
create policy "intake_forms_insert"
  on public.intake_form_requests for insert
  to authenticated
  with check (
    public.is_leader() and organization_id = public.get_my_organization_id()
  );

-- Recipient can update (to submit their response); leaders can update (to review).
drop policy if exists "intake_forms_update" on public.intake_form_requests;
create policy "intake_forms_update"
  on public.intake_form_requests for update
  to authenticated
  using (
    student_id = auth.uid()
    or (public.is_leader() and organization_id = public.get_my_organization_id())
  )
  with check (
    student_id = auth.uid()
    or (public.is_leader() and organization_id = public.get_my_organization_id())
  );

-- Only leaders delete (e.g. revoke a sent form).
drop policy if exists "intake_forms_delete" on public.intake_form_requests;
create policy "intake_forms_delete"
  on public.intake_form_requests for delete
  to authenticated
  using (
    public.is_leader() and organization_id = public.get_my_organization_id()
  );
