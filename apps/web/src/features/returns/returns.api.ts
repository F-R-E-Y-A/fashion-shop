import { type Page, sessionQueryKeys } from '@/core';

/** Hinh dang khop apps/api/src/modules/returns/dto/return.response.ts (Swagger /api/docs). */
export type ReturnStatus =
  'REQUESTED' | 'APPROVED' | 'REJECTED' | 'RECEIVED' | 'COMPLETED' | 'CANCELLED';
export type ReturnReason =
  'SIZE_MISMATCH' | 'NOT_AS_EXPECTED' | 'DEFECTIVE' | 'WRONG_ITEM' | 'CHANGED_MIND';
export type RefundMethod = 'GATEWAY' | 'BANK_TRANSFER';
export type ReturnBlocker = 'NOT_DELIVERED' | 'WINDOW_CLOSED' | 'RETURN_EXISTS' | 'NOT_PAID';

export interface EligibleItem {
  orderItemId: string;
  name: string;
  variantLabel: string | null;
  imageUrl: string | null;
  unitPrice: string;
  quantity: number;
}
export interface ReturnEligibility {
  eligible: boolean;
  blocker: ReturnBlocker | null;
  deadline: string | null;
  existingReturnId: string | null;
  refundMethod: RefundMethod;
  uploadsEnabled: boolean;
  windowDays: number;
  mediaMax: number;
  items: EligibleItem[];
}
export interface ReturnLine extends EligibleItem {
  refundAmount: string;
}
export interface ReturnRequest {
  id: string;
  orderId: string;
  orderCode: string;
  status: ReturnStatus;
  reasonCode: ReturnReason;
  description: string | null;
  decisionNote: string | null;
  items: ReturnLine[];
  media: { url: string }[];
  refundAmount: string;
  refundShipping: string;
  refundMethod: RefundMethod;
  shopPaysReturnShipping: boolean;
  hasRefundAccount: boolean;
  canCancel: boolean;
  createdAt: string;
  decidedAt: string | null;
  receivedAt: string | null;
  completedAt: string | null;
}
export interface RefundAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}
export interface AdminReturn extends ReturnRequest {
  customerEmail: string;
  refundAccount: RefundAccount | null;
  refund: { status: string; amount: string; reference: string | null } | null;
  paymentGateway: string | null;
}
export interface UploadTicket {
  uploadUrl: string;
  fields: Record<string, string>;
  key: string;
  expiresAt: string;
  maxBytes: number;
  formats: string[];
}

/** Than POST /orders/:orderId/returns. */
export interface ReturnInput {
  items: { orderItemId: string; quantity: number }[];
  reasonCode: ReturnReason;
  description?: string;
  mediaKeys?: string[];
  refundAccount?: RefundAccount;
}

export type ReturnPage = Page<ReturnRequest>;
export type AdminReturnPage = Page<AdminReturn>;
export type AdminReturnTab = ReturnStatus | 'ALL';
export interface AdminReturnFilters {
  status: AdminReturnTab;
  page: number;
}

/**
 * Du lieu cua khach nam duoi goc `session` de dang xuat la xoa; du lieu quan tri theo actor
 * (session/admin/returns/<actor>/...) de mat quyen la xoa dung phan cua actor do.
 */
export const returnKeys = {
  mine: (userId: string) => [...sessionQueryKeys.scope('returns'), userId] as const,
  eligibility: (userId: string, orderId: string) =>
    [...returnKeys.mine(userId), 'eligibility', orderId] as const,
  list: (userId: string, page: number) => [...returnKeys.mine(userId), 'list', page] as const,
  detail: (userId: string, id: string) => [...returnKeys.mine(userId), 'detail', id] as const,
  admin: (actor: string) => [...sessionQueryKeys.adminResource('returns'), actor] as const,
  adminList: (actor: string, filters: AdminReturnFilters) =>
    [...returnKeys.admin(actor), 'list', filters.status, filters.page] as const,
  adminDetail: (actor: string, id: string) => [...returnKeys.admin(actor), 'detail', id] as const,
};

export const RETURN_REASONS: ReturnReason[] = [
  'SIZE_MISMATCH',
  'NOT_AS_EXPECTED',
  'DEFECTIVE',
  'WRONG_ITEM',
  'CHANGED_MIND',
];
export const REASON_LABELS: Record<ReturnReason, string> = {
  SIZE_MISMATCH: 'Cỡ không vừa',
  NOT_AS_EXPECTED: 'Kiểu, màu hoặc chất liệu khác mong đợi',
  DEFECTIVE: 'Hàng lỗi hoặc hư hỏng',
  WRONG_ITEM: 'Giao sai hoặc thiếu hàng',
  CHANGED_MIND: 'Đổi ý',
};
export const STATUS_LABELS: Record<ReturnStatus, string> = {
  REQUESTED: 'Chờ shop duyệt',
  APPROVED: 'Shop đã duyệt',
  REJECTED: 'Bị từ chối',
  RECEIVED: 'Shop đã nhận hàng',
  COMPLETED: 'Đã hoàn tiền',
  CANCELLED: 'Đã huỷ',
};
export const STATUS_TONES: Record<ReturnStatus, 'pending' | 'accent' | 'danger' | 'muted'> = {
  REQUESTED: 'pending',
  APPROVED: 'pending',
  RECEIVED: 'pending',
  COMPLETED: 'accent',
  REJECTED: 'danger',
  CANCELLED: 'muted',
};
export const ADMIN_TABS: { value: AdminReturnTab; label: string }[] = [
  { value: 'REQUESTED', label: 'Chờ duyệt' },
  { value: 'APPROVED', label: 'Chờ nhận hàng' },
  { value: 'RECEIVED', label: 'Chờ hoàn tiền' },
  { value: 'COMPLETED', label: 'Đã hoàn tiền' },
  { value: 'REJECTED', label: 'Từ chối' },
  { value: 'CANCELLED', label: 'Đã huỷ' },
  { value: 'ALL', label: 'Tất cả' },
];
export const SHIPPING_POLICY =
  'Shop chịu phí gửi trả khi hàng lỗi hoặc giao sai; lý do khác khách chịu phí gửi trả.';
export const REFUND_METHOD_TEXT: Record<RefundMethod, string> = {
  GATEWAY: 'Tiền hoàn về đúng phương thức đã thanh toán.',
  BANK_TRANSFER: 'Shop chuyển khoản vào tài khoản bạn nhập.',
};
export const DESCRIPTION_MAX = 1000;
/** Khop pattern o may chu cho ma giao dich chuyen khoan hoan tien. */
export const TRANSFER_REFERENCE = /^[A-Za-z0-9._-]{4,64}$/;
/** Ly do can anh de shop kiem tra: khop RETURN_PHOTO_REQUIRED o may chu. */
export const PHOTO_REASONS: ReturnReason[] = ['DEFECTIVE', 'WRONG_ITEM'];

export function adminReturnPath(filters: AdminReturnFilters): string {
  const query = new URLSearchParams({ page: String(filters.page), pageSize: '20' });
  if (filters.status !== 'ALL') query.set('status', filters.status);
  return `/admin/returns?${query.toString()}`;
}

export function formatReturnDate(iso: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(iso));
}
