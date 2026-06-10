-- Polls created by group leaders
CREATE TABLE IF NOT EXISTS polls (
  id text PRIMARY KEY,
  group_key text NOT NULL,
  group_name text NOT NULL,
  question text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]',
  created_by_name text NOT NULL DEFAULT '',
  expires_at timestamptz,
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One vote per user per poll
CREATE TABLE IF NOT EXISTS poll_votes (
  id text PRIMARY KEY,
  poll_id text NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  option_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(poll_id, user_id)
);

ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read polls and votes
CREATE POLICY "polls_select" ON polls FOR SELECT TO authenticated USING (true);
CREATE POLICY "poll_votes_select" ON poll_votes FOR SELECT TO authenticated USING (true);

-- Leaders and admins can create/update/delete polls
CREATE POLICY "polls_insert" ON polls FOR INSERT TO authenticated
  WITH CHECK (is_leader() OR is_admin());

CREATE POLICY "polls_update" ON polls FOR UPDATE TO authenticated
  USING (is_leader() OR is_admin());

CREATE POLICY "polls_delete" ON polls FOR DELETE TO authenticated
  USING (is_admin());

-- Any authenticated user can cast one vote
CREATE POLICY "poll_votes_insert" ON poll_votes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "poll_votes_delete" ON poll_votes FOR DELETE TO authenticated
  USING (user_id = auth.uid());
