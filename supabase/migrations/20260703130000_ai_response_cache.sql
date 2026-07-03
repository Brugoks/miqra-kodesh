-- Shared cache for deterministic AI responses (Gemini insights, discussion
-- questions, verse commentary). The same passage asked by any user returns
-- the cached answer instead of a fresh Gemini call. Keys embed the model and
-- prompt version, so prompt upgrades invalidate naturally. Only the edge
-- functions (service role) read or write.

create table public.ai_response_cache (
  cache_key  text        primary key,
  payload    jsonb       not null,
  created_at timestamptz not null default now()
);

alter table public.ai_response_cache enable row level security;
-- No policies: client roles get nothing; edge functions use the service role.

create or replace function public.prune_ai_response_cache()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.ai_response_cache where created_at < now() - interval '90 days';
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'prune-ai-response-cache') then
    perform cron.unschedule('prune-ai-response-cache');
  end if;
end;
$$;

select cron.schedule(
  'prune-ai-response-cache',
  '45 3 * * 0', -- Sundays at 03:45 UTC
  $$select public.prune_ai_response_cache()$$
);
