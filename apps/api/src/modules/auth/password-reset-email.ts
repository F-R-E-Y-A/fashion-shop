import type { MailMessage } from '../../infra/mail/mail.service.js';

/** Composes the password-reset email; MailService only knows how to send, not what to say. */
export function buildPasswordResetEmail(params: { to: string; code: string }): MailMessage {
  const { to, code } = params;
  const subject = 'Yeu cau dat lai mat khau Fashion Shop';
  const text = [
    'Co yeu cau dat lai mat khau cho tai khoan Fashion Shop cua ban.',
    `Ma dat lai mat khau cua ban la: ${code}`,
    'Ma co hieu luc trong 10 phut.',
    'Khong chia se ma nay voi bat ky ai, ke ca nhan vien Fashion Shop.',
    'Neu ban khong yeu cau dat lai mat khau, hay bo qua email nay; mat khau cua ban se khong doi.',
  ].join('\n');
  const html = `
    <p>Co yeu cau dat lai mat khau cho tai khoan Fashion Shop cua ban.</p>
    <p>Ma dat lai mat khau cua ban la: <strong style="font-size:1.25em;letter-spacing:0.2em">${code}</strong></p>
    <p>Ma co hieu luc trong 10 phut.</p>
    <p>Khong chia se ma nay voi bat ky ai, ke ca nhan vien Fashion Shop.</p>
    <p>Neu ban khong yeu cau dat lai mat khau, hay bo qua email nay; mat khau cua ban se khong doi.</p>
  `.trim();

  return { to, subject, text, html };
}
