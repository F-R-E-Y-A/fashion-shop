/**
 * Nguon duy nhat cua ma vai trong TypeScript: guard, service, script va test deu doc tu day,
 * khong ai go chuoi 'ADMIN' hay 'CUSTOMER' rieng.
 *
 * Ban ghi trong bang `roles` do migration 20260930120000_ph3_role_catalog nap (khong phai seed, vi
 * production khong chay seed). SQL khong import duoc hang so TypeScript nen role-code.spec.ts doi
 * chieu hai noi: them ma vao day ma quen migration thi bai test do.
 */
export const RoleCode = {
  CUSTOMER: 'CUSTOMER',
  ADMIN: 'ADMIN',
} as const;

export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode];

export const ROLE_CODES: readonly RoleCode[] = Object.values(RoleCode);
