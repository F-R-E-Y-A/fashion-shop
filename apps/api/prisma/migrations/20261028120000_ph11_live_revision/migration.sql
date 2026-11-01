-- Revision cho SSE /api/products/events (ADR-037): moi cau lenh ghi vao bang catalog hoac kho tang
-- mot sequence; probe chi doc last_value, khong quet bang. Sequence khong theo transaction nen
-- trigger khong tao hang nong khi nhieu checkout cung luc; transaction rollback van tang so, client
-- chi tai lai thua, khong bo sot thay doi. Prisma khong mo ta duoc sequence rieng va trigger nen
-- viet tay o day.
CREATE SEQUENCE public.catalog_revision_seq;
CREATE SEQUENCE public.inventory_revision_seq;

CREATE FUNCTION public.bump_catalog_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM nextval('public.catalog_revision_seq');
  RETURN NULL;
END
$$;

CREATE FUNCTION public.bump_inventory_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM nextval('public.inventory_revision_seq');
  RETURN NULL;
END
$$;

CREATE TRIGGER products_bump_catalog_revision
  AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.products
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_catalog_revision();
CREATE TRIGGER product_variants_bump_catalog_revision
  AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.product_variants
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_catalog_revision();
CREATE TRIGGER product_images_bump_catalog_revision
  AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.product_images
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_catalog_revision();
CREATE TRIGGER categories_bump_catalog_revision
  AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.categories
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_catalog_revision();
CREATE TRIGGER colors_bump_catalog_revision
  AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.colors
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_catalog_revision();
CREATE TRIGGER sizes_bump_catalog_revision
  AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.sizes
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_catalog_revision();

CREATE TRIGGER inventory_bump_inventory_revision
  AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.inventory
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_inventory_revision();
CREATE TRIGGER inventory_reservations_bump_inventory_revision
  AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.inventory_reservations
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_inventory_revision();
