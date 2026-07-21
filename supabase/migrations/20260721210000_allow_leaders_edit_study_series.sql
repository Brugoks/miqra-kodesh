-- Allow Leaders and Admins in the active organization to create, update, and delete study_series rows.

DROP POLICY IF EXISTS "study_series_all" ON public.study_series;

CREATE POLICY "study_series_all" ON public.study_series
  FOR ALL TO authenticated
  USING (
    organization_id = public.get_my_organization_id() 
    AND (public.is_leader() OR public.is_admin() OR public.is_developer())
  )
  WITH CHECK (
    organization_id = public.get_my_organization_id() 
    AND (public.is_leader() OR public.is_admin() OR public.is_developer())
  );
