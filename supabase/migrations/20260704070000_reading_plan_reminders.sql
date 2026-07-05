-- Reading Plans Phase 4: daily reminder push, dispatched by the
-- reading-plan-reminders Edge Function on an hourly pg_cron tick. The
-- function does its own per-user timezone/hour matching and skips anyone
-- who has already read today, so this migration only needs to add the
-- dedup column and register the cron job + auth token.

alter table public.reading_plan_enrollments
  add column if not exists last_reminded_on date;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'reading_plan_reminder_token') then
    perform vault.create_secret(md5(random()::text), 'reading_plan_reminder_token');
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-reading-plan-reminders') then
    perform cron.unschedule('send-reading-plan-reminders');
  end if;
end;
$$;

select cron.schedule(
  'send-reading-plan-reminders',
  '0 * * * *', -- hourly; the function matches each enrollment's own reminder hour/timezone
  $$
  select net.http_post(
    url     := 'https://brtmsozmfboyuxrbwftb.supabase.co/functions/v1/reading-plan-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'reading_plan_reminder_token'),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
