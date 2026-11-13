-- So anh chua gan (ADR-056): phieu tai anh them PENDING, gan vao danh gia thi xoa dong, worker xoa
-- anh mo coi tren kho theo lo. Cot thumbnail_url: ban thu nho cho luoi anh danh gia.

-- CreateEnum
CREATE TYPE "media_upload_status" AS ENUM ('PENDING', 'DISCARDED', 'DELETING');

-- AlterTable
ALTER TABLE "review_media" ADD COLUMN     "thumbnail_url" VARCHAR;

-- CreateTable
CREATE TABLE "media_uploads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storage_key" VARCHAR(300) NOT NULL,
    "owner_id" UUID NOT NULL,
    "status" "media_upload_status" NOT NULL DEFAULT 'PENDING',
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "claimed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_uploads_storage_key_key" ON "media_uploads"("storage_key");

-- CreateIndex
CREATE INDEX "media_uploads_status_created_at_idx" ON "media_uploads"("status", "created_at");

