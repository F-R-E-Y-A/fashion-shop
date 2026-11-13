ALTER TABLE public.products
  ADD COLUMN content_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN admin_content_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD CONSTRAINT products_content_version_nonnegative CHECK (content_version >= 0),
  ADD CONSTRAINT products_admin_content_fields_allowed CHECK (
    admin_content_fields <@ ARRAY['name','description','material','careInstructions']::TEXT[]
    AND cardinality(admin_content_fields) <= 4
  );
