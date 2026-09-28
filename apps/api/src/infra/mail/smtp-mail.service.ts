import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

import type { Env } from '../config/env.js';
import { type MailMessage, MailService } from './mail.service.js';

/**
 * SMTP implementation of MailService. Local development points this at Mailpit
 * (docker-compose.yml), so no real mailbox is needed to exercise the flow end to end.
 * createTransport() does not open a connection by itself; nodemailer only connects
 * when sendMail() is called, so a missing/unreachable SMTP server cannot fail app boot.
 */
@Injectable()
export class SmtpMailService extends MailService {
  private readonly logger = new Logger(SmtpMailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    const user = config.get('SMTP_USER', { infer: true });
    const pass = config.get('SMTP_PASS', { infer: true });

    this.from = config.get('SMTP_FROM', { infer: true });
    this.transporter = createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
      secure: config.get('SMTP_SECURE', { infer: true }),
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, ...message });
    } catch (error) {
      // Khong log nguoi nhan, noi dung loi (SMTP server hay lap lai dia chi trong thong bao loi),
      // cau hinh SMTP hay thong tin dang nhap: chi ghi ma loi phan loai.
      this.logger.error(`Gui email that bai (${describeMailFailure(error)})`);
      throw error;
    }
  }
}

/** Chi tra ve cac truong phan loai co hinh dang co dinh, khong bao gio chua van ban tu do. */
function describeMailFailure(error: unknown): string {
  const { code, responseCode } = (error ?? {}) as { code?: unknown; responseCode?: unknown };
  const safeCode = typeof code === 'string' && /^[A-Z0-9_]{1,32}$/.test(code) ? code : 'UNKNOWN';
  const safeResponse = Number.isInteger(responseCode) ? String(responseCode) : '-';
  return `code=${safeCode} responseCode=${safeResponse}`;
}
