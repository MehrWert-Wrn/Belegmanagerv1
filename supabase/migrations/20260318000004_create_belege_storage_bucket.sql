-- Create private Supabase Storage bucket for Belege (BUG-PROJ3-005)
-- Storage path pattern: {mandant_id}/{uuid}.{ext}

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'belege',
  'belege',
  false,
  10485760, -- 10 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files into their own mandant folder.
-- split_part(name, '/', 1) extracts the mandant_id prefix from the storage path.
CREATE POLICY "belege_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'belege'
    AND split_part(name, '/', 1)::uuid = get_mandant_id()
  );

-- Allow authenticated users to read files belonging to their mandant.
-- Used by the server when generating signed URLs (service role bypasses this,
-- but the policy also covers any direct client reads).
CREATE POLICY "belege_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'belege'
    AND split_part(name, '/', 1)::uuid = get_mandant_id()
  );

-- No DELETE policy: files are kept in storage for audit trail (soft-delete only).
