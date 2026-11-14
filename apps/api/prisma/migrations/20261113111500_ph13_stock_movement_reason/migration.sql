-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "actor_user_id" UUID,
ADD COLUMN     "reason" VARCHAR(255),
ADD COLUMN     "request_key" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_request_key_key" ON "stock_movements"("request_key");
