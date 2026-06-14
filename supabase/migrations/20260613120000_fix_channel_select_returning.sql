-- Fix: creating a channel failed because the client uses INSERT ... RETURNING
-- (supabase .insert().select()), which runs the SELECT policy on the new row.
-- The policy called can_access_channel(id), which RE-QUERIES chat_channels — and
-- the just-inserted row isn't visible to that nested query yet, so it returned
-- false and blocked the insert. Rewrite the SELECT policy to use the row's own
-- columns directly (no self re-query).

drop policy if exists "chat_channels_select" on public.chat_channels;
create policy "chat_channels_select" on public.chat_channels
  for select to authenticated
  using (
    public.is_developer()
    or created_by = auth.uid()
    or (
      not is_private
      and organization_id in (select organization_id from public.profile_organizations where profile_id = auth.uid())
    )
    or exists (
      select 1 from public.chat_channel_members m
      where m.channel_id = id and m.user_id = auth.uid()
    )
  );
