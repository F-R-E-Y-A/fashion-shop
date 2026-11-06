import { expect, type Page } from '@playwright/test';

/** Hinh dang dong JSON ma apps/api/test/e2e/seed.ts in ra. */
export interface E2eFixture {
  customer: { email: string; password: string };
  admin: { email: string; password: string };
  product: { slug: string; color: string; size: string; stock: number };
  variantId: string;
}

export function fixture(): E2eFixture {
  const raw = process.env.E2E_FIXTURE;
  if (!raw) throw new Error('Thieu E2E_FIXTURE: global-setup chua chay seed.');
  return JSON.parse(raw) as E2eFixture;
}

/** Dang nhap qua form that; cho roi khoi /login de chac phien da duoc ghi. */
export async function login(page: Page, account: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Mật khẩu').fill(account.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/\/login/u);
}
