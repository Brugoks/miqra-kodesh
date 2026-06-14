-- Lifecycle cleanup: when a chat message is deleted, its uploaded image becomes
-- an orphan in the chat-images Storage bucket (Storage has its own 1GB quota).
-- A DB trigger can't delete the physical file (that needs the Storage API), so it
-- records the orphan's path in a queue that the `storage-gc` edge function drains
-- on a schedule using the service role.
--
-- Using a queue (rather than a client-side delete) means EVERY deletion path is
-- covered: a member deleting their own message, a leader deleting someone else's,
-- and channel deletion cascading to its messages — the AFTER DELETE trigger fires
-- per row in all cases.

create table if not exists public.storage_gc_queue (
  id bigint generated always as identity primary key,
  bucket_id text not null,
  object_path text not null,
  queued_at timestamptz not null default now()
);

-- Locked down: only the SECURITY DEFINER trigger (insert) and the service role
-- (drain, which bypasses RLS) touch this table. No policies = no client access.
alter table public.storage_gc_queue enable row level security;

create or replace function public.enqueue_chat_image_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  marker constant text := '/storage/v1/object/public/chat-images/';
  idx int;
  path text;
begin
  if old.image_url is null then
    return old;
  end if;

  idx := position(marker in old.image_url);
  if idx = 0 then
    return old;  -- not a chat-images URL we recognize; leave it alone
  end if;

  path := substring(old.image_url from idx + length(marker));
  path := split_part(path, '?', 1);  -- strip any querystring

  if path <> '' then
    insert into public.storage_gc_queue (bucket_id, object_path)
    values ('chat-images', path);
  end if;

  return old;
end;
$$;

drop trigger if exists trg_chat_image_gc on public.chat_messages;
create trigger trg_chat_image_gc
  after delete on public.chat_messages
  for each row
  execute function public.enqueue_chat_image_deletion();

-- Drain the queue every 10 minutes by invoking the storage-gc edge function.
-- The shared token lives in Vault (name 'storage_gc_token') and as the function's
-- STORAGE_GC_TOKEN secret; until both are set the call simply 401s and retries.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'drain-storage-gc') then
    perform cron.unschedule('drain-storage-gc');
  end if;
end;
$$;

select cron.schedule(
  'drain-storage-gc',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://brtmsozmfboyuxrbwftb.supabase.co/functions/v1/storage-gc',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-gc-token', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'storage_gc_token'),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
