alter table public.group_meetings
  add column if not exists discussion_questions text;

comment on column public.group_meetings.discussion_questions is
  'Member-visible discussion questions for this specific Bible Study meeting.';

create or replace function public.upsert_group_meeting_discussion_questions(
  target_group_id text,
  target_meeting_date date,
  target_discussion_questions text
)
returns public.group_meetings
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_meeting public.group_meetings;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.attendance_groups group_row
    where group_row.id = target_group_id
      and group_row.organization_id = public.get_my_organization_id()
      and (
        public.is_leader()
        or exists (
          select 1
          from jsonb_array_elements(coalesce(group_row.students, '[]'::jsonb)) student
          where student->>'linkedUserId' = auth.uid()::text
        )
      )
  ) then
    raise exception 'Not allowed to update discussion questions for this meeting';
  end if;

  insert into public.group_meetings (
    group_id,
    meeting_date,
    discussion_questions,
    updated_by,
    updated_at
  )
  values (
    target_group_id,
    target_meeting_date,
    nullif(btrim(target_discussion_questions), ''),
    auth.uid(),
    now()
  )
  on conflict (group_id, meeting_date)
  do update set
    discussion_questions = excluded.discussion_questions,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning * into updated_meeting;

  return updated_meeting;
end;
$$;

revoke all on function public.upsert_group_meeting_discussion_questions(text, date, text) from public;
grant execute on function public.upsert_group_meeting_discussion_questions(text, date, text) to authenticated;
