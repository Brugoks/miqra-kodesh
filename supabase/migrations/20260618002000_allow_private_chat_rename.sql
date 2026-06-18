-- Migration to allow members of private chats to rename them.
drop policy if exists "chat_channels_update" on public.chat_channels;

create policy "chat_channels_update" on public.chat_channels
  for update to authenticated
  using (
    public.is_developer()
    or public.is_admin()
    or created_by = auth.uid()
    or (is_private = true and public.can_access_channel(id))
  )
  with check (
    public.is_developer()
    or public.is_admin()
    or created_by = auth.uid()
    or (is_private = true and public.can_access_channel(id))
  );
