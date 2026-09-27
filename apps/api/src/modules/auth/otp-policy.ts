/** PH3.1 policy for the 6-digit email-verification OTP. One place to tune all three numbers. */
export const OTP_CODE_DIGITS = 6;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
