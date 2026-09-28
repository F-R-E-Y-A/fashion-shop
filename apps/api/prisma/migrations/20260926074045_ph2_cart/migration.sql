-- AlterTable: cho phep khach vang lai chua dang nhap (user_id co the null) va them guest_token
ALTER TABLE "carts" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "carts" ADD COLUMN "guest_token" VARCHAR(64);

-- AlterTable: so luong mac dinh khi them dong moi la 1
ALTER TABLE "cart_items" ALTER COLUMN "quantity" SET DEFAULT 1;

-- CreateIndex: ma khach vang lai phai duy nhat
CREATE UNIQUE INDEX "carts_guest_token_key" ON "carts"("guest_token");
