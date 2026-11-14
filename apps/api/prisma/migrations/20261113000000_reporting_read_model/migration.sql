-- AlterTable daily_revenue: add refunded_amount with nonnegative constraint
ALTER TABLE "reporting"."daily_revenue" ADD COLUMN "refunded_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "reporting"."daily_revenue"
ADD CONSTRAINT "daily_revenue_refunded_amount_nonnegative_ck"
CHECK ("refunded_amount" >= 0);

-- AlterTable top_selling_products: add product_name
ALTER TABLE "reporting"."top_selling_products" ADD COLUMN "product_name" VARCHAR(255);

-- CreateTable report_snapshot_metadata
CREATE TABLE "reporting"."report_snapshot_metadata" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'singleton',
    "snapshot_version" BIGINT NOT NULL DEFAULT 0,
    "as_of" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_completed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metric_definition_version" VARCHAR(20) NOT NULL DEFAULT '1.0',
    "data_quality_notes" TEXT,

    CONSTRAINT "report_snapshot_metadata_pkey" PRIMARY KEY ("id")
);
