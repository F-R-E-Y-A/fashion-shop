import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import type { Env } from '../../infra/config/env.js';
import { bcryptCost, PasswordHasherService } from './password-hasher.service.js';

const configFor = (nodeEnv: Env['NODE_ENV']) =>
  ({ get: () => nodeEnv }) as unknown as ConfigService<Env, true>;

describe('PasswordHasherService', () => {
  const password = 'Password123';

  it('hashes without retaining plaintext, cost 12 outside tests', async () => {
    const service = new PasswordHasherService(configFor('production'));

    const hash = await service.hash(password);

    expect(hash).not.toBe(password);
    expect(hash).toMatch(/^\$2[aby]\$12\$/u);
  });

  it('only NODE_ENV=test lowers the cost, never development, staging or production', () => {
    expect(bcryptCost('test')).toBe(4);
    for (const env of ['development', 'staging', 'production'] as const)
      expect(bcryptCost(env)).toBe(12);
  });

  it('a cost-4 test service still verifies hashes stored at cost 12', async () => {
    const stored = await new PasswordHasherService(configFor('production')).hash(password);
    const testService = new PasswordHasherService(configFor('test'));

    expect(await testService.hash(password)).toMatch(/^\$2[aby]\$04\$/u);
    await expect(testService.verify(password, stored)).resolves.toBe(true);
  });

  it('verifies the correct password', async () => {
    const service = new PasswordHasherService(configFor('test'));
    const hash = await service.hash(password);

    await expect(service.verify(password, hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const service = new PasswordHasherService(configFor('test'));
    const hash = await service.hash(password);

    await expect(service.verify('WrongPassword123', hash)).resolves.toBe(false);
  });

  it('uses a fresh salt for each hash', async () => {
    const service = new PasswordHasherService(configFor('test'));

    const [first, second] = await Promise.all([service.hash(password), service.hash(password)]);

    expect(first).not.toBe(second);
  });
});
