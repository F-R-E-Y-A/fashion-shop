import { createHmac, timingSafeEqual } from 'node:crypto';

export type VnpParams = Record<string, string>;
export const queryResponseFields = [
  'ResponseId',
  'Command',
  'ResponseCode',
  'Message',
  'TmnCode',
  'TxnRef',
  'Amount',
  'BankCode',
  'PayDate',
  'TransactionNo',
  'TransactionType',
  'TransactionStatus',
  'OrderInfo',
  'PromotionCode',
  'PromotionAmount',
];
export const queryRequestFields = [
  'RequestId',
  'Version',
  'Command',
  'TmnCode',
  'TxnRef',
  'TransactionDate',
  'CreateDate',
  'IpAddr',
  'OrderInfo',
];

export function vnpDate(date: Date): string {
  return new Date(date.getTime() + 7 * 3600_000).toISOString().replace(/\D/gu, '').slice(0, 14);
}

export function queryString(params: VnpParams): string {
  const encode = (value: string) => encodeURIComponent(value).replace(/%20/gu, '+');
  return Object.keys(params)
    .filter((key) => key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType')
    .sort()
    .map((key) => `${encode(key)}=${encode(params[key]!)}`)
    .join('&');
}

export function pipeString(params: VnpParams, fields: string[]): string {
  return fields.map((field) => params[`vnp_${field}`] ?? '').join('|');
}

export function hmac(secret: string, data: string): string {
  return createHmac('sha512', secret).update(data, 'utf8').digest('hex');
}

export function validHash(secret: string, data: string, hash: string | undefined): boolean {
  return (
    !!hash &&
    /^[\da-f]{128}$/iu.test(hash) &&
    timingSafeEqual(Buffer.from(hmac(secret, data), 'hex'), Buffer.from(hash, 'hex'))
  );
}

/** Arrays/objects indicate duplicate or structured parameters, never sign their coercion. */
export function flatParams(raw: Record<string, unknown>): VnpParams | null {
  const result: VnpParams = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith('vnp_') || typeof value !== 'string' || value.length > 2048) return null;
    result[key] = value;
  }
  return result;
}
