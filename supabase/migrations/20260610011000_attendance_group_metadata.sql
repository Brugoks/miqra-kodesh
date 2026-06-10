-- Full group profile metadata for small group scheduling and study focus.

alter table public.attendance_groups
  add column if not exists meeting_day text,
  add column if not exists meeting_time text,
  add column if not exists frequency text not null default 'Weekly',
  add column if not exists topic text,
  add column if not exists co_leader text;

update public.attendance_groups
set
  meeting_day = coalesce(meeting_day, case id
    when 'boys' then 'Wednesday'
    when 'girls' then 'Wednesday'
    when 'middle' then 'Sunday'
    else null
  end),
  meeting_time = coalesce(meeting_time, case id
    when 'boys' then '6:30 PM'
    when 'girls' then '6:30 PM'
    when 'middle' then '9:30 AM'
    else null
  end),
  frequency = coalesce(frequency, 'Weekly'),
  topic = coalesce(topic, case id
    when 'boys' then 'Walking in Unity (Ephesians 4)'
    when 'girls' then 'Walking in Unity (Ephesians 4)'
    when 'middle' then 'Faith Under Pressure'
    else null
  end);

