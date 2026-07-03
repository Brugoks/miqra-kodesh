-- Discipleship email invites: invite someone who isn't in the app yet.
--
-- A member emails an invitation (org join code + magic link). The invite row
-- remembers who invited them and in which role. When the invitee signs up with
-- that email and lands in the org, claim_discipleship_email_invites() converts
-- the row into a normal discipleship_relationships 'invited' row, so a pending
-- invitation from the sender is already waiting for them to accept.

create table public.discipleship_email_invites (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  inviter_id      uuid        not null references public.profiles(id) on delete cascade,
  invitee_email   text        not null check (position('@' in invitee_email) > 1),
  -- The inviter's role in the future relationship.
  inviter_role    text        not null check (inviter_role in ('discipler', 'disciple')),
  status          text        not null default 'pending' check (status in ('pending', 'claimed', 'cancelled')),
  created_at      timestamptz not null default now(),
  claimed_by      uuid        references public.profiles(id) on delete set null,
  claimed_at      timestamptz
);

-- One live invite per inviter/email/role/org; cancelled or claimed invites
-- don't block sending a fresh one later.
create unique index discipleship_email_invites_pending_idx
  on public.discipleship_email_invites (organization_id, inviter_id, lower(invitee_email), inviter_role)
  where status = 'pending';

create index discipleship_email_invites_claim_idx
  on public.discipleship_email_invites (lower(invitee_email))
  where status = 'pending';

alter table public.discipleship_email_invites enable row level security;

create policy "inviters read own email invites"
  on public.discipleship_email_invites for select
  to authenticated
  using (auth.uid() = inviter_id or public.is_developer());

create policy "members email-invite within their org"
  on public.discipleship_email_invites for insert
  to authenticated
  with check (
    auth.uid() = inviter_id
    and organization_id in (
      select organization_id from public.profile_organizations
      where profile_id = auth.uid()
    )
  );

create policy "inviters cancel own email invites"
  on public.discipleship_email_invites for update
  to authenticated
  using (auth.uid() = inviter_id and status = 'pending')
  with check (auth.uid() = inviter_id);

-- ── Claim: called (idempotently) after sign-in and after joining an org ──────
-- Matches the signed-in user's email against pending invites in orgs they now
-- belong to, and creates the corresponding relationship invitation.
create or replace function public.claim_discipleship_email_invites()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me_id         uuid := auth.uid();
  me_email      text;
  invite        record;
  claimed_count integer := 0;
begin
  if me_id is null then
    return 0;
  end if;

  select lower(email) into me_email from public.profiles where id = me_id;
  if me_email is null or me_email = '' then
    return 0;
  end if;

  for invite in
    select i.*
      from public.discipleship_email_invites i
     where i.status = 'pending'
       and lower(i.invitee_email) = me_email
       and i.inviter_id <> me_id
       and i.organization_id in (
         select organization_id from public.profile_organizations
         where profile_id = me_id
       )
  loop
    -- If the inviter has since left the org, retire the invite instead.
    if not exists (
      select 1 from public.profile_organizations
      where profile_id = invite.inviter_id
        and organization_id = invite.organization_id
    ) then
      update public.discipleship_email_invites
         set status = 'cancelled'
       where id = invite.id;
      continue;
    end if;

    -- Fires the existing invite push trigger; a live pairing in the same
    -- direction simply absorbs the claim without a duplicate row.
    insert into public.discipleship_relationships
      (organization_id, discipler_id, disciple_id, created_by, status)
    values (
      invite.organization_id,
      case when invite.inviter_role = 'discipler' then invite.inviter_id else me_id end,
      case when invite.inviter_role = 'discipler' then me_id else invite.inviter_id end,
      invite.inviter_id,
      'invited'
    )
    on conflict (organization_id, discipler_id, disciple_id) where status <> 'ended'
    do nothing;

    update public.discipleship_email_invites
       set status = 'claimed', claimed_by = me_id, claimed_at = now()
     where id = invite.id;

    claimed_count := claimed_count + 1;
  end loop;

  return claimed_count;
end;
$$;

grant execute on function public.claim_discipleship_email_invites() to authenticated;

-- ── Email type toggle (DevTools) ─────────────────────────────────────────────
insert into public.app_email_settings (email_type, label, description, sort_order) values
  ('discipleship_invite', 'Discipleship email invite', 'Invites someone by email to sign up with the organization join code and connect in discipleship.', 55)
on conflict (email_type) do nothing;
