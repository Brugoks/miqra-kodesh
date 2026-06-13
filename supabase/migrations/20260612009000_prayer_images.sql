-- Add image attachment support to prayers
ALTER TABLE public.prayers
  ADD COLUMN IF NOT EXISTS image_paths text[] NOT NULL DEFAULT '{}';

-- Storage bucket for prayer wall images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'prayer-images',
  'prayer-images',
  true,
  5242880,  -- 5 MB
  ARRAY['image/png','image/jpeg','image/webp','image/gif','image/heic','image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- Users can upload to their own folder
CREATE POLICY "Users upload prayer images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'prayer-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Images are publicly readable (bucket is public)
CREATE POLICY "Public read prayer images" ON storage.objects
  FOR SELECT USING (bucket_id = 'prayer-images');

-- Users can delete their own images
CREATE POLICY "Users delete own prayer images" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'prayer-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
