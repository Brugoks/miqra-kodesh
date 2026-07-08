-- Bible Wiki: an admin-curated picture per entry, per organization. One row
-- per (org, entry); the file lives in the public wiki-images bucket under
-- <org_id>/<entry_slug>/<timestamp>.<ext>. is_admin() already includes the
-- developer role, so "admins" below covers both.

create table public.wiki_entry_images (
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  entry_slug      text        not null,
  image_path      text        not null,
  uploaded_by     uuid        references public.profiles(id) on delete set null,
  updated_at      timestamptz not null default now(),
  primary key (organization_id, entry_slug)
);

alter table public.wiki_entry_images enable row level security;

create policy "org members read wiki entry images"
  on public.wiki_entry_images for select
  to authenticated
  using (public.is_developer() or organization_id = public.get_my_organization_id());

create policy "admins manage wiki entry images"
  on public.wiki_entry_images for all
  to authenticated
  using (
    public.is_developer()
    or (public.is_admin() and organization_id = public.get_my_organization_id())
  )
  with check (
    public.is_developer()
    or (public.is_admin() and organization_id = public.get_my_organization_id())
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wiki-images',
  'wiki-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

drop policy if exists "Admins upload wiki images" on storage.objects;
create policy "Admins upload wiki images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'wiki-images'
    and (
      public.is_developer()
      or (
        public.is_admin()
        and (storage.foldername(name))[1] = public.get_my_organization_id()::text
      )
    )
  );

drop policy if exists "Admins delete wiki images" on storage.objects;
create policy "Admins delete wiki images" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'wiki-images'
    and (
      public.is_developer()
      or (
        public.is_admin()
        and (storage.foldername(name))[1] = public.get_my_organization_id()::text
      )
    )
  );
