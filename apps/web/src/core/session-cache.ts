import type { Query } from '@tanstack/react-query';

/** Dữ liệu riêng có chung gốc để kết thúc phiên không cần import các feature. */
export const sessionQueryKeys = {
  all: ['session'] as const,
  scope: (name: string) => ['session', name] as const,
  admin: ['session', 'admin'] as const,
  adminResource: (name: string) => ['session', 'admin', name] as const,
};

/** Khóa admin: session/admin/resource/actor/... hoặc uncertain/admin/resource/actor/...; 403 chỉ xóa dữ liệu admin của actor đó. */
export function isAdminQueryForActor(query: Query, actorId: string): boolean {
  const key = query.queryKey;
  if (key[0] === 'session' && key[1] === 'admin' && key[3] === actorId) return true;
  if (key[0] === 'uncertain' && key[1] === 'admin' && key[3] === actorId) return true;
  return false;
}

/** Giữ chỗ chỉ khi toàn bộ điều kiện giống nhau, trừ trang ở phần tử cuối. */
export function samePaginatedQuery(previous: readonly unknown[], current: readonly unknown[]) {
  return (
    previous.length === current.length &&
    current.slice(0, -1).every((part, index) => part === previous[index])
  );
}
