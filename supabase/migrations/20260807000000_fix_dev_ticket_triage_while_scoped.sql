-- Let a developer triage feedback tickets while org scoping is on.
--
-- 20260805010000 split is_developer() into two jobs and made the cross-org half
-- switchable: with scoping ON (the default) public.is_developer() returns false
-- so every org-isolation policy falls through to
-- `organization_id = get_my_organization_id()`. That is right for the ~128
-- policies whose only use of the helper is a cross-tenant escape hatch.
--
-- It is wrong for the two places that use it as a *capability* check — "is this
-- account allowed to set status / priority / assignee" — because those have no
-- org fallback to land on. A scoped developer opening any ticket they did not
-- author got `Only developers can change status, priority, or assignee`:
--
--   1. feedback_tickets_guard_update() gates the triage columns on
--      is_developer() and raises otherwise. Scoping demoted the developer to a
--      plain member, so the raise fired.
--   2. "feedback_tickets_update" only allowed the author through once
--      is_developer() went false, so a developer could not even reach the
--      trigger on somebody else's ticket.
--
-- Both now use is_developer_unscoped() — a developer stays a developer inside
-- the org they are scoped into. Org isolation is unaffected: the policy still
-- requires organization_id = get_my_organization_id() on that branch, so a
-- scoped developer can only triage tickets belonging to their active org.
--
-- The qa_* / add_write_in_option helpers were checked and deliberately left
-- alone: each spells `is_developer() or <caller is in this org>`, so scoping
-- degrades them to the org branch exactly as intended. is_leader() and
-- is_admin() read the role column directly and were never scope-sensitive.

create or replace function public.feedback_tickets_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- is_developer_unscoped(), not is_developer(): this is a role capability
  -- check, and org scoping must not strip it. is_service_role() is folded in
  -- there, so edge-function calls ("Dev Team") still bypass the guard.
  if auth.uid() is null or public.is_developer_unscoped() then
    return new;
  end if;

  if old.status is distinct from new.status
     or old.priority is distinct from new.priority
     or old.assignee_id is distinct from new.assignee_id
     or old.author_id is distinct from new.author_id then
    raise exception 'Only developers can change status, priority, or assignee';
  end if;

  return new;
end;
$$;

-- Authors edit their own tickets in their org; developers edit any ticket in
-- the org they are currently scoped to; unscoped developers edit anything.
-- Helpers stay wrapped in scalar subqueries so they remain InitPlans and are
-- evaluated once per query rather than once per row (see 20260806000000).
drop policy if exists "feedback_tickets_update" on public.feedback_tickets;
create policy "feedback_tickets_update" on public.feedback_tickets
  for update to authenticated
  using (
    (select public.is_developer())
    or (
      organization_id = (select public.get_my_organization_id())
      and (author_id = (select auth.uid()) or (select public.is_developer_unscoped()))
    )
  )
  with check (
    (select public.is_developer())
    or (
      organization_id = (select public.get_my_organization_id())
      and (author_id = (select auth.uid()) or (select public.is_developer_unscoped()))
    )
  );
