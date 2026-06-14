-- Track when each user last viewed chat, so we can surface a persistent
-- "unseen messages" indicator (in addition to unread @mentions).
alter table public.profiles add column if not exists chat_last_read_at timestamptz;
