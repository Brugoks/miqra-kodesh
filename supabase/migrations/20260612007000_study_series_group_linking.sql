-- Add scoping columns to study_series so series can be tied to a specific group,
-- an org, or a personal user. Legacy rows (all NULLs) remain visible to everyone.

ALTER TABLE public.study_series
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS group_id text REFERENCES public.attendance_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Drop old blanket policies
DROP POLICY IF EXISTS "Authenticated users read study series" ON public.study_series;
DROP POLICY IF EXISTS "Admins manage study series" ON public.study_series;

-- Read: legacy (no scope), any org-wide, any group series, own personal
-- Client-side filtering to user's groups / org is applied in the component.
CREATE POLICY "Users read relevant study series" ON public.study_series
  FOR SELECT TO authenticated
  USING (
    (created_by IS NULL AND group_id IS NULL AND organization_id IS NULL)
    OR (organization_id IS NOT NULL)
    OR (group_id IS NOT NULL)
    OR (created_by = auth.uid())
  );

-- Admins retain full management access
CREATE POLICY "Admins manage study series" ON public.study_series
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Any authenticated user can manage series they created
CREATE POLICY "Users manage own study series" ON public.study_series
  FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());
