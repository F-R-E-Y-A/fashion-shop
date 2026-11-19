ALTER TABLE public.products
  ADD COLUMN images_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN images_managed_by_admin BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT products_images_version_nonnegative CHECK (images_version >= 0);
