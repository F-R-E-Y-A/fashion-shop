/**
 * Bo mot y da hieu khoi cau: xoa dung cac tu da tao ra no. `tokens` la vi tri tu
 * (tach theo khoang trang) ma may chu tra trong tung chip cua `interpretation`.
 */
export function removeTokens(q: string, tokens: readonly number[]): string {
  return q
    .split(/\s+/)
    .filter(Boolean)
    .filter((_, index) => !tokens.includes(index))
    .join(' ');
}
