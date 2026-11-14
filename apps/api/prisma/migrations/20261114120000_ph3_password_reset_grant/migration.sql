-- CreateTable
CREATE TABLE "public"."password_reset_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR NOT NULL,
    "auth_version" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_grants_token_hash_key" ON "public"."password_reset_grants"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_grants_token_hash_consumed_at_expires_at_idx" ON "public"."password_reset_grants"("token_hash", "consumed_at", "expires_at");

-- AddForeignKey
ALTER TABLE "public"."password_reset_grants" ADD CONSTRAINT "password_reset_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
