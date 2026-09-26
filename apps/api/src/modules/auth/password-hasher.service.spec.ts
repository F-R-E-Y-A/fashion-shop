import { describe, expect, it } from 'vitest';

import { PasswordHasherService } from './password-hasher.service.js';

describe('PasswordHasherService', () => {
  const password = 'Password123';

  it('hashes without retaining plaintext', async () => {
    const service = new PasswordHasherService();

    const hash = await service.hash(password);

    expect(hash).not.toBe(password);
    expect(hash).toMatch(/^\$2[aby]\$12\$/u);
  });

  it('verifies the correct password', async () => {
    const service = new PasswordHasherService();
    const hash = await service.hash(password);

    await expect(service.verify(password, hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const service = new PasswordHasherService();
    const hash = await service.hash(password);

    await expect(service.verify('WrongPassword123', hash)).resolves.toBe(false);
  });

  it('uses a fresh salt for each hash', async () => {
    const service = new PasswordHasherService();

    const [first, second] = await Promise.all([service.hash(password), service.hash(password)]);

    expect(first).not.toBe(second);
  });
});
