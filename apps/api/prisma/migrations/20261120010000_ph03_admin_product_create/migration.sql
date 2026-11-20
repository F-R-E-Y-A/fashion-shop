ALTER TABLE public.products
  ADD COLUMN is_custom BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN create_payload_hash CHAR(64);
