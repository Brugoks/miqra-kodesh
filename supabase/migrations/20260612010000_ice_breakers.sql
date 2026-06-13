CREATE TABLE IF NOT EXISTS public.ice_breakers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  theme         text NOT NULL DEFAULT '',
  questions     text[] NOT NULL DEFAULT '{}',
  active_question text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ice_breakers ENABLE ROW LEVEL SECURITY;

-- All org members can read their org's ice breakers
CREATE POLICY "Org members read ice breakers" ON public.ice_breakers
  FOR SELECT TO authenticated
  USING (
    organization_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.profile_organizations po
      WHERE po.organization_id = ice_breakers.organization_id
        AND po.profile_id = auth.uid()
    )
  );

-- Leaders/admins can insert
CREATE POLICY "Leaders insert ice breakers" ON public.ice_breakers
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND (
      organization_id IS NULL OR
      EXISTS (
        SELECT 1 FROM public.profile_organizations po
        WHERE po.organization_id = ice_breakers.organization_id
          AND po.profile_id = auth.uid()
      )
    )
  );

-- Creator can update (to change active question)
CREATE POLICY "Creator updates ice breakers" ON public.ice_breakers
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_admin());

-- Creator or admin can delete
CREATE POLICY "Creator deletes ice breakers" ON public.ice_breakers
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

-- Keep updated_at current
CREATE OR REPLACE FUNCTION public.touch_ice_breakers()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER ice_breakers_updated
  BEFORE UPDATE ON public.ice_breakers
  FOR EACH ROW EXECUTE FUNCTION public.touch_ice_breakers();
