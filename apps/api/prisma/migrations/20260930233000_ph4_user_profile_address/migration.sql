-- PH4 ho so ca nhan va so dia chi (ADR-023). Mot migration cho ca pull request (docs/CONTRIBUTING.md).
-- SQL sinh bang `prisma migrate diff` tu CSDL da ap moi migration truoc PH4 toi prisma/schema.
--
-- users.full_name, users.phone: nullable, khong default, tai khoan cu nhan NULL; phone KHONG unique.
-- addresses_user_id_idx: moi truy van so dia chi loc theo user_id; chi muc duy nhat mot-mac-dinh chi la chi
-- muc mot phan (WHERE is_default = true) nen khong phuc vu duoc truy van lay moi dia chi cua mot nguoi.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "full_name" VARCHAR,
ADD COLUMN     "phone" VARCHAR;

-- CreateIndex
CREATE INDEX "addresses_user_id_idx" ON "addresses"("user_id");
