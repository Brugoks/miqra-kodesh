-- Developer-managed on/off switches for each transactional email category sent
-- via Resend. The send-email path checks app_email_settings.enabled before
-- sending, so a developer can disable a category from DevTools without a deploy.
-- App-global (not org-scoped) to match DevTools' developer-wide scope.

create table if not exists public.app_email_settings (
  email_type text primary key,
  label text not null,
  description text,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.app_email_settings enable row level security;

-- Only developers can view/manage these switches.
drop policy if exists "email_settings_developer_select" on public.app_email_settings;
create policy "email_settings_developer_select"
  on public.app_email_settings for select
  to authenticated
  using (public.is_developer());

drop policy if exists "email_settings_developer_update" on public.app_email_settings;
create policy "email_settings_developer_update"
  on public.app_email_settings for update
  to authenticated
  using (public.is_developer())
  with check (public.is_developer());

-- Seed the known email categories (enabled by default; edit from DevTools).
insert into public.app_email_settings (email_type, label, description, sort_order) values
  ('intake_form_sent',      'Volunteer intake form sent',  'Emails a student when a leader sends them an intake form to fill out.', 10),
  ('feedback_ticket_update','Feedback ticket updates',     'Notifies the author when their feedback ticket changes status or gets a reply.', 20),
  ('chat_mention_fallback', 'Chat @mention (email backup)', 'Emails a mentioned member only when they have no push subscription enabled.', 30),
  ('weekly_meeting_digest', 'Weekly meeting digest',       'A weekly summary of each group''s next meeting, facilitator, and agenda.', 40),
  ('discipleship_message',  'New discipleship message',    'Notifies a member when they receive a new discipleship inbox message.', 50),
  ('qa_answer',             'Answer to your question',     'Notifies a member when their Q&A question receives a new answer.', 60)
on conflict (email_type) do nothing;
