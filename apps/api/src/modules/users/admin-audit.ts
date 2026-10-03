/**
 * Ma hanh dong va loai doi tuong ghi vao `audit_logs` cho thao tac quan tri tai khoan. Mot noi duy
 * nhat de truy van nhat ky sau nay (va bao cao) khong phai doan chuoi.
 */
export const AdminAuditAction = {
  LOCK_USER: 'LOCK_USER',
  UNLOCK_USER: 'UNLOCK_USER',
} as const;

export type AdminAuditAction = (typeof AdminAuditAction)[keyof typeof AdminAuditAction];

export const AUDIT_ENTITY_USER = 'USER';
