alter table public.attendance_groups
  add column if not exists join_status text not null default 'closed';

alter table public.attendance_groups
  drop constraint if exists attendance_groups_join_status_check;

alter table public.attendance_groups
  add constraint attendance_groups_join_status_check
  check (join_status in ('open', 'closed'));

create table if not exists public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id text not null references public.attendance_groups(id) on delete cascade,
  group_name text not null,
  leader_name text,
  co_leader_name text,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  requester_name text not null,
  requester_email text,
  status text not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_join_requests_status_check check (status in ('pending', 'accepted', 'declined', 'cancelled'))
);

create unique index if not exists group_join_requests_one_pending_idx
  on public.group_join_requests (group_id, requester_id)
  where status = 'pending';

create index if not exists group_join_requests_group_status_idx
  on public.group_join_requests (group_id, status, created_at desc);

create index if not exists group_join_requests_requester_idx
  on public.group_join_requests (requester_id, status);

alter table public.group_join_requests enable row level security;

drop policy if exists "group_join_requests_select" on public.group_join_requests;
create policy "group_join_requests_select"
  on public.group_join_requests for select
  to authenticated
  using (
    requester_id = auth.uid()
    or (public.is_leader() and organization_id = public.get_my_organization_id())
  );

drop policy if exists "group_join_requests_insert" on public.group_join_requests;
create policy "group_join_requests_insert"
  on public.group_join_requests for insert
  to authenticated
  with check (requester_id = auth.uid() and organization_id = public.get_my_organization_id());

drop policy if exists "group_join_requests_update" on public.group_join_requests;
create policy "group_join_requests_update"
  on public.group_join_requests for update
  to authenticated
  using (public.is_leader() and organization_id = public.get_my_organization_id())
  with check (public.is_leader() and organization_id = public.get_my_organization_id());

create or replace function public.join_or_request_attendance_group(p_group_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.attendance_groups%rowtype;
  v_profile public.profiles%rowtype;
  v_member jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to join a group.';
  end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid();

  if v_profile.id is null then
    raise exception 'Profile not found.';
  end if;

  select * into v_group
  from public.attendance_groups
  where id = p_group_id
  for update;

  if v_group.id is null then
    raise exception 'Group not found.';
  end if;

  if not exists (
    select 1
    from public.profile_organizations po
    where po.profile_id = auth.uid()
      and po.organization_id = v_group.organization_id
  ) then
    raise exception 'You do not have access to this organization.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_group.students, '[]'::jsonb)) student
    where student->>'linkedUserId' = auth.uid()::text
  ) then
    return 'already_member';
  end if;

  if v_group.join_status = 'open' then
    v_member := jsonb_build_object(
      'id', 'm-' || replace(auth.uid()::text, '-', ''),
      'name', coalesce(nullif(v_profile.full_name, ''), v_profile.email, 'New Member'),
      'email', coalesce(v_profile.email, ''),
      'linkedUserId', auth.uid()::text,
      'linkedUserName', coalesce(v_profile.full_name, '')
    );

    update public.attendance_groups
    set students = coalesce(students, '[]'::jsonb) || jsonb_build_array(v_member),
        updated_at = now()
    where id = v_group.id;

    update public.group_join_requests
    set status = 'cancelled',
        updated_at = now()
    where group_id = v_group.id
      and requester_id = auth.uid()
      and status = 'pending';

    return 'joined';
  end if;

  insert into public.group_join_requests (
    organization_id,
    group_id,
    group_name,
    leader_name,
    co_leader_name,
    requester_id,
    requester_name,
    requester_email
  )
  values (
    v_group.organization_id,
    v_group.id,
    v_group.name,
    v_group.leader,
    v_group.co_leader,
    auth.uid(),
    coalesce(nullif(v_profile.full_name, ''), v_profile.email, 'New Member'),
    v_profile.email
  )
  on conflict (group_id, requester_id) where status = 'pending'
  do update set
    group_name = excluded.group_name,
    leader_name = excluded.leader_name,
    co_leader_name = excluded.co_leader_name,
    requester_name = excluded.requester_name,
    requester_email = excluded.requester_email,
    updated_at = now();

  return 'requested';
end;
$$;

create or replace function public.approve_group_join_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.group_join_requests%rowtype;
  v_group public.attendance_groups%rowtype;
  v_profile public.profiles%rowtype;
  v_reviewer public.profiles%rowtype;
  v_reviewer_name text;
  v_member jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to approve requests.';
  end if;

  select * into v_reviewer
  from public.profiles
  where id = auth.uid();

  if not public.is_leader() then
    raise exception 'Only leaders can approve group join requests.';
  end if;

  select * into v_request
  from public.group_join_requests
  where id = p_request_id
    and status = 'pending'
  for update;

  if v_request.id is null then
    raise exception 'Pending request not found.';
  end if;

  select * into v_group
  from public.attendance_groups
  where id = v_request.group_id
  for update;

  if v_group.id is null then
    raise exception 'Group not found.';
  end if;

  if v_group.organization_id <> public.get_my_organization_id() then
    raise exception 'You do not have access to this organization.';
  end if;

  v_reviewer_name := lower(trim(coalesce(v_reviewer.full_name, '')));
  if not (
    public.is_admin()
    or coalesce(v_reviewer.role, 'student') in ('developer', 'admin')
    or v_reviewer_name = lower(trim(coalesce(v_group.leader, '')))
    or v_reviewer_name = lower(trim(coalesce(v_group.co_leader, '')))
  ) then
    raise exception 'Only this group''s leader or co-leader can approve this request.';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_request.requester_id;

  if v_profile.id is null then
    raise exception 'Requester profile not found.';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(coalesce(v_group.students, '[]'::jsonb)) student
    where student->>'linkedUserId' = v_request.requester_id::text
  ) then
    v_member := jsonb_build_object(
      'id', 'm-' || replace(v_request.requester_id::text, '-', ''),
      'name', coalesce(nullif(v_profile.full_name, ''), v_profile.email, v_request.requester_name),
      'email', coalesce(v_profile.email, v_request.requester_email, ''),
      'linkedUserId', v_request.requester_id::text,
      'linkedUserName', coalesce(v_profile.full_name, '')
    );

    update public.attendance_groups
    set students = coalesce(students, '[]'::jsonb) || jsonb_build_array(v_member),
        updated_at = now()
    where id = v_group.id;
  end if;

  update public.group_join_requests
  set status = 'accepted',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = v_request.id;
end;
$$;
