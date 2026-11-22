import { describe, expect, it } from 'vitest';

import { humanizeGatewayError, refundSummary } from './refund-ledger.js';

describe('humanizeGatewayError & refundSummary', () => {
  it('dịch lỗi timeout của AbortSignal sang thông báo tiếng Việt dễ hiểu', () => {
    const domTimeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    expect(humanizeGatewayError(domTimeout)).toBe('Hết thời gian chờ phản hồi từ cổng thanh toán.');
    expect(humanizeGatewayError('The operation was aborted due to timeout')).toBe(
      'Hết thời gian chờ phản hồi từ cổng thanh toán.',
    );
  });

  it('dịch lỗi ngắt kết nối / fetch failed và giữ nguyên thông điệp nghiệp vụ tiếng Việt', () => {
    expect(humanizeGatewayError(new TypeError('fetch failed'))).toBe(
      'Không thể kết nối tới cổng thanh toán.',
    );
    expect(humanizeGatewayError(new DOMException('This operation was aborted', 'AbortError'))).toBe(
      'Kết nối tới cổng thanh toán bị ngắt trước khi nhận phản hồi.',
    );
    expect(humanizeGatewayError('Cổng từ chối hoàn tiền (mã 94).')).toBe(
      'Cổng từ chối hoàn tiền (mã 94).',
    );
  });

  it('refundSummary chuẩn hoá lastError cũ đã lưu dạng tiếng Anh khi đọc lại ledger', () => {
    const summary = refundSummary([
      {
        id: 'tx-1',
        externalTransactionId: 'REFUND-INTENT:abc',
        status: 'RECEIVED',
        createdAt: new Date('2026-11-20T00:00:00.000Z'),
        payload: {
          amount: '150000.00',
          lastError: 'The operation was aborted due to timeout',
        },
      },
    ]);

    expect(summary.pending?.lastError).toBe('Hết thời gian chờ phản hồi từ cổng thanh toán.');
  });
});
