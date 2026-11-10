-- Tinh ton kha dung loc giu hang theo bien the va han (inventory.service.ts getAvailableQuantities);
-- truoc day chi co chi muc theo expires_at va order_id nen moi lan doc ton quet ca giu hang con han.
CREATE INDEX inventory_reservations_product_variant_id_expires_at_idx
  ON public.inventory_reservations(product_variant_id, expires_at);
