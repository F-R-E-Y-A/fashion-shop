import { registerDecorator, type ValidationOptions } from 'class-validator';

/**
 * Shared OTP policy for every OtpPurpose (EMAIL_VERIFICATION, PASSWORD_RESET, ...).
 * One place to tune these numbers so a purpose-specific need doesn't scatter magic values.
 */
export const OTP_CODE_DIGITS = 6;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

const OTP_CODE_PATTERN = new RegExp(`^\\d{${OTP_CODE_DIGITS}}$`);
export const OTP_CODE_MESSAGE = `Ma xac thuc phai gom dung ${OTP_CODE_DIGITS} chu so`;

/** Reusable DTO decorator so every OTP-code field (verify-email, reset-password, ...) validates identically. */
export function IsOtpCode(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isOtpCode',
      target: target.constructor,
      propertyName: String(propertyKey),
      options: validationOptions,
      validator: {
        validate: (value: unknown): value is string =>
          typeof value === 'string' && OTP_CODE_PATTERN.test(value),
        defaultMessage: () => OTP_CODE_MESSAGE,
      },
    });
  };
}
