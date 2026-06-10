create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists avatar_url text,
  add column if not exists provider text,
  add column if not exists role text not null default 'student',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'markquiambao@gmail.com';
$$;

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
    case
      when new.email = 'markquiambao@gmail.com' then 'admin'
      else 'student'
    end,
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    provider = coalesce(excluded.provider, public.profiles.provider),
    role = case
      when excluded.email = 'markquiambao@gmail.com' then 'admin'
      else public.profiles.role
    end,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, email, full_name, avatar_url, provider, role, created_at, updated_at)
select
  id,
  email,
  coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1)),
  raw_user_meta_data->>'avatar_url',
  raw_app_meta_data->>'provider',
  case when email = 'markquiambao@gmail.com' then 'admin' else 'student' end,
  coalesce(created_at, now()),
  now()
from auth.users
on conflict (id) do update set
  email = excluded.email,
  full_name = coalesce(excluded.full_name, public.profiles.full_name),
  avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
  provider = coalesce(excluded.provider, public.profiles.provider),
  role = case
    when excluded.email = 'markquiambao@gmail.com' then 'admin'
    else public.profiles.role
  end,
  updated_at = now();

update public.profiles
  set role = 'admin',
      updated_at = now()
  where email = 'markquiambao@gmail.com';
