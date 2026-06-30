-- Prayer Wall management: OP/leader edits, updates, and archiving.

alter table public.prayers
  add column if not exists updated_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

create index if not exists prayers_archived_at_idx
  on public.prayers (organization_id, archived_at);

create or replace function public.prayers_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists prayers_touch_updated_at on public.prayers;
create trigger prayers_touch_updated_at
  before update on public.prayers
  for each row execute function public.prayers_touch_updated_at();

drop policy if exists "prayers_update" on public.prayers;
create policy "prayers_update"
  on public.prayers for update
  to authenticated
  using (
    public.is_developer()
    or (
      organization_id = public.get_my_organization_id()
      and (auth.uid() = user_id or public.is_leader())
    )
  )
  with check (
    public.is_developer()
    or (
      organization_id = public.get_my_organization_id()
      and (auth.uid() = user_id or public.is_leader())
    )
  );

drop policy if exists "Users and admins delete prayers" on public.prayers;
drop policy if exists "prayers_delete" on public.prayers;
create policy "prayers_delete"
  on public.prayers for delete
  to authenticated
  using (
    public.is_developer()
    or (
      organization_id = public.get_my_organization_id()
      and (auth.uid() = user_id or public.is_admin())
    )
  );

create table if not exists public.prayer_updates (
  id uuid primary key default gen_random_uuid(),
  prayer_id text not null references public.prayers(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  body text not null,
  organization_id uuid references public.organizations(id),
  created_at timestamptz not null default now()
);

alter table public.prayer_updates enable row level security;

update public.prayer_updates pu
set organization_id = p.organization_id
from public.prayers p
where pu.prayer_id = p.id
  and pu.organization_id is null;

alter table public.prayer_updates alter column organization_id set not null;

create index if not exists prayer_updates_prayer_created_idx
  on public.prayer_updates (prayer_id, created_at);
create index if not exists prayer_updates_org_idx
  on public.prayer_updates (organization_id);

drop trigger if exists prayer_updates_set_org on public.prayer_updates;
create trigger prayer_updates_set_org
  before insert on public.prayer_updates
  for each row execute function public.set_organization_id();

drop policy if exists "prayer_updates_select" on public.prayer_updates;
create policy "prayer_updates_select"
  on public.prayer_updates for select
  to authenticated
  using (
    public.is_developer()
    or (
      organization_id = public.get_my_organization_id()
      and exists (
        select 1
        from public.prayers p
        where p.id = prayer_updates.prayer_id
      )
    )
  );

drop policy if exists "prayer_updates_insert" on public.prayer_updates;
create policy "prayer_updates_insert"
  on public.prayer_updates for insert
  to authenticated
  with check (
    public.is_developer()
    or (
      organization_id = public.get_my_organization_id()
      and user_id = auth.uid()
      and exists (
        select 1
        from public.prayers p
        where p.id = prayer_updates.prayer_id
          and p.organization_id = prayer_updates.organization_id
          and (p.user_id = auth.uid() or public.is_leader())
      )
    )
  );

drop policy if exists "prayer_updates_update" on public.prayer_updates;
create policy "prayer_updates_update"
  on public.prayer_updates for update
  to authenticated
  using (
    public.is_developer()
    or (
      organization_id = public.get_my_organization_id()
      and (user_id = auth.uid() or public.is_leader())
    )
  )
  with check (
    public.is_developer()
    or (
      organization_id = public.get_my_organization_id()
      and (user_id = auth.uid() or public.is_leader())
    )
  );

drop policy if exists "prayer_updates_delete" on public.prayer_updates;
create policy "prayer_updates_delete"
  on public.prayer_updates for delete
  to authenticated
  using (
    public.is_developer()
    or (
      organization_id = public.get_my_organization_id()
      and (user_id = auth.uid() or public.is_leader())
    )
  );
