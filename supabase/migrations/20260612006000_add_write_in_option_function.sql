-- Migration to add support for write-in suggestions on polls.
-- This function atomically appends an option to a poll and casts the user's vote.

CREATE OR REPLACE FUNCTION public.add_write_in_option(
  p_poll_id text,
  p_option_id text,
  p_option_text text,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_options jsonb;
  v_closed boolean;
  v_expires timestamptz;
  v_org_id uuid;
BEGIN
  -- 1. Get poll status and info
  SELECT options, is_closed, expires_at, organization_id
  INTO v_options, v_closed, v_expires, v_org_id
  FROM public.polls
  WHERE id = p_poll_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Poll not found';
  END IF;

  -- 2. Verify organization access
  IF NOT public.is_developer() AND v_org_id != public.get_my_organization_id() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 3. Verify poll is active (not closed, not expired)
  IF v_closed OR (v_expires IS NOT NULL AND v_expires <= NOW()) THEN
    RAISE EXCEPTION 'Poll is closed or expired';
  END IF;

  -- 4. Verify user has not voted yet
  IF EXISTS (SELECT 1 FROM public.poll_votes WHERE poll_id = p_poll_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'User has already voted';
  END IF;

  -- 5. Append new option to the JSONB array
  UPDATE public.polls
  SET options = v_options || jsonb_build_array(jsonb_build_object('id', p_option_id, 'text', p_option_text))
  WHERE id = p_poll_id;

  -- 6. Cast vote for this option
  INSERT INTO public.poll_votes (id, poll_id, user_id, option_id, organization_id)
  VALUES ('vote_' || md5(random()::text), p_poll_id, p_user_id, p_option_id, v_org_id);
END;
$$;
