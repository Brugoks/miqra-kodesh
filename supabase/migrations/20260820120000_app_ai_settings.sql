-- App-wide AI settings table for developer configuration (e.g. default OpenRouter model).
-- Allows developers to switch the active model on the fly from DevTools without a deploy.

create table if not exists public.app_ai_settings (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamptz not null default now()
);

alter table public.app_ai_settings enable row level security;

-- Public read access so clients & functions can read active settings.
drop policy if exists "ai_settings_select_all" on public.app_ai_settings;
create policy "ai_settings_select_all"
  on public.app_ai_settings for select
  using (true);

-- Only authenticated developers can insert, update, or delete settings.
drop policy if exists "ai_settings_developer_all" on public.app_ai_settings;
create policy "ai_settings_developer_all"
  on public.app_ai_settings for all
  to authenticated
  using (public.is_developer())
  with check (public.is_developer());

-- Seed default OpenRouter model setting.
insert into public.app_ai_settings (key, value, description) values
  ('openrouter_model', 'openrouter/free', 'App-wide default OpenRouter model for chat and review passes')
on conflict (key) do nothing;
