-- Migration to support daily facilitator preparation reminders.
-- 1. Add tracking column to group_meetings
alter table public.group_meetings add column if not exists reminder_sent boolean not null default false;

-- 2. Seed email setting toggles (enabled by default) so developers can control them via DevTools
insert into public.app_email_settings (email_type, label, description, sort_order) values
  ('facilitator_assigned', 'Facilitator Assigned', 'Emails a member when they are assigned as facilitator for a meeting.', 70),
  ('facilitator_reminder', 'Facilitator Reminder', 'Emails a facilitator a few days before their scheduled meeting to remind them to prepare.', 80)
on conflict (email_type) do nothing;

-- 3. Create a secure cron token in Vault to authenticate pg_cron requests to our Edge Function
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'reminder_cron_token') then
    perform vault.create_secret(md5(random()::text), 'reminder_cron_token');
  end if;
end;
$$;

-- 4. Register pg_cron daily job to trigger the send-meeting-reminders Edge Function
do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-approaching-meeting-reminders') then
    perform cron.unschedule('send-approaching-meeting-reminders');
  end if;
end;
$$;

select cron.schedule(
  'send-approaching-meeting-reminders',
  '0 8 * * *', -- Daily at 8:00 AM UTC
  $$
  select net.http_post(
    url := 'https://brtmsozmfboyuxrbwftb.supabase.co/functions/v1/send-meeting-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_cron_token'),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
