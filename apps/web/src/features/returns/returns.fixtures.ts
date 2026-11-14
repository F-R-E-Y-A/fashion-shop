import { ApiError } from '@/core';

import type { AdminReturn, ReturnEligibility, ReturnLine, ReturnRequest } from './returns.api.js';

/** Du lieu dung chung cho cac bai kiem thu cua feature; khong duoc import tu ma san pham. */
export const line = (overrides: Partial<ReturnLine> = {}): ReturnLine => ({
  orderItemId: 'oi1',
  name: 'Áo thun cổ tròn',
  variantLabel: 'Đen / M',
  imageUrl: null,
  unitPrice: '200000.00',
  quantity: 2,
  refundAmount: '200000.00',
  ...overrides,
});

export const eligibility = (overrides: Partial<ReturnEligibility> = {}): ReturnEligibility => ({
  eligible: true,
  blocker: null,
  deadline: '2026-11-29T03:00:00.000Z',
  existingReturnId: null,
  refundMethod: 'GATEWAY',
  uploadsEnabled: true,
  windowDays: 15,
  mediaMax: 3,
  items: [
    {
      orderItemId: 'oi1',
      name: 'Áo thun cổ tròn',
      variantLabel: 'Đen / M',
      imageUrl: null,
      unitPrice: '200000.00',
      quantity: 2,
    },
    {
      orderItemId: 'oi2',
      name: 'Chân váy xếp ly',
      variantLabel: null,
      imageUrl: null,
      unitPrice: '350000.00',
      quantity: 1,
    },
  ],
  ...overrides,
});

export const returnRequest = (overrides: Partial<ReturnRequest> = {}): ReturnRequest => ({
  id: 'r1',
  orderId: 'o1',
  orderCode: 'FR-O1',
  status: 'REQUESTED',
  reasonCode: 'SIZE_MISMATCH',
  description: 'Áo hơi chật vai.',
  decisionNote: null,
  items: [line()],
  media: [],
  refundAmount: '200000.00',
  refundShipping: '0.00',
  refundMethod: 'GATEWAY',
  shopPaysReturnShipping: false,
  hasRefundAccount: false,
  canCancel: true,
  createdAt: '2026-11-12T03:00:00.000Z',
  decidedAt: null,
  receivedAt: null,
  completedAt: null,
  ...overrides,
});

export const adminReturn = (overrides: Partial<AdminReturn> = {}): AdminReturn => ({
  ...returnRequest(),
  customerEmail: 'khach@example.test',
  refundAccount: null,
  refund: null,
  paymentGateway: 'VNPAY',
  ...overrides,
});

export const page = <T>(items: T[]) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 10,
  totalPages: 1,
});

export const apiError = (statusCode: number, code: string, message = code) =>
  new ApiError({ statusCode, code, message, path: '/api/returns', timestamp: '' });

/** jsdom chua co showModal va URL.createObjectURL: stub toi thieu cho hop va anh xem truoc. */
export function stubBrowser() {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal(): void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto.close = function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
  let preview = 0;
  Object.assign(URL, {
    createObjectURL: () => `blob:preview-${(preview += 1)}`,
    revokeObjectURL: () => undefined,
  });
}
