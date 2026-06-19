-- Allow an organization to use an existing Discord server in place of the
-- native chat module. When discord_enabled is true and a guild id is present,
-- the /chat route renders an embedded WidgetBot Discord client (full channels,
-- message history, mentions, and sending) instead of native chat.
--   discord_guild_id   - Discord server (guild) ID
--   discord_channel_id - default channel the embed opens to (optional)
alter table public.organizations
  add column if not exists discord_enabled boolean not null default false,
  add column if not exists discord_guild_id text,
  add column if not exists discord_channel_id text;
