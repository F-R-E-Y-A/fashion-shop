-- CreateEnum
CREATE TYPE "review_report_reason" AS ENUM ('SPAM', 'OFFENSIVE', 'IRRELEVANT', 'PRIVACY', 'OTHER');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "rating_average" DECIMAL(3,2) NOT NULL DEFAULT 0,
ADD COLUMN     "rating_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "review_media" ADD COLUMN     "storage_key" VARCHAR(300);

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "edit_count" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN     "edited_at" TIMESTAMPTZ(3),
ADD COLUMN     "height_cm" SMALLINT,
ADD COLUMN     "helpful_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "moderated_at" TIMESTAMPTZ(3),
ADD COLUMN     "moderated_by_id" UUID,
ADD COLUMN     "moderation_note" VARCHAR(500),
ADD COLUMN     "replied_at" TIMESTAMPTZ(3),
ADD COLUMN     "replied_by_id" UUID,
ADD COLUMN     "reply_content" TEXT,
ADD COLUMN     "report_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "variant_label" VARCHAR(120),
ADD COLUMN     "weight_kg" SMALLINT;

-- CreateTable
CREATE TABLE "review_helpful_votes" (
    "review_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_helpful_votes_pkey" PRIMARY KEY ("review_id","user_id")
);

-- CreateTable
CREATE TABLE "review_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "review_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reason" "review_report_reason" NOT NULL,
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_helpful_votes_user_id_idx" ON "review_helpful_votes"("user_id");

-- CreateIndex
CREATE INDEX "review_reports_user_id_idx" ON "review_reports"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_reports_review_id_user_id_key" ON "review_reports"("review_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_media_storage_key_key" ON "review_media"("storage_key");

-- CreateIndex
CREATE INDEX "reviews_moderation_status_created_at_idx" ON "reviews"("moderation_status", "created_at");

-- AddForeignKey
ALTER TABLE "review_helpful_votes" ADD CONSTRAINT "review_helpful_votes_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "review_helpful_votes" ADD CONSTRAINT "review_helpful_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- CHECK viet tay (Prisma khong sinh CHECK); gioi han khop DTO trong modules/reviews (ADR-054).
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_height_cm_range_ck CHECK (height_cm BETWEEN 100 AND 230),
  ADD CONSTRAINT reviews_weight_kg_range_ck CHECK (weight_kg BETWEEN 25 AND 250),
  ADD CONSTRAINT reviews_helpful_count_nonnegative_ck CHECK (helpful_count >= 0),
  ADD CONSTRAINT reviews_report_count_nonnegative_ck CHECK (report_count >= 0),
  ADD CONSTRAINT reviews_edit_count_nonnegative_ck CHECK (edit_count >= 0),
  ADD CONSTRAINT reviews_content_length_ck CHECK (char_length(content) <= 1500),
  ADD CONSTRAINT reviews_reply_length_ck CHECK (char_length(reply_content) <= 1000);

ALTER TABLE public.products
  ADD CONSTRAINT products_rating_average_range_ck CHECK (rating_average BETWEEN 0 AND 5),
  ADD CONSTRAINT products_rating_count_nonnegative_ck CHECK (rating_count >= 0);
