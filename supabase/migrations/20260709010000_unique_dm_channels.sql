-- Deterministic DM channels (dm-xxxxxxxx-xxxxxxxx) must be unique per org.
-- The chat deep-link resolves a DM by its name; without a constraint, a race
-- on first load created duplicate channels that split the conversation.

-- Fold any existing duplicates into the oldest channel per (org, name):
-- move messages and members over, then drop the newer copies.
do $$
declare d record;
begin
  for d in
    select id, keep_id from (
      select id,
             first_value(id) over (partition by organization_id, name order by created_at, id) as keep_id
      from public.chat_channels
      where is_private and name ~ '^dm-[0-9a-f]{8}-[0-9a-f]{8}$'
    ) ranked
    where id <> keep_id
  loop
    update public.chat_messages set channel_id = d.keep_id where channel_id = d.id;
    insert into public.chat_channel_members (channel_id, user_id, added_by)
      select d.keep_id, user_id, added_by
      from public.chat_channel_members
      where channel_id = d.id
    on conflict (channel_id, user_id) do nothing;
    delete from public.chat_channels where id = d.id;
  end loop;
end $$;

create unique index if not exists chat_channels_org_dm_name_key
  on public.chat_channels (organization_id, name)
  where is_private and name ~ '^dm-[0-9a-f]{8}-[0-9a-f]{8}$';
