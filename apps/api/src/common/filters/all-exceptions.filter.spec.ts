import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AllExceptionsFilter } from './all-exceptions.filter.js';

function run(exception: unknown) {
  const json = vi.fn();
  const setHeader = vi.fn();
  const response = { status: vi.fn((_status: number) => ({ json })), setHeader };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'POST', url: '/api/checkout/orders' }),
    }),
  } as unknown as ArgumentsHost;
  const filter = new AllExceptionsFilter();
  vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  vi.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
  filter.catch(exception, host);
  return { status: response.status.mock.calls[0]![0], body: json.mock.calls[0]![0], setHeader };
}

describe('AllExceptionsFilter: het ket noi DB la qua tai tam thoi', () => {
  it('Prisma P2028 va pg-pool het han cho tra 503 SERVER_BUSY kem Retry-After', () => {
    const p2028 = Object.assign(
      new Error('Transaction API error: Unable to start a transaction in the given time.'),
      { code: 'P2028' },
    );
    for (const error of [p2028, new Error('timeout exceeded when trying to connect')]) {
      const { status, body, setHeader } = run(error);
      expect(status).toBe(503);
      expect(body).toMatchObject({ code: 'SERVER_BUSY' });
      expect(setHeader).toHaveBeenCalledWith('Retry-After', '2');
    }
  });

  it('loi khac van la 500 va khong lo thong diep noi bo', () => {
    const { status, body } = run(new Error('private detail'));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('private detail');
  });
});
