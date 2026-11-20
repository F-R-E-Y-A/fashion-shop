ALTER TABLE "public"."product_variants"
ADD COLUMN "is_custom" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "admin_managed_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
