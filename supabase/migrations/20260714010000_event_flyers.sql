-- Feature: attach a flyer image to a calendar event.
-- Requested via feedback ("Is there also a way to add a flyer to events?").

alter table public.calendar_events
  add column if not exists flyer_url text;

-- Public bucket for event flyers (same shape as prayer-images / chat-images).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-flyers',
  'event-flyers',
  true,
  5242880,  -- 5 MB
  array['image/png','image/jpeg','image/webp','image/gif','image/heic','image/heif']
)
on conflict (id) do nothing;

-- Uploads land in a per-user folder; the app only exposes the control to
-- leaders/admins, and the calendar_events RLS still gates who can attach it.
create policy "Users upload event flyers" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'event-flyers' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Public read event flyers" on storage.objects
  for select using (bucket_id = 'event-flyers');

create policy "Users delete own event flyers" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'event-flyers' and
    (storage.foldername(name))[1] = auth.uid()::text
  );
