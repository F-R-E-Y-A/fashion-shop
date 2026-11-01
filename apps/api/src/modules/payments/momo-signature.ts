import { createHmac, timingSafeEqual } from 'node:crypto';

export const momoNotificationFields = [
  'amount',
  'extraData',
  'message',
  'orderId',
  'orderInfo',
  'orderType',
  'partnerCode',
  'payType',
  'requestId',
  'responseTime',
  'resultCode',
  'transId',
] as const;

export function momoData(
  accessKey: string,
  data: Record<string, string>,
  fields: readonly string[],
) {
  return [`accessKey=${accessKey}`, ...fields.map((key) => `${key}=${data[key] ?? ''}`)].join('&');
}
export function momoHash(secret: string, data: string) {
  return createHmac('sha256', secret).update(data, 'utf8').digest('hex');
}
export function momoValidHash(secret: string, data: string, signature: string | undefined) {
  return (
    !!signature &&
    /^[a-f0-9]{64}$/iu.test(signature) &&
    timingSafeEqual(Buffer.from(momoHash(secret, data), 'hex'), Buffer.from(signature, 'hex'))
  );
}
export function momoParams(raw: Record<string, unknown>): Record<string, string> | null {
  const result: Record<string, string> = {};
  for (const key of [...momoNotificationFields, 'signature', 'payUrl']) {
    const value = raw[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isSafeInteger(value)))
      return null;
    const text = String(value);
    if (text.length > 4096) return null;
    result[key] = text;
  }
  return result;
}
