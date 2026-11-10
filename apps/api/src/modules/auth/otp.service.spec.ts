import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OtpPurpose } from '../../generated/prisma/client.js';
import { OtpService } from './otp.service.js';
import { hashOtpCode } from './otp.util.js';
import { OTP_MAX_ATTEMPTS } from './otp-policy.js';

const PEPPER = 'test-otp-pepper-with-at-least-thirty-two-characters';

function makeClient() {
  return {
    // Tagged-template call: $executeRaw`SELECT pg_advisory_xact_lock(...)`.
    $executeRaw: vi.fn().mockResolvedValue(1),
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

describe('OtpService.issueIfCooldownElapsed', () => {
  const params = { email: 'a@example.com', purpose: OtpPurpose.PASSWORD_RESET, userId: 'user-1' };

  it('takes the advisory lock BEFORE reading the cooldown, then issues when it has elapsed', async () => {
    const client = makeClient();
    const order: string[] = [];
    client.$executeRaw.mockImplementation(async () => {
      order.push('lock');
      return 1;
    });
    client.otpCode.findFirst.mockImplementation(async () => {
      order.push('cooldown-read');
      return null;
    });
    client.otpCode.create.mockImplementation(async () => {
      order.push('create');
      return {};
    });

    const issued = await makeService().issueIfCooldownElapsed(client as never, params);

    expect(order).toEqual(['lock', 'cooldown-read', 'create']);
    expect(issued?.code).toMatch(/^\d{6}$/);
  });

  it('issues nothing and creates no row while a recent code is inside the cooldown', async () => {
    const client = makeClient();
    client.otpCode.findFirst.mockResolvedValue({ createdAt: new Date() });

    await expect(makeService().issueIfCooldownElapsed(client as never, params)).resolves.toBeNull();

    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
    expect(client.otpCode.create).not.toHaveBeenCalled();
    expect(client.otpCode.updateMany).not.toHaveBeenCalled();
  });

  it('locks on a key that is the same for the same email+purpose and never contains the raw email', async () => {
    const lockKeys: string[] = [];
    const record = (client: ReturnType<typeof makeClient>) =>
      client.$executeRaw.mockImplementation(async (_strings: unknown, key: string) => {
        lockKeys.push(key);
        return 1;
      });
    const first = makeClient();
    const second = makeClient();
    const other = makeClient();
    [first, second, other].forEach(record);
    first.otpCode.findFirst.mockResolvedValue(null);
    second.otpCode.findFirst.mockResolvedValue(null);
    other.otpCode.findFirst.mockResolvedValue(null);
    const service = makeService();

    await service.issueIfCooldownElapsed(first as never, params);
    await service.issueIfCooldownElapsed(second as never, params);
    await service.issueIfCooldownElapsed(other as never, {
      ...params,
      purpose: OtpPurpose.EMAIL_VERIFICATION,
    });

    expect(lockKeys[0]).toBe(lockKeys[1]);
    // Different purpose for the same email must not serialize against password reset.
    expect(lockKeys[2]).not.toBe(lockKeys[0]);
    expect(lockKeys.join(' ')).not.toContain('example.com');
    expect(lockKeys[0]).toMatch(/^[0-9a-f]{64}$/);
  });
});
