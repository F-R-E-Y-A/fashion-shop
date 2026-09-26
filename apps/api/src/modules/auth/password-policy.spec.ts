import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { RegisterRequest } from './dto/auth-credentials.request.js';
import { PASSWORD_POLICY_MESSAGE } from './password-policy.js';

describe('RegisterRequest password policy', () => {
  it('accepts a password with eight characters, uppercase letter, and digit', async () => {
    const request = Object.assign(new RegisterRequest(), {
      email: 'customer@example.com',
      password: 'Password123',
    });

    await expect(validate(request)).resolves.toHaveLength(0);
  });

  it('rejects a password that misses the centralized strength policy', async () => {
    const request = Object.assign(new RegisterRequest(), {
      email: 'customer@example.com',
      password: 'weakpass',
    });

    const errors = await validate(request);

    expect(errors[0]?.constraints?.isStrongPassword).toBe(PASSWORD_POLICY_MESSAGE);
  });
});
