import { Injectable } from '@nestjs/common';

import { type MailMessage, MailService } from '../../src/infra/mail/mail.service.js';

/**
 * Test-only substitute for SmtpMailService: HTTP tests must never need a real SMTP server.
 * Records every message so tests can assert an email "was sent" without parsing a mailbox.
 */
@Injectable()
export class FakeMailService extends MailService {
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }

  lastCodeSentTo(to: string): string | undefined {
    const message = [...this.sent].reverse().find((entry) => entry.to === to);
    return message?.text.match(/\b\d{6}\b/)?.[0];
  }
}
