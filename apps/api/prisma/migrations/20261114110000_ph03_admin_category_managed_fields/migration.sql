ALTER TABLE "public"."categories"
ADD COLUMN "admin_managed_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
