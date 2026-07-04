-- Allow a group's leader/co-leader (or an admin) to decline a pending join
-- request, mirroring the auth checks in approve_group_join_request.

create or replace function public.decline_group_join_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.group_join_requests%rowtype;
  v_group public.attendance_groups%rowtype;
  v_reviewer public.profiles%rowtype;
  v_reviewer_name text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to decline requests.';
  end if;

  select * into v_reviewer
  from public.profiles
  where id = auth.uid();

  if not public.is_leader() then
    raise exception 'Only leaders can decline group join requests.';
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
    raise exception 'Only this group''s leader or co-leader can decline this request.';
  end if;

  update public.group_join_requests
  set status = 'declined',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = v_request.id;
end;
$$;
