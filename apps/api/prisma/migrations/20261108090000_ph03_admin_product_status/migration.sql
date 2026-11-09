-- Khong suy ra manual hold tu is_active cu; khong doi du lieu/lich su hien co.
ALTER TABLE "public"."products"
  ADD COLUMN "admin_disabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "status_version" INTEGER NOT NULL DEFAULT 0;
