import type { MailMessage } from '../../infra/mail/mail.service.js';

/** Composes the verification email; MailService only knows how to send, not what to say. */
export function buildVerificationEmail(params: { to: string; code: string }): MailMessage {
  const { to, code } = params;
  const subject = 'Ma xac thuc tai khoan Fashion Shop';
  const text = [
    'Ban vua dang ky tai khoan tren Fashion Shop.',
    `Ma xac thuc cua ban la: ${code}`,
    'Ma co hieu luc trong 10 phut.',
    'Khong chia se ma nay voi bat ky ai, ke ca nhan vien Fashion Shop.',
    'Neu ban khong yeu cau dang ky, hay bo qua email nay.',
  ].join('\n');
  const html = `
    <p>Ban vua dang ky tai khoan tren Fashion Shop.</p>
    <p>Ma xac thuc cua ban la: <strong style="font-size:1.25em;letter-spacing:0.2em">${code}</strong></p>
    <p>Ma co hieu luc trong 10 phut.</p>
    <p>Khong chia se ma nay voi bat ky ai, ke ca nhan vien Fashion Shop.</p>
    <p>Neu ban khong yeu cau dang ky, hay bo qua email nay.</p>
  `.trim();

  return { to, subject, text, html };
}
