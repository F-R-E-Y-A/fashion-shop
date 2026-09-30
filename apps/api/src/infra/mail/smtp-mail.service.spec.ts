import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SmtpMailService } from './smtp-mail.service.js';

const sendMail = vi.hoisted(() => vi.fn());
vi.mock('nodemailer', () => ({ createTransport: () => ({ sendMail }) }));

const SETTINGS: Record<string, unknown> = {
  SMTP_HOST: 'smtp.internal.test',
  SMTP_PORT: 587,
  SMTP_SECURE: false,
  SMTP_USER: 'smtp-user-secret',
  SMTP_PASS: 'smtp-pass-secret',
  SMTP_FROM: 'noreply@shop.test',
};
const RECIPIENT = 'someone.private@example.com';
const message = { to: RECIPIENT, subject: 'Xac thuc', text: 'Ma cua ban la 123456' };

describe('SmtpMailService failure logging', () => {
  let logged: string[];

  beforeEach(() => {
    logged = [];
    for (const level of ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'] as const) {
      vi.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });
    }
    sendMail.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const service = () => new SmtpMailService({ get: (key: string) => SETTINGS[key] } as never);

  it('still sends with the configured sender and rethrows the original error on failure', async () => {
    const failure = Object.assign(new Error('boom'), { code: 'ECONNECTION' });
    sendMail.mockRejectedValue(failure);

    await expect(service().send(message)).rejects.toBe(failure);

    expect(sendMail).toHaveBeenCalledWith({ from: 'noreply@shop.test', ...message });
  });

  it('does not touch the log on success', async () => {
    sendMail.mockResolvedValue({});

    await service().send(message);

    expect(logged).toEqual([]);
  });

  it('logs only a classification, never the recipient, the server error text or any credential', async () => {
    sendMail.mockRejectedValue(
      Object.assign(new Error(`550 5.1.1 <${RECIPIENT}> User unknown; auth smtp-pass-secret`), {
        code: 'EENVELOPE',
        responseCode: 550,
        rejected: [RECIPIENT],
      }),
    );

    await expect(service().send(message)).rejects.toThrow();

    const output = logged.join('\n');
    expect(output).toContain('Gui email that bai');
    expect(output).toContain('code=EENVELOPE');
    expect(output).toContain('responseCode=550');
    for (const forbidden of [
      RECIPIENT,
      'someone.private',
      'User unknown',
      'smtp-user-secret',
      'smtp-pass-secret',
      'smtp.internal.test',
      '123456',
    ]) {
      expect(output).not.toContain(forbidden);
    }
  });

  it.each([
    ['a plain Error', new Error(`cannot reach ${RECIPIENT}`)],
    ['a thrown string', `cannot reach ${RECIPIENT}`],
    ['nothing at all', undefined],
    ['a free-text code that embeds an address', { code: RECIPIENT, responseCode: RECIPIENT }],
  ])('falls back to a fixed placeholder for %s', async (_label, thrown) => {
    sendMail.mockRejectedValue(thrown);

    await expect(service().send(message)).rejects.toBe(thrown);

    const output = logged.join('\n');
    expect(output).toContain('code=UNKNOWN responseCode=-');
    expect(output).not.toContain('someone.private');
  });
});
