import type { Prisma, UserStatus } from '../../generated/prisma/client.js';

export interface LockedUserState {
  status: UserStatus;
  authVersion: number;
}

/**
 * Khoa chia se (FOR SHARE) dong `users` trong transaction dang TAO hoac XOAY mot phien dang nhap, roi
 * tra trang thai MOI NHAT da commit cua dong do.
 *
 * Moi thao tac lam vo hieu phien (khoa tai khoan, doi hay dat lai mat khau) deu UPDATE dong nay truoc
 * khi thu hoi refresh token, ma UPDATE xung dot voi FOR SHARE, nen hai ben xep hang:
 *  - thao tac vo hieu chay truoc: ben tao phien doi no commit roi moi doc, thay LOCKED hay authVersion moi
 *    va tu choi;
 *  - ben tao phien chay truoc: UPDATE doi no commit, nen lenh thu hoi refresh token chay SAU va thay ca
 *    token vua tao.
 * Khong co khoa nay, mot login dang tinh bcrypt (hay mot refresh dang xoay) luc admin khoa tai khoan se
 * tao token ma lenh thu hoi khong thay; token do nam im khi bi khoa roi song lai sau khi mo khoa (ADR-022).
 *
 * Nhieu phien cua cung mot user van chay song song duoc: FOR SHARE khong xung dot voi FOR SHARE.
 */
export async function lockUserForSession(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<LockedUserState | null> {
  const rows = await transaction.$queryRaw<LockedUserState[]>`
    SELECT "status"::text AS "status", "auth_version" AS "authVersion"
    FROM "users"
    WHERE "id" = ${userId}::uuid
    FOR SHARE
  `;
  return rows[0] ?? null;
}

/**
 * Khoa dong `users` (FOR NO KEY UPDATE) trong transaction KET THUC mot phien (logout), truoc khi thu
 * hoi refresh token cua family. Khoa nay xung dot voi FOR SHARE cua login/refresh, nen hai ben xep hang:
 *  - refresh dang xoay chay truoc: logout doi no commit, roi lenh thu hoi (cau lenh moi, snapshot moi)
 *    thay ca token vua tao;
 *  - logout chay truoc: refresh doi, doc lai token thay da thu hoi va tra 401.
 * Chi FOR SHARE thi khong du: UPDATE cua logout co the khong thay token ma refresh vua chen (Issue #43).
 * Thu tu khoa giong moi luong khac: `users` truoc, `refresh_tokens` sau, nen khong co vong cho.
 */
export async function lockUserForSessionEnd(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await transaction.$queryRaw`
    SELECT 1 FROM "users" WHERE "id" = ${userId}::uuid FOR NO KEY UPDATE
  `;
}
