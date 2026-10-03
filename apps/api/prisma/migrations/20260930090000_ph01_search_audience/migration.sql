-- AlterTable
ALTER TABLE "products" ADD COLUMN     "audience" VARCHAR(8);

-- Prisma khong mo hinh hoa CHECK (giong cac rang buoc cua ADR-007), nen viet tay.
ALTER TABLE "products"
  ADD CONSTRAINT "products_audience_check" CHECK ("audience" IS NULL OR "audience" IN ('nam', 'nu', 'unisex'));

-- Dien du lieu cho san pham da nap: slug danh muc nguon luon ket thuc bang -nam hoac -nu
-- (do 29/09/2026: 22 nam, 65 nu). San pham khong co thong tin nay de NULL.
UPDATE "products"
SET "audience" = CASE
  WHEN "attributes" -> 'originalValues' -> 'category' ->> 'slug' LIKE '%-nu' THEN 'nu'
  WHEN "attributes" -> 'originalValues' -> 'category' ->> 'slug' LIKE '%-nam' THEN 'nam'
END
WHERE "audience" IS NULL;
