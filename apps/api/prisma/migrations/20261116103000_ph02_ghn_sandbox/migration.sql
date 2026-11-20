-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "carrier_status" VARCHAR(64),
ADD COLUMN     "carrier_updated_at" TIMESTAMPTZ(3),
ADD COLUMN     "expected_delivery_at" TIMESTAMPTZ(3),
ADD COLUMN     "is_mock" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "status_note" VARCHAR(500);

-- CreateIndex
CREATE INDEX "shipments_tracking_number_idx" ON "shipments"("tracking_number");
