import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { queryClient } from '@/core';

import { ErrorBoundary } from './ErrorBoundary.js';

/** Cay provider viet mot lan. Mot QueryClient cho ca trang nen hai trang cung du lieu dung chung bo dem. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
