import { QueryClient } from '@tanstack/react-query';

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
