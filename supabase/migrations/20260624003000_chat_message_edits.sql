-- Allow authors to update their own chat messages
create policy "chat_messages_update" on public.chat_messages
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());
