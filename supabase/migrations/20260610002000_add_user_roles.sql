-- Ensure is_admin helper exists (may not have been created if tables were set up manually)
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'markquiambao@gmail.com';
$$;

-- Add role column to profiles
alter table public.profiles
  add column if not exists role text not null default 'student';

-- Seed admin role for the app owner
update public.profiles
  set role = 'admin'
  where email = 'markquiambao@gmail.com';

-- Update handle_new_user trigger to include role on insert
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, provider, role, created_at, updated_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    new.raw_app_meta_data->>'provider',
    'student',
    new.created_at,
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    provider = coalesce(excluded.provider, public.profiles.provider),
    updated_at = now();
  return new;
end;
$$;

-- Helper: returns true if the current user can create calendar events
create or replace function public.can_create_events()
returns boolean
language sql
stable
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'student'
  ) in ('admin', 'student_leader', 'parent_leader')
$$;

-- Allow admin to update any profile's role field
drop policy if exists "Admin update roles" on public.profiles;
create policy "Admin update roles"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Split calendar_events management policy so leaders can insert but only admin deletes/updates
drop policy if exists "Admins manage calendar events" on public.calendar_events;

create policy "Leaders and admins create calendar events"
  on public.calendar_events for insert
  to authenticated
  with check (public.can_create_events());

create policy "Admins update calendar events"
  on public.calendar_events for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins delete calendar events"
  on public.calendar_events for delete
  to authenticated
  using (public.is_admin());
