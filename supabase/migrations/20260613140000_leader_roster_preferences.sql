-- Leader roster preferences: each person ranks six ministry roles.
-- Seeded initially for Charleston Baptist Church from the June 2026 sheet.

create table if not exists public.leader_roster_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_name text not null,
  gender text not null check (gender in ('male', 'female')),
  preferences text[] not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, person_name)
);

alter table public.leader_roster_preferences enable row level security;

drop policy if exists "leader_roster_preferences_select" on public.leader_roster_preferences;
create policy "leader_roster_preferences_select"
  on public.leader_roster_preferences for select
  to authenticated
  using (
    public.is_leader()
    and organization_id = public.get_my_organization_id()
  );

drop policy if exists "leader_roster_preferences_insert" on public.leader_roster_preferences;
create policy "leader_roster_preferences_insert"
  on public.leader_roster_preferences for insert
  to authenticated
  with check (
    public.is_leader()
    and organization_id = public.get_my_organization_id()
  );

drop policy if exists "leader_roster_preferences_update" on public.leader_roster_preferences;
create policy "leader_roster_preferences_update"
  on public.leader_roster_preferences for update
  to authenticated
  using (
    public.is_leader()
    and organization_id = public.get_my_organization_id()
  )
  with check (
    public.is_leader()
    and organization_id = public.get_my_organization_id()
  );

drop policy if exists "leader_roster_preferences_delete" on public.leader_roster_preferences;
create policy "leader_roster_preferences_delete"
  on public.leader_roster_preferences for delete
  to authenticated
  using (
    public.is_leader()
    and organization_id = public.get_my_organization_id()
  );

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leader_roster_preferences_touch_updated_at on public.leader_roster_preferences;
create trigger leader_roster_preferences_touch_updated_at
  before update on public.leader_roster_preferences
  for each row execute function public.touch_updated_at();

with charleston as (
  select id as organization_id
  from public.organizations
  where slug = 'charleston-baptist'
     or name = 'Charleston Baptist Church'
  order by created_at
  limit 1
),
seed(person_name, gender, preferences) as (
  values
    ('Reid Scott', 'male', array['Tech and Media', 'Life Group Leader', 'Band', 'Teaching', 'Welcoming', 'Event Coordinating']),
    ('Noah Crowe', 'male', array['Life Group Leader', 'Tech and Media', 'Welcoming', 'Teaching', 'Event Coordinating', 'Band']),
    ('Brayden Burn', 'male', array['Band', 'Tech and Media', 'Event Coordinating', 'Welcoming', 'Life Group Leader', 'Teaching']),
    ('Andrew Ethredge', 'male', array[null, 'Tech and Media', 'Welcoming', 'Event Coordinating', null, null]::text[]),
    ('Sloan Pursell', 'male', array['Life Group Leader', 'Teaching', 'Welcoming', 'Band', 'Tech and Media', 'Event Coordinating']),
    ('Finn Pollett', 'male', array['Event Coordinating', 'Teaching', 'Welcoming', 'Life Group Leader', 'Tech and Media', 'Band']),
    ('Sullivan Davis', 'male', array['Life Group Leader', 'Welcoming', 'Band', 'Tech and Media', 'Event Coordinating', 'Teaching']),
    ('Eli Giordano', 'male', array['Band', 'Welcoming', 'Teaching', 'Life Group Leader', 'Event Coordinating', 'Tech and Media']),
    ('Addie Shaffer', 'female', array['Band', 'Life Group Leader', 'Welcoming', 'Event Coordinating', 'Tech and Media', 'Teaching']),
    ('AP Watford', 'female', array['Band', 'Life Group Leader', 'Teaching', 'Welcoming', 'Event Coordinating', 'Tech and Media']),
    ('Eliza Giordano', 'female', array['Life Group Leader', 'Event Coordinating', 'Band', 'Welcoming', 'Tech and Media', 'Teaching']),
    ('Ka''lashia Stoudenmire', 'female', array['Welcoming', 'Life Group Leader', 'Event Coordinating', 'Band', 'Teaching', 'Tech and Media']),
    ('Chloe Jackson', 'female', array['Life Group Leader', 'Welcoming', 'Event Coordinating', 'Teaching', 'Tech and Media', 'Band']),
    ('Elizabeth Whatford', 'female', array['Life Group Leader', 'Teaching', 'Welcoming', 'Band', 'Event Coordinating', 'Tech and Media']),
    ('Claire Ethredge', 'female', array['Life Group Leader', 'Welcoming', 'Teaching', 'Event Coordinating', 'Band', 'Tech and Media']),
    ('Grace Sronce', 'female', array['Life Group Leader', 'Band', 'Event Coordinating', 'Welcoming', 'Teaching', 'Tech and Media'])
)
insert into public.leader_roster_preferences (organization_id, person_name, gender, preferences)
select charleston.organization_id, seed.person_name, seed.gender, seed.preferences
from seed
cross join charleston
on conflict (organization_id, person_name) do update set
  gender = excluded.gender,
  preferences = excluded.preferences,
  updated_at = now();
