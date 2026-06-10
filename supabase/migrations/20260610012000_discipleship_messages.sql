-- Simple user-to-user mail for the discipleship feature.

create table if not exists public.discipleship_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_email text not null default '',
  sender_name text,
  recipient_id uuid references auth.users(id) on delete set null,
  recipient_email text not null default '',
  recipient_name text,
  subject text not null default '',
  body text not null default '',
  status text not null default 'draft' check (status in ('draft', 'sent')),
  read_at timestamptz,
  sent_at timestamptz,
  sender_trashed_at timestamptz,
  recipient_trashed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists discipleship_messages_sender_idx
  on public.discipleship_messages (sender_id, updated_at desc);

create index if not exists discipleship_messages_recipient_idx
  on public.discipleship_messages (recipient_id, updated_at desc);

create index if not exists discipleship_messages_recipient_email_idx
  on public.discipleship_messages (lower(recipient_email), updated_at desc);

alter table public.discipleship_messages enable row level security;

drop policy if exists "Users read their discipleship messages" on public.discipleship_messages;
create policy "Users read their discipleship messages"
  on public.discipleship_messages for select
  to authenticated
  using (
    sender_id = auth.uid()
    or recipient_id = auth.uid()
    or lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "Users create their discipleship messages" on public.discipleship_messages;
create policy "Users create their discipleship messages"
  on public.discipleship_messages for insert
  to authenticated
  with check (sender_id = auth.uid());

drop policy if exists "Users update their discipleship messages" on public.discipleship_messages;
create policy "Users update their discipleship messages"
  on public.discipleship_messages for update
  to authenticated
  using (
    sender_id = auth.uid()
    or recipient_id = auth.uid()
    or lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    sender_id = auth.uid()
    or recipient_id = auth.uid()
    or lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "Users delete their discipleship messages" on public.discipleship_messages;
create policy "Users delete their discipleship messages"
  on public.discipleship_messages for delete
  to authenticated
  using (
    sender_id = auth.uid()
    or recipient_id = auth.uid()
    or lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "Authenticated users view profiles for discipleship mail" on public.profiles;
create policy "Authenticated users view profiles for discipleship mail"
  on public.profiles for select
  to authenticated
  using (true);
