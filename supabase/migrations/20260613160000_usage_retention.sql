-- Database retention policy to keep Postgres well under the 500 MB free-tier cap.
--
-- Scope: TELEMETRY / LOG tables only. We deliberately do NOT auto-delete any
-- user-generated content (chat_messages, discipleship_messages, qa_questions,
-- prayers, journal_entries, etc.) or live state (push_subscriptions) — losing
-- those would be data loss, not cleanup.
--
-- Currently the only unbounded append-only telemetry table is
-- public.api_usage_events. dev_usage_snapshot() only ever reads the current
-- month, so anything older is pure dead weight. We keep a generous 90-day
-- window so short-term trends survive, then prune the rest nightly via pg_cron.
--
-- Note: deletes return space to Postgres for internal reuse; pg_database_size
-- will not necessarily shrink (autovacuum reclaims for reuse, not for the OS).
-- That is expected and fine — the goal is to cap growth, not reclaim disk.

create extension if not exists pg_cron with schema pg_catalog;

-- Prune telemetry older than `retention_days`. Parameterized + idempotent so it
-- can be called ad hoc, from cron, or extended to other log tables later.
create or replace function public.prune_telemetry(retention_days integer default 90)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted bigint := 0;
  cutoff timestamptz := now() - make_interval(days => retention_days);
begin
  delete from public.api_usage_events where created_at < cutoff;
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

comment on function public.prune_telemetry(integer) is
  'Deletes telemetry/log rows older than retention_days (default 90). Telemetry only — never user content.';

-- Restrict execution to the privileged backend; not callable by app users.
revoke all on function public.prune_telemetry(integer) from public;
revoke all on function public.prune_telemetry(integer) from anon;
revoke all on function public.prune_telemetry(integer) from authenticated;

-- (Re)schedule the nightly prune. Unschedule first so this migration is
-- safely re-runnable without duplicating the job.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'prune-telemetry') then
    perform cron.unschedule('prune-telemetry');
  end if;
end;
$$;

select cron.schedule(
  'prune-telemetry',
  '0 3 * * *',  -- daily at 03:00 UTC
  $$select public.prune_telemetry(90)$$
);
