-- Gate chat by organization MEMBERSHIP rather than the user's single "active"
-- org. With cross-org member visibility, a user can act in any org they belong
-- to, so requiring organization_id = get_my_organization_id() wrongly blocked
-- creating/accessing channels (e.g. private chats) in a non-active org.

create or replace function public.can_access_channel(cid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.chat_channels c
    where c.id = cid
      and (
        public.is_developer()
        or c.created_by = auth.uid()
        or exists (
          select 1 from public.chat_channel_members m
          where m.channel_id = c.id and m.user_id = auth.uid()
        )
        or (
          not c.is_private
          and exists (
            select 1 from public.profile_organizations po
            where po.profile_id = auth.uid() and po.organization_id = c.organization_id
          )
        )
      )
  );
$$;

drop policy if exists "chat_channels_insert" on public.chat_channels;
create policy "chat_channels_insert" on public.chat_channels
  for insert to authenticated
  with check (
    public.is_developer()
    or (
      organization_id in (select organization_id from public.profile_organizations where profile_id = auth.uid())
      and (is_private or public.can_manage_channels())
    )
  );
