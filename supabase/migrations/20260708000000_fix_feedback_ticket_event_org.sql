-- Ensure feedback ticket activity rows inherit the ticket organization.
-- The generic feedback_ticket_events_set_org trigger can resolve to null in
-- privileged maintenance contexts, but the ticket row already has the correct
-- tenant id.

create or replace function public.feedback_tickets_log_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.feedback_ticket_events (ticket_id, actor_id, event_type, organization_id)
    values (new.id, new.author_id, 'created', new.organization_id);
    return new;
  end if;

  if old.status is distinct from new.status then
    insert into public.feedback_ticket_events (ticket_id, actor_id, event_type, old_value, new_value, organization_id)
    values (new.id, auth.uid(), 'status_changed', old.status, new.status, new.organization_id);
  end if;

  if old.assignee_id is distinct from new.assignee_id then
    insert into public.feedback_ticket_events (ticket_id, actor_id, event_type, old_value, new_value, organization_id)
    values (
      new.id, auth.uid(), 'assigned',
      (select full_name from public.profiles where id = old.assignee_id),
      (select full_name from public.profiles where id = new.assignee_id),
      new.organization_id
    );
  end if;

  if old.priority is distinct from new.priority then
    insert into public.feedback_ticket_events (ticket_id, actor_id, event_type, old_value, new_value, organization_id)
    values (new.id, auth.uid(), 'priority_changed', old.priority, new.priority, new.organization_id);
  end if;

  if old.title is distinct from new.title then
    insert into public.feedback_ticket_events (ticket_id, actor_id, event_type, old_value, new_value, organization_id)
    values (new.id, auth.uid(), 'title_changed', old.title, new.title, new.organization_id);
  end if;

  -- Descriptions can be long; the event records that an edit happened.
  if old.description is distinct from new.description then
    insert into public.feedback_ticket_events (ticket_id, actor_id, event_type, organization_id)
    values (new.id, auth.uid(), 'description_changed', new.organization_id);
  end if;

  if old.category is distinct from new.category
     or old.category_detail is distinct from new.category_detail then
    insert into public.feedback_ticket_events (ticket_id, actor_id, event_type, old_value, new_value, organization_id)
    values (
      new.id, auth.uid(), 'category_changed',
      public.feedback_category_display(old.category, old.category_detail),
      public.feedback_category_display(new.category, new.category_detail),
      new.organization_id
    );
  end if;

  if old.app_area is distinct from new.app_area
     or old.app_area_detail is distinct from new.app_area_detail then
    insert into public.feedback_ticket_events (ticket_id, actor_id, event_type, old_value, new_value, organization_id)
    values (
      new.id, auth.uid(), 'area_changed',
      public.feedback_app_area_display(old.app_area, old.app_area_detail),
      public.feedback_app_area_display(new.app_area, new.app_area_detail),
      new.organization_id
    );
  end if;

  return new;
end;
$$;
