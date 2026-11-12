/**
 * Ma hanh dong ghi vao `audit_logs` khi quan tri xu ly danh gia. Cung khuon voi users/admin-audit.ts
 * de bao cao sau nay loc theo entity_type khong phai doan chuoi.
 */
export const ReviewAuditAction = {
  APPROVE: 'REVIEW_APPROVED',
  REJECT: 'REVIEW_REJECTED',
  REPLY: 'REVIEW_REPLIED',
  REMOVE_REPLY: 'REVIEW_REPLY_REMOVED',
  CLEAR_REPORTS: 'REVIEW_REPORTS_CLEARED',
} as const;

export type ReviewAuditAction = (typeof ReviewAuditAction)[keyof typeof ReviewAuditAction];

export const AUDIT_ENTITY_REVIEW = 'REVIEW';
