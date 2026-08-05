-- Remove the "System upsert" policy on public.profiles.
--
-- This policy exists in no migration — it was applied directly to the database,
-- so it never showed up in review. It was FOR ALL, PERMISSIVE, granted to PUBLIC
-- (not just `authenticated`), with both USING and WITH CHECK set to `true`.
-- Because permissive policies OR together, it silently overrode every other
-- policy on the table: any caller could read, update, or delete any profile row
-- in any organization. It is why profiles stayed fully visible even with
-- developer org scoping switched on.
--
-- Nothing depends on it. Its name suggests it was meant to let signup write
-- profiles, but public.handle_new_user() is SECURITY DEFINER and owned by
-- postgres, which also owns public.profiles and does not have FORCE ROW LEVEL
-- SECURITY set — so the signup trigger bypasses RLS entirely and never consults
-- policies. No client or edge-function code inserts or upserts profiles.

drop policy if exists "System upsert" on public.profiles;

-- Kept as an explicit, narrow fallback for a user materialising their own row.
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated
  with check (auth.uid() = id);

-- No DELETE policy is restored: profile deletion goes through the
-- admin_delete_user() SECURITY DEFINER RPC, which is unaffected by RLS.
