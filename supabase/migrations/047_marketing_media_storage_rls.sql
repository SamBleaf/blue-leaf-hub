-- Migration 047: Supabase Storage RLS for marketing-media bucket
-- Apply via Supabase dashboard SQL editor.

-- 1. Authenticated users can upload to their own paths
CREATE POLICY "authenticated_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'marketing-media');

-- 2. Authenticated users can read all marketing media
CREATE POLICY "authenticated_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'marketing-media');

-- 3. Public read access for thumbnails (so <img> tags work without auth)
CREATE POLICY "public_thumbnails_read"
  ON storage.objects FOR SELECT
  TO anon
  USING (
    bucket_id = 'marketing-media'
    AND (storage.foldername(name))[1] = 'thumbnails'
  );

-- 4. Authenticated users can delete their own uploads
CREATE POLICY "authenticated_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'marketing-media');
