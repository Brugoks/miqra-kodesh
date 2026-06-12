-- Migration to isolate polls and poll_votes by organization.

-- 1. Add organization_id column to polls and poll_votes referencing public.organizations(id)
alter table public.polls add column if not exists organization_id uuid references public.organizations(id);
alter table public.poll_votes add column if not exists organization_id uuid references public.organizations(id);

-- 2. Update existing rows to default organization (Charleston Baptist Church)
update public.polls set organization_id = public.get_default_organization_id() where organization_id is null;
update public.poll_votes set organization_id = public.get_default_organization_id() where organization_id is null;

-- 3. Make organization_id NOT NULL
alter table public.polls alter column organization_id set not null;
alter table public.poll_votes alter column organization_id set not null;

-- 4. Create trigger to automatically stamp organization_id on insert
create trigger polls_set_org before insert on public.polls
  for each row execute function public.set_organization_id();

create trigger poll_votes_set_org before insert on public.poll_votes
  for each row execute function public.set_organization_id();

-- 5. Drop old RLS policies
drop policy if exists "polls_select" on public.polls;
drop policy if exists "poll_votes_select" on public.poll_votes;
drop policy if exists "polls_insert" on public.polls;
drop policy if exists "polls_update" on public.polls;
drop policy if exists "polls_delete" on public.polls;
drop policy if exists "poll_votes_insert" on public.poll_votes;
drop policy if exists "poll_votes_delete" on public.poll_votes;

-- 6. Create new organization-aware RLS policies with developer bypass
create policy "polls_select" on public.polls
  for select to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

create policy "poll_votes_select" on public.poll_votes
  for select to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

create policy "polls_insert" on public.polls
  for insert to authenticated
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and (public.is_leader() or public.is_admin())));

create policy "polls_update" on public.polls
  for update to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and (public.is_leader() or public.is_admin())))
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and (public.is_leader() or public.is_admin())));

create policy "polls_delete" on public.polls
  for delete to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and public.is_admin()));

create policy "poll_votes_insert" on public.poll_votes
  for insert to authenticated
  with check (public.is_developer() or (organization_id = public.get_my_organization_id() and user_id = auth.uid()));

create policy "poll_votes_delete" on public.poll_votes
  for delete to authenticated
  using (public.is_developer() or (organization_id = public.get_my_organization_id() and user_id = auth.uid()));
