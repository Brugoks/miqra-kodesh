-- Key the remaining "any org I have ever joined" policies to the active org.
--
-- Eleven policies scoped access with
--   organization_id in (select organization_id from profile_organizations
--                       where profile_id = auth.uid())
-- i.e. every organization the caller has ever joined, rather than the one they
-- are currently viewing. The rest of the schema uses
-- get_my_organization_id() (= profiles.active_organization_id), and the app only
-- ever renders one organization at a time, so these were the odd ones out.
--
-- It matters most for developers: App.jsx handleSwitchOrganization inserts a
-- profile_organizations row for any org the developer switches into, so that set
-- grows with every organization they visit. Chat channels, ice breakers and the
-- discipleship surfaces then keep showing every previously-visited org's rows
-- even with developer org scoping switched on — chat_channels stayed at 17 rows
-- scoped and unscoped alike. It applies to ordinary multi-org members too: a
-- student who belongs to two churches saw both churches' public channels in one
-- list.
--
-- Membership is still required to switch into an org; this only narrows what is
-- visible once you are there. Policy bodies are otherwise reproduced verbatim.

-- chat_channels ------------------------------------------------------------
drop policy if exists "chat_channels_select" on public.chat_channels;
create policy "chat_channels_select" on public.chat_channels
  for select to authenticated
  using (
    public.is_developer()
    or created_by = auth.uid()
    or ((not is_private) and organization_id = public.get_my_organization_id())
    or exists (
      select 1 from public.chat_channel_members m
      where m.channel_id = chat_channels.id and m.user_id = auth.uid()
    )
  );

drop policy if exists "chat_channels_insert" on public.chat_channels;
create policy "chat_channels_insert" on public.chat_channels
  for insert to authenticated
  with check (
    public.is_developer()
    or (
      organization_id = public.get_my_organization_id()
      and (is_private or public.can_manage_channels())
    )
  );

-- chat_channel_reads -------------------------------------------------------
drop policy if exists "chat_channel_reads_select" on public.chat_channel_reads;
create policy "chat_channel_reads_select" on public.chat_channel_reads
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_developer()
    or exists (
      select 1 from public.chat_channels c
      where c.id = chat_channel_reads.channel_id
        and (
          c.created_by = auth.uid()
          or exists (
            select 1 from public.chat_channel_members me
            where me.channel_id = c.id and me.user_id = auth.uid()
          )
          or ((not c.is_private) and c.organization_id = public.get_my_organization_id())
        )
    )
  );

-- discipleship -------------------------------------------------------------
drop policy if exists "org members see open hands" on public.discipleship_availability;
create policy "org members see open hands" on public.discipleship_availability
  for select to authenticated
  using (organization_id = public.get_my_organization_id() or public.is_developer());

drop policy if exists "members raise own hand" on public.discipleship_availability;
create policy "members raise own hand" on public.discipleship_availability
  for insert to authenticated
  with check (auth.uid() = profile_id and organization_id = public.get_my_organization_id());

drop policy if exists "members email-invite within their org" on public.discipleship_email_invites;
create policy "members email-invite within their org" on public.discipleship_email_invites
  for insert to authenticated
  with check (auth.uid() = inviter_id and organization_id = public.get_my_organization_id());

drop policy if exists "org members read shared milestones" on public.discipleship_milestones;
create policy "org members read shared milestones" on public.discipleship_milestones
  for select to authenticated
  using (shared and organization_id = public.get_my_organization_id());

drop policy if exists "members invite within their org" on public.discipleship_relationships;
create policy "members invite within their org" on public.discipleship_relationships
  for insert to authenticated
  with check (
    auth.uid() = created_by
    and (auth.uid() = discipler_id or auth.uid() = disciple_id)
    and organization_id = public.get_my_organization_id()
  );

drop policy if exists "leaders suggest pairings" on public.discipleship_suggestions;
create policy "leaders suggest pairings" on public.discipleship_suggestions
  for insert to authenticated
  with check (
    auth.uid() = suggested_by
    and (public.is_leader() or public.is_developer())
    and organization_id = public.get_my_organization_id()
  );

-- ice_breakers -------------------------------------------------------------
-- organization_id IS NULL means a built-in shared prompt; those stay global.
drop policy if exists "Org members read ice breakers" on public.ice_breakers;
create policy "Org members read ice breakers" on public.ice_breakers
  for select to authenticated
  using (organization_id is null or organization_id = public.get_my_organization_id());

drop policy if exists "Leaders insert ice breakers" on public.ice_breakers;
create policy "Leaders insert ice breakers" on public.ice_breakers
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (organization_id is null or organization_id = public.get_my_organization_id())
  );
