import { registerDecorator, type ValidationOptions } from 'class-validator';

export const PASSWORD_POLICY_MESSAGE =
  'Mat khau phai co it nhat 8 ky tu, mot chu cai hoa va mot chu so';

export function isStrongPassword(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length >= 8 && /[A-Z]/u.test(value) && /\d/u.test(value)
  );
}

/** Reusable DTO decorator; password-strength rules do not belong in controllers or services. */
export function IsStrongPassword(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isStrongPassword',
      target: target.constructor,
      propertyName: String(propertyKey),
      options: validationOptions,
      validator: {
        validate: isStrongPassword,
        defaultMessage: () => PASSWORD_POLICY_MESSAGE,
      },
    });
  };
}
