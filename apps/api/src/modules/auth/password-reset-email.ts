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

/** Composes the notification email sent AFTER a successful password reset. Contains NO credentials. */
export function buildPasswordChangedEmail(params: { to: string; changedAt: Date }): MailMessage {
  const { to, changedAt } = params;
  const timeString = changedAt.toISOString();
  const subject = '[F.R.E.Y.A.] Mat khau tai khoan cua ban da duoc thay doi';
  const text = [
    'Mat khau tai khoan F.R.E.Y.A. cua ban da duoc thay doi thanh cong.',
    `Thoi diem: ${timeString}`,
    'Neu ban khong thuc hien thay doi nay, tai khoan cua ban co the da bi xam nhap.',
    'Vui long lien he ngay voi bo phan ho tro khach hang F.R.E.Y.A. qua email freya.shop.bdt@gmail.com de duoc ho tro.',
  ].join('\n');
  const html = `
    <p>Mat khau tai khoan <strong>F.R.E.Y.A.</strong> cua ban da duoc thay doi thanh cong.</p>
    <p>Thoi diem: <code>${timeString}</code></p>
    <p>Neu ban khong thuc hien thay doi nay, tai khoan cua ban co the da bi xam nhap.</p>
    <p>Vui long lien he ngay voi bo phan ho tro khach hang F.R.E.Y.A. qua email <strong>freya.shop.bdt@gmail.com</strong> de duoc ho tro.</p>
  `.trim();

  return { to, subject, text, html };
}
