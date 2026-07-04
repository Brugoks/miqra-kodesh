-- Let channel co-members read each other's per-channel read stamps so the
-- client can render lightweight read receipts. Writes stay self-only.

drop policy if exists "chat_channel_reads_select" on public.chat_channel_reads;
create policy "chat_channel_reads_select" on public.chat_channel_reads
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_developer()
    or exists (
      select 1
      from public.chat_channels c
      where c.id = channel_id
        and (
          c.created_by = auth.uid()
          or exists (
            select 1
            from public.chat_channel_members me
            where me.channel_id = c.id and me.user_id = auth.uid()
          )
          or (
            not c.is_private
            and exists (
              select 1
              from public.profile_organizations po
              where po.profile_id = auth.uid()
                and po.organization_id = c.organization_id
            )
          )
        )
    )
  );

do $$ begin
  alter publication supabase_realtime add table public.chat_channel_reads;
exception when duplicate_object then null; end $$;
