-- PH-11 tra hang (ADR-067): ly do co dinh, nguoi duyet, moc nhan hang/hoan tat, tai khoan nhan tien
-- cua don COD (xoa khi yeu cau ket thuc) va khoa anh de don kho anh. Chi them cot nullable.

-- CreateEnum
CREATE TYPE "return_reason" AS ENUM ('SIZE_MISMATCH', 'NOT_AS_EXPECTED', 'DEFECTIVE', 'WRONG_ITEM', 'CHANGED_MIND');

-- AlterTable
ALTER TABLE "return_media" ADD COLUMN     "storage_key" VARCHAR;

-- AlterTable
ALTER TABLE "returns" ADD COLUMN     "completed_at" TIMESTAMPTZ(3),
ADD COLUMN     "decided_at" TIMESTAMPTZ(3),
ADD COLUMN     "decided_by_id" UUID,
ADD COLUMN     "decision_note" TEXT,
ADD COLUMN     "reason_code" "return_reason",
ADD COLUMN     "received_at" TIMESTAMPTZ(3),
ADD COLUMN     "refund_account_holder" VARCHAR(120),
ADD COLUMN     "refund_account_number" VARCHAR(40),
ADD COLUMN     "refund_bank_name" VARCHAR(120);
