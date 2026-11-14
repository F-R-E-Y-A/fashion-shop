import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { ResetPasswordRequest } from './reset-password.request.js';

describe('ResetPasswordRequest proof validation (dual-contract)', () => {
  it('accepts valid new-contract payload with resetToken', async () => {
    const request = Object.assign(new ResetPasswordRequest(), {
      resetToken: 'd9b1c73a45c3614995f9d85aa990146747ddb8d6e7b1583c7c2b6ab8e3110589',
      newPassword: 'Password123',
    });

    const errors = await validate(request);
    expect(errors).toHaveLength(0);
  });

  it('accepts valid legacy-contract payload with email and 6-digit code', async () => {
    const request = Object.assign(new ResetPasswordRequest(), {
      email: 'khach@example.com',
      code: '123456',
      newPassword: 'Password123',
    });

    const errors = await validate(request);
    expect(errors).toHaveLength(0);
  });

  it('rejects payload with only newPassword (missing both proofs)', async () => {
    const request = Object.assign(new ResetPasswordRequest(), {
      newPassword: 'Password123',
    });

    const errors = await validate(request);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('newPassword');
    expect(errors[0]?.constraints?.resetPasswordProof).toBe(
      'Yeu cau dat lai mat khau phai cung cap resetToken hoac day du email va code hop le',
    );
  });

  it('rejects legacy payload missing code', async () => {
    const request = Object.assign(new ResetPasswordRequest(), {
      email: 'khach@example.com',
      newPassword: 'Password123',
    });

    const errors = await validate(request);
    expect(errors.length).toBeGreaterThan(0);
    const proofError = errors.find((e) => e.property === 'newPassword');
    expect(proofError?.constraints?.resetPasswordProof).toBeDefined();
  });

  it('rejects legacy payload missing email', async () => {
    const request = Object.assign(new ResetPasswordRequest(), {
      code: '123456',
      newPassword: 'Password123',
    });

    const errors = await validate(request);
    expect(errors.length).toBeGreaterThan(0);
    const proofError = errors.find((e) => e.property === 'newPassword');
    expect(proofError?.constraints?.resetPasswordProof).toBeDefined();
  });

  it('rejects payload with empty or whitespace-only resetToken', async () => {
    const request = Object.assign(new ResetPasswordRequest(), {
      resetToken: '   ',
      newPassword: 'Password123',
    });

    const errors = await validate(request);
    expect(errors.length).toBeGreaterThan(0);
    const proofError = errors.find((e) => e.property === 'newPassword');
    expect(proofError?.constraints?.resetPasswordProof).toBeDefined();
  });

  it('rejects invalid password format regardless of valid proof', async () => {
    const request = Object.assign(new ResetPasswordRequest(), {
      resetToken: 'd9b1c73a45c3614995f9d85aa990146747ddb8d6e7b1583c7c2b6ab8e3110589',
      newPassword: 'weak',
    });

    const errors = await validate(request);
    const passError = errors.find((e) => e.property === 'newPassword');
    expect(passError?.constraints?.isStrongPassword).toBeDefined();
  });
});
