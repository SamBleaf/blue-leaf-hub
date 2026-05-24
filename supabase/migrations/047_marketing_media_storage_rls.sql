-- Migration 047: Supabase Storage RLS for marketing-media bucket
-- Apply via Supabase dashboard SQL editor.
-- Safe to re-run — each policy is guarded with an existence check.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'authenticated_upload'
  ) THEN
    CREATE POLICY "authenticated_upload"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'marketing-media');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'authenticated_read'
  ) THEN
    CREATE POLICY "authenticated_read"
      ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'marketing-media');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'public_thumbnails_read'
  ) THEN
    CREATE POLICY "public_thumbnails_read"
      ON storage.objects FOR SELECT TO anon
      USING (
        bucket_id = 'marketing-media'
        AND (storage.foldername(name))[1] = 'thumbnails'
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'authenticated_delete'
  ) THEN
    CREATE POLICY "authenticated_delete"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'marketing-media');
  END IF;
END $$;
