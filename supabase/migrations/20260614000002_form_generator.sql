-- Dynamic Form Templates
create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null,
  description text,
  fields jsonb not null default '[]'::jsonb, -- Array of field descriptors: [{id, type, label, required, placeholder, options}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Individual Form Assignments / Submissions
create table if not exists public.form_assignments (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  sent_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'submitted', 'approved', 'rejected')),
  responses jsonb not null default '{}'::jsonb, -- Map of { fieldId: value }
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_notes text
);

-- Performance indices
create index if not exists forms_org_idx on public.forms(organization_id);
create index if not exists form_assignments_student_idx on public.form_assignments(student_id, status);
create index if not exists form_assignments_org_idx on public.form_assignments(organization_id, status);
create index if not exists form_assignments_form_idx on public.form_assignments(form_id);

-- Enable RLS
alter table public.forms enable row level security;
alter table public.form_assignments enable row level security;

-- RLS Policies for forms
drop policy if exists "forms_select" on public.forms;
create policy "forms_select"
  on public.forms for select
  to authenticated
  using (organization_id = public.get_my_organization_id());

drop policy if exists "forms_insert" on public.forms;
create policy "forms_insert"
  on public.forms for insert
  to authenticated
  with check (public.is_leader() and organization_id = public.get_my_organization_id());

drop policy if exists "forms_update" on public.forms;
create policy "forms_update"
  on public.forms for update
  to authenticated
  using (public.is_leader() and organization_id = public.get_my_organization_id());

drop policy if exists "forms_delete" on public.forms;
create policy "forms_delete"
  on public.forms for delete
  to authenticated
  using (public.is_leader() and organization_id = public.get_my_organization_id());

-- RLS Policies for form_assignments
drop policy if exists "form_assignments_select" on public.form_assignments;
create policy "form_assignments_select"
  on public.form_assignments for select
  to authenticated
  using (
    student_id = auth.uid()
    or (public.is_leader() and organization_id = public.get_my_organization_id())
  );

drop policy if exists "form_assignments_insert" on public.form_assignments;
create policy "form_assignments_insert"
  on public.form_assignments for insert
  to authenticated
  with check (
    public.is_leader() and organization_id = public.get_my_organization_id()
  );

drop policy if exists "form_assignments_update" on public.form_assignments;
create policy "form_assignments_update"
  on public.form_assignments for update
  to authenticated
  using (
    student_id = auth.uid()
    or (public.is_leader() and organization_id = public.get_my_organization_id())
  )
  with check (
    student_id = auth.uid()
    or (public.is_leader() and organization_id = public.get_my_organization_id())
  );

drop policy if exists "form_assignments_delete" on public.form_assignments;
create policy "form_assignments_delete"
  on public.form_assignments for delete
  to authenticated
  using (
    public.is_leader() and organization_id = public.get_my_organization_id()
  );
