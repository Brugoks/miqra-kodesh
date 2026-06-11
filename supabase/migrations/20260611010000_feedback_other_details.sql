-- Free-text detail fields shown when "Other" is selected for the feedback
-- type (category) or location (app_area) on the submit form.

alter table public.feedback_tickets
  add column if not exists category_detail text,
  add column if not exists app_area_detail text;

-- Recreate the board view with the new columns (create or replace can only
-- append columns at the end, so drop and rebuild to keep them next to the
-- fields they qualify). The similarity RPC returns the view's rowtype, so it
-- must be dropped first and recreated unchanged.

drop function if exists public.search_similar_feedback(text, int);
drop view if exists public.feedback_board;

create view public.feedback_board
with (security_invoker = true) as
select
  t.id,
  t.title,
  t.description,
  t.category,
  t.category_detail,
  t.app_area,
  t.app_area_detail,
  t.status,
  t.priority,
  t.author_id,
  p.full_name as author_name,
  t.assignee_id,
  a.full_name as assignee_name,
  t.screenshot_paths,
  t.created_at,
  t.updated_at,
  coalesce(v.cnt, 0)::int as votes,
  coalesce(c.cnt, 0)::int as comments,
  (coalesce(v.cnt, 0) * 5
    + case t.priority
        when 'critical' then 400
        when 'high' then 200
        when 'medium' then 80
        when 'low' then 20
        else 0
      end)::int as rank_score
from public.feedback_tickets t
left join public.profiles p on p.id = t.author_id
left join public.profiles a on a.id = t.assignee_id
left join lateral (
  select count(*) cnt from public.feedback_ticket_votes where ticket_id = t.id
) v on true
left join lateral (
  select count(*) cnt from public.feedback_ticket_comments where ticket_id = t.id
) c on true;

create function public.search_similar_feedback(q text, max_results int default 5)
returns setof public.feedback_board
language sql
stable
as $$
  select b.*
  from public.feedback_board b
  join public.feedback_tickets t on t.id = b.id
  where similarity(t.title, q) > 0.12
     or t.search_vector @@ websearch_to_tsquery('english', q)
  order by greatest(
    similarity(t.title, q),
    ts_rank(t.search_vector, websearch_to_tsquery('english', q))
  ) desc
  limit max_results
$$;
