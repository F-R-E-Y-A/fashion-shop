import { QueryClient } from '@tanstack/react-query';

/**
 * Cấu hình mặc định cho các query mang tiền tố ['uncertain'].
 * Marker kết quả chưa xác định (create/edit/status) phải sống suốt phiên
 * (gcTime: Infinity) để không bị cache dọn rác khi người dùng rời trang quá 5 phút.
 */
export function configureUncertainQueryDefaults(client: QueryClient): void {
  client.setQueryDefaults(['uncertain'], {
    gcTime: Infinity,
    staleTime: Infinity,
  });
}

/** Mot QueryClient cho ca trang, khai o day de bai kiem thu dung duoc cung cau hinh. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

configureUncertainQueryDefaults(queryClient);
