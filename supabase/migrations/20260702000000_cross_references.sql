-- Cross-reference index (Treasury of Scripture Knowledge lineage).
-- Data: openbible.info cross references (CC-BY), ~345k links with helpfulness
-- votes. Rows are loaded by scripts/seed-cross-references.js (too large to
-- inline here); refs use the app's API.Bible-style ids (e.g. 'JHN.3.16').

CREATE TABLE IF NOT EXISTS public.cross_references (
  id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_ref TEXT NOT NULL,            -- single verse id, e.g. 'GEN.1.1'
  to_ref   TEXT NOT NULL,            -- verse or range id, e.g. 'JHN.1.1-JHN.1.3'
  votes    INT  NOT NULL DEFAULT 0   -- openbible.info helpfulness votes
);

CREATE INDEX IF NOT EXISTS cross_references_from_ref_votes_idx
  ON public.cross_references (from_ref, votes DESC);

-- Public reference data, same posture as strongs_lexicon.
ALTER TABLE public.cross_references ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read cross references" ON public.cross_references
  FOR SELECT USING (true);
