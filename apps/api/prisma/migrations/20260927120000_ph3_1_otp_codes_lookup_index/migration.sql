-- CreateIndex
CREATE INDEX "otp_codes_email_purpose_consumed_at_idx" ON "otp_codes"("email", "purpose", "consumed_at");
