-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "actor_user_id" UUID,
ADD COLUMN     "reason" VARCHAR(255);
