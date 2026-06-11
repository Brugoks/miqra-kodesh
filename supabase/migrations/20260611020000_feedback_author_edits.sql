-- Authors can edit their own feedback requests (title, description, type,
-- location). Edits are logged to the activity feed by the existing trigger,
-- and a guard trigger keeps triage fields (status/priority/assignee)
-- developer-only even though the update policy now admits authors.

-- ---------------------------------------------------------------------------
-- New event types for content edits
-- ---------------------------------------------------------------------------

alter table public.feedback_ticket_events
  drop constraint if exists feedback_ticket_events_event_type_check;

alter table public.feedback_ticket_events
  add constraint feedback_ticket_events_event_type_check check (event_type in (
    'created', 'status_changed', 'assigned', 'priority_changed',
    'title_changed', 'description_changed', 'category_changed', 'area_changed'
  ));

-- ---------------------------------------------------------------------------
-- Display helpers so events store human-readable values (matches the labels
-- in src/lib/feedbackApi.js; the "assigned" event already stores names).
-- ---------------------------------------------------------------------------

create or replace function public.feedback_category_display(cat text, detail text)
returns text
language sql
immutable
as $$
  select case
    when cat = 'other' and coalesce(detail, '') <> '' then 'Other: ' || detail
    when cat = 'bug' then 'Bug Report'
    when cat = 'feature' then 'Feature Request'
    when cat = 'other' then 'Other'
    else cat
  end
$$;

create or replace function public.feedback_app_area_display(area text, detail text)
returns text
language sql
immutable
as $$
  select case
    when area = 'other' and coalesce(detail, '') <> '' then 'Other: ' || detail
    else case area
      when 'home' then 'Home'
      when 'calendar' then 'Calendar'
      when 'bible_study' then 'Bible Study'
      when 'fellowship' then 'Fellowship'
      when 'sermons' then 'Sermons'
      when 'discipleship' then 'Discipleship'
      when 'integrations' then 'Integrations'
      when 'leader_portal' then 'Leader Portal'
      when 'admin_portal' then 'Admin Portal'
      when 'other' then 'Other'
      else area
    end
  end
$$;

-- ---------------------------------------------------------------------------
-- Log content edits alongside the existing dev-field events
-- ---------------------------------------------------------------------------

create or replace function public.feedback_tickets_log_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.feedback_ticket_events (ticket_id, actor_id, event_type)
    values (new.id, new.author_id, 'created');
    return new;
  end if;

  if old.status is distinct from new.status then
    insert into public.feedback_ticket_events (ticket_id, actor_id, event_type, old_value, new_value)
    values (new.id, auth.uid(), 'status_changed', old.status, new.status);
  end if;

  if old.assignee_id is distinct from new.assignee_id then
    insert into public.feedback_ticket_events (ticket_id, actor_id, event_type, old_value, new_value)
    values (
      new.id, auth.uid(), 'assigned',
      (select full_name from public.profiles where id = old.assignee_id),
      (select full_name from public.profiles where id = new.assignee_id)
    );
  end if;

  if old.priority is distinct from new.priority then
    insert into public.feedback_ticket_events (ticket_id, actor_id, event_type, old_value, new_value)
    values (new.id, auth.uid(), 'priority_changed', old.priority, new.priority);
  end if;

  if old.title is distinct from new.title then
    insert into public.feedback_ticket_events (ticket_id, actor_id, event_type, old_value, new_value)
    values (new.id, auth.uid(), 'title_changed', old.title, new.title);
  end if;

  -- Descriptions can be long; the event records that an edit happened.
  if old.description is distinct from new.description then
    insert into public.feedback_ticket_events (ticket_id, actor_id, event_type)
    values (new.id, auth.uid(), 'description_changed');
  end if;

  if old.category is distinct from new.category
     or old.category_detail is distinct from new.category_detail then
    insert into public.feedback_ticket_events (ticket_id, actor_id, event_type, old_value, new_value)
    values (
      new.id, auth.uid(), 'category_changed',
      public.feedback_category_display(old.category, old.category_detail),
      public.feedback_category_display(new.category, new.category_detail)
    );
  end if;

  if old.app_area is distinct from new.app_area
     or old.app_area_detail is distinct from new.app_area_detail then
    insert into public.feedback_ticket_events (ticket_id, actor_id, event_type, old_value, new_value)
    values (
      new.id, auth.uid(), 'area_changed',
      public.feedback_app_area_display(old.app_area, old.app_area_detail),
      public.feedback_app_area_display(new.app_area, new.app_area_detail)
    );
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Authors may update their own tickets…
-- ---------------------------------------------------------------------------

drop policy if exists "feedback_tickets_update" on public.feedback_tickets;
create policy "feedback_tickets_update" on public.feedback_tickets
  for update to authenticated
  using (is_developer() or author_id = auth.uid())
  with check (is_developer() or author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- …but triage fields stay developer-only. RLS can't restrict columns, so a
-- guard trigger rejects non-developer changes to status/priority/assignee.
-- Service-role calls (auth.uid() is null) bypass the guard ("Dev Team").
-- ---------------------------------------------------------------------------

create or replace function public.feedback_tickets_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_developer() then
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

drop trigger if exists feedback_tickets_guard_update on public.feedback_tickets;
create trigger feedback_tickets_guard_update
  before update on public.feedback_tickets
  for each row execute function public.feedback_tickets_guard_update();
