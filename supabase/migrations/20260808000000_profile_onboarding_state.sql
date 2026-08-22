-- Remember which walkthroughs a user has already seen, on the profile.
--
-- Onboarding state lived in localStorage (miqra_discipleship_onboarding_v1).
-- Miqra is an installed PWA, so a browser-local flag replays every walkthrough
-- the moment someone installs the app from the browser they signed up in, or
-- opens it on a second device, or clears site data — and conversely, dismissing
-- it on a phone leaves the desktop with no help at all. That lands hardest on
-- the non-technical members this guidance exists for. Feedback ticket 032815b7
-- ("Tooltip Guidance System").
--
-- A map of key -> true rather than one boolean column per walkthrough: these
-- get added and retired often, and none of them are ever queried across users,
-- so a column each would be migration churn for no read benefit.

alter table public.profiles
  add column if not exists onboarding jsonb not null default '{}'::jsonb;

-- Keys are read as `onboarding->>'key'`, which silently returns null for an
-- array or a scalar. Reject those at write time instead.
alter table public.profiles
  drop constraint if exists profiles_onboarding_is_object;
alter table public.profiles
  add constraint profiles_onboarding_is_object
  check (jsonb_typeof(onboarding) = 'object');

comment on column public.profiles.onboarding is
  'Map of walkthrough key -> true for the guidance this user has already completed. Server-side so an installed PWA or a second device does not replay it. Written by the user themselves via the existing profiles_update policy (auth.uid() = id).';
