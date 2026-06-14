-- Leader role assignment matrix for Charleston Baptist Church.
-- This complements preference rankings with actual seeded role coverage.

create table if not exists public.leader_role_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_name text not null,
  female_assignees text[] not null default '{}'::text[],
  male_assignees text[] not null default '{}'::text[],
  adult_leaders text[] not null default '{}'::text[],
  position integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, role_name)
);

alter table public.leader_role_assignments enable row level security;

drop policy if exists "leader_role_assignments_select" on public.leader_role_assignments;
create policy "leader_role_assignments_select"
  on public.leader_role_assignments for select
  to authenticated
  using (
    public.is_leader()
    and organization_id = public.get_my_organization_id()
  );

drop policy if exists "leader_role_assignments_insert" on public.leader_role_assignments;
create policy "leader_role_assignments_insert"
  on public.leader_role_assignments for insert
  to authenticated
  with check (
    public.is_leader()
    and organization_id = public.get_my_organization_id()
  );

drop policy if exists "leader_role_assignments_update" on public.leader_role_assignments;
create policy "leader_role_assignments_update"
  on public.leader_role_assignments for update
  to authenticated
  using (
    public.is_leader()
    and organization_id = public.get_my_organization_id()
  )
  with check (
    public.is_leader()
    and organization_id = public.get_my_organization_id()
  );

drop policy if exists "leader_role_assignments_delete" on public.leader_role_assignments;
create policy "leader_role_assignments_delete"
  on public.leader_role_assignments for delete
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

drop trigger if exists leader_role_assignments_touch_updated_at on public.leader_role_assignments;
create trigger leader_role_assignments_touch_updated_at
  before update on public.leader_role_assignments
  for each row execute function public.touch_updated_at();

with charleston as (
  select id as organization_id
  from public.organizations
  where slug = 'charleston-baptist'
     or name = 'Charleston Baptist Church'
  order by created_at
  limit 1
),
seed(role_name, female_assignees, male_assignees, adult_leaders, position) as (
  values
    ('High School Leader 1', '{}'::text[], '{}'::text[], '{}'::text[], 10),
    ('High School Leader 2', array['Anna Pearl Watford'], array['Noah Crowe'], '{}'::text[], 20),
    ('Middle School Leader 1', array['Addie Shaffer', 'Chloe Jackson'], array['Reid Scott', 'Sloan Pursell'], '{}'::text[], 30),
    ('Middle School Leader 2', array['Eliza Giordano', 'Zippie'], array['Brayden Burn', 'Sullivan Davis'], '{}'::text[], 40),
    ('Music Leaders', array['Addie Shaffer'], array['Brayden Burn'], '{}'::text[], 50),
    ('Welcoming', array['Ka''lashia Stoudenmire'], array['Eli Giordano'], '{}'::text[], 60),
    ('Media', array['Addie Shaffer'], array['??'], '{}'::text[], 70),
    ('Sound', array['Noah Crowe'], array['Noah Turner'], '{}'::text[], 80),
    ('Slides', array['Reid Scott'], array['Brayden Burn'], '{}'::text[], 90),
    ('Event Coordinating', array['Eliza Giordano'], array['Finn Pollett'], '{}'::text[], 100),
    ('Teaching', array['Zippie Watford'], array['Sloan Pursell', 'Finn Pollett'], '{}'::text[], 110)
)
insert into public.leader_role_assignments (
  organization_id,
  role_name,
  female_assignees,
  male_assignees,
  adult_leaders,
  position
)
select
  charleston.organization_id,
  seed.role_name,
  seed.female_assignees,
  seed.male_assignees,
  seed.adult_leaders,
  seed.position
from seed
cross join charleston
on conflict (organization_id, role_name) do update set
  female_assignees = excluded.female_assignees,
  male_assignees = excluded.male_assignees,
  adult_leaders = excluded.adult_leaders,
  position = excluded.position,
  updated_at = now();
