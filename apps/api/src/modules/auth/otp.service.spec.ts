import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OtpPurpose } from '../../generated/prisma/client.js';
import { OtpService } from './otp.service.js';
import { hashOtpCode } from './otp.util.js';
import { OTP_MAX_ATTEMPTS } from './otp-policy.js';

const PEPPER = 'test-otp-pepper-with-at-least-thirty-two-characters';

function makeClient() {
  return {
    otpCode: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn(),
    },
  };
}

function makeService() {
  const config = { get: () => PEPPER };
  return new OtpService(config as never);
}

describe('OtpService.issue', () => {
  it('invalidates any existing unconsumed code before creating a fresh one', async () => {
    const client = makeClient();
    const service = makeService();

    const result = await service.issue(client as never, {
      email: 'a@example.com',
      purpose: OtpPurpose.EMAIL_VERIFICATION,
      userId: 'user-1',
    });

    expect(client.otpCode.updateMany).toHaveBeenCalledWith({
      where: { email: 'a@example.com', purpose: OtpPurpose.EMAIL_VERIFICATION, consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
    const createArgs = client.otpCode.create.mock.calls[0]?.[0];
    expect(createArgs.data).toMatchObject({
      email: 'a@example.com',
      userId: 'user-1',
      purpose: OtpPurpose.EMAIL_VERIFICATION,
      sendCount: 1,
    });
    expect(createArgs.data.codeHash).not.toBe(result.code);
    expect(result.code).toMatch(/^\d{6}$/);
  });
});

describe('OtpService.verify', () => {
  let client: ReturnType<typeof makeClient>;
  let service: OtpService;

  beforeEach(() => {
    client = makeClient();
    service = makeService();
  });

  function activeOtp(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'otp-1',
      expiresAt: new Date(Date.now() + 60_000),
      attemptCount: 0,
      codeHash: hashOtpCode(PEPPER, 'a@example.com', OtpPurpose.EMAIL_VERIFICATION, '123456'),
      ...overrides,
    };
  }

  it('returns INVALID when no active code exists, without writing anything', async () => {
    client.otpCode.findFirst.mockResolvedValue(null);

    await expect(
      service.verify(client as never, {
        email: 'a@example.com',
        purpose: OtpPurpose.EMAIL_VERIFICATION,
        code: '123456',
      }),
    ).resolves.toEqual({ status: 'INVALID' });
    expect(client.otpCode.updateMany).not.toHaveBeenCalled();
  });

  it('returns EXPIRED for an expired code without incrementing attempts', async () => {
    client.otpCode.findFirst.mockResolvedValue(
      activeOtp({ expiresAt: new Date(Date.now() - 1_000) }),
    );

    await expect(
      service.verify(client as never, {
        email: 'a@example.com',
        purpose: OtpPurpose.EMAIL_VERIFICATION,
        code: '123456',
      }),
    ).resolves.toEqual({ status: 'EXPIRED' });
    expect(client.otpCode.updateMany).not.toHaveBeenCalled();
  });

  it('returns ATTEMPTS_EXCEEDED once the limit is reached, without writing anything', async () => {
    client.otpCode.findFirst.mockResolvedValue(activeOtp({ attemptCount: OTP_MAX_ATTEMPTS }));

    await expect(
      service.verify(client as never, {
        email: 'a@example.com',
        purpose: OtpPurpose.EMAIL_VERIFICATION,
        code: '123456',
      }),
    ).resolves.toEqual({ status: 'ATTEMPTS_EXCEEDED' });
    expect(client.otpCode.updateMany).not.toHaveBeenCalled();
  });

  it('persists the attemptCount increment and returns INVALID on a wrong code', async () => {
    client.otpCode.findFirst.mockResolvedValue(activeOtp());

    await expect(
      service.verify(client as never, {
        email: 'a@example.com',
        purpose: OtpPurpose.EMAIL_VERIFICATION,
        code: '000000',
      }),
    ).resolves.toEqual({ status: 'INVALID' });
    // updateMany (not update): the WHERE guard is what makes concurrent wrong attempts safe.
    expect(client.otpCode.updateMany).toHaveBeenCalledWith({
      where: { id: 'otp-1', consumedAt: null, attemptCount: { lt: OTP_MAX_ATTEMPTS } },
      data: { attemptCount: { increment: 1 } },
    });
  });

  it('reports ATTEMPTS_EXCEEDED, not INVALID, when a concurrent request already used up the last attempt', async () => {
    client.otpCode.findFirst.mockResolvedValue(activeOtp());
    client.otpCode.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.verify(client as never, {
        email: 'a@example.com',
        purpose: OtpPurpose.EMAIL_VERIFICATION,
        code: '000000',
      }),
    ).resolves.toEqual({ status: 'ATTEMPTS_EXCEEDED' });
  });

  it('consumes the code and returns VERIFIED on a correct match', async () => {
    client.otpCode.findFirst.mockResolvedValue(activeOtp());

    await expect(
      service.verify(client as never, {
        email: 'a@example.com',
        purpose: OtpPurpose.EMAIL_VERIFICATION,
        code: '123456',
      }),
    ).resolves.toEqual({ status: 'VERIFIED' });
    expect(client.otpCode.updateMany).toHaveBeenCalledWith({
      where: { id: 'otp-1', consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it('reports INVALID, not VERIFIED, when a concurrent request already consumed the same code', async () => {
    client.otpCode.findFirst.mockResolvedValue(activeOtp());
    client.otpCode.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.verify(client as never, {
        email: 'a@example.com',
        purpose: OtpPurpose.EMAIL_VERIFICATION,
        code: '123456',
      }),
    ).resolves.toEqual({ status: 'INVALID' });
  });
});

describe('OtpService.isWithinResendCooldown', () => {
  it('is false when no code has ever been issued', async () => {
    const client = makeClient();
    client.otpCode.findFirst.mockResolvedValue(null);
    const service = makeService();

    await expect(
      service.isWithinResendCooldown(client as never, {
        email: 'a@example.com',
        purpose: OtpPurpose.EMAIL_VERIFICATION,
      }),
    ).resolves.toBe(false);
  });

  it('is true right after a code was issued and false once the cooldown elapses', async () => {
    const client = makeClient();
    const service = makeService();

    client.otpCode.findFirst.mockResolvedValue({ createdAt: new Date() });
    await expect(
      service.isWithinResendCooldown(client as never, {
        email: 'a@example.com',
        purpose: OtpPurpose.EMAIL_VERIFICATION,
      }),
    ).resolves.toBe(true);

    client.otpCode.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 61_000) });
    await expect(
      service.isWithinResendCooldown(client as never, {
        email: 'a@example.com',
        purpose: OtpPurpose.EMAIL_VERIFICATION,
      }),
    ).resolves.toBe(false);
  });
});
