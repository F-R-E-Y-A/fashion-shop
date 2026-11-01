ALTER TYPE public.order_status ADD VALUE 'PENDING_PAYMENT';
ALTER TYPE public.order_status ADD VALUE 'PAYMENT_REVIEW';

ALTER TABLE public.orders
  ADD COLUMN checkout_key uuid,
  ADD COLUMN checkout_fingerprint varchar(64),
  ADD COLUMN payment_due_at timestamptz(3);
CREATE UNIQUE INDEX orders_checkout_key_key ON public.orders(checkout_key);
CREATE INDEX orders_status_payment_due_at_idx ON public.orders(status, payment_due_at);

ALTER TABLE public.payments
  ADD COLUMN gateway varchar(20),
  ADD COLUMN reference varchar(100),
  ADD COLUMN request_key uuid,
  ADD COLUMN checkout_url text,
  ADD COLUMN expires_at timestamptz(3),
  ADD COLUMN last_checked_at timestamptz(3);
CREATE UNIQUE INDEX payments_reference_key ON public.payments(reference);
CREATE UNIQUE INDEX payments_request_key_key ON public.payments(request_key);
CREATE INDEX payments_order_id_created_at_idx ON public.payments(order_id, created_at);
CREATE INDEX payments_status_last_checked_at_idx ON public.payments(status, last_checked_at);

ALTER TABLE public.stock_movements ADD COLUMN order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX stock_movements_order_id_product_variant_id_movement_type_key
  ON public.stock_movements(order_id, product_variant_id, movement_type);
