import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sessionQueryKeys } from '@/core';
import { AuthProvider, RequireAdmin, useAuth } from '@/features/account';

import { adminOrderKeys } from './admin-orders.api.js';
import { AdminOrderDetailPage } from './AdminOrderDetailPage.js';
import { base } from './test-support/order-fixture.js';

type Auth = ReturnType<typeof useAuth>;
const actor = { id: 'admin1', email: 'admin@example.test', roles: ['ADMIN'] };
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const holder: { auth?: Auth } = {};
  function Capture() {
    holder.auth = useAuth();
    return null;
  }
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Capture />
        <MemoryRouter initialEntries={['/admin/orders/o1']}>
          <Routes>
            <Route element={<RequireAdmin />}>
              <Route path="/admin/orders/:id" element={<AdminOrderDetailPage />} />
            </Route>
            <Route path="/login" element={<p>Đã kết thúc phiên</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { client, auth: () => holder.auth! };
}

describe('UC-01.4/AC7 — cache admin với AuthProvider thật (#57)', () => {
  it('logout xóa cache đơn và hủy GET đang chờ; dữ liệu công khai vẫn còn', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let hold = false;
    let requestSignal: AbortSignal | null | undefined;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith('/auth/refresh')) return reply({ accessToken: 'synthetic', user: actor });
      if (path.endsWith('/auth/logout')) return reply({});
      if (hold) {
        requestSignal = init?.signal;
        await gate; // Mô phỏng phản hồi đến muộn kể cả khi transport không tôn trọng abort.
      }
      return reply(base);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { client, auth } = mount();
    await screen.findByRole('heading', { name: base.orderCode });
    expect(auth().user?.id).toBe(actor.id);
    client.setQueryData(['public-catalog'], { retained: true });
    for (const scope of ['profile', 'addresses', 'orders', 'checkout']) {
      client.setQueryData([...sessionQueryKeys.scope(scope), actor.id, 'seed'], { private: true });
    }
    client.setQueryData([...sessionQueryKeys.adminResource('users'), actor.id, 'seed'], {
      private: true,
    });
    hold = true;
    act(() => {
      void client.invalidateQueries({ queryKey: adminOrderKeys.all(actor.id) });
    });
    await waitFor(() => expect(requestSignal).toBeDefined());
    await act(async () => {
      await auth().logout();
    });
    expect(requestSignal?.aborted).toBe(true);
    expect(client.getQueryData(adminOrderKeys.detail(actor.id, base.id))).toBeUndefined();
    expect(client.getQueryData(['public-catalog'])).toEqual({ retained: true });
    expect(
      client
        .getQueriesData({ queryKey: sessionQueryKeys.all })
        .every(([, data]) => data === undefined),
    ).toBe(true);
    await act(async () => {
      release();
      await gate;
    });
    expect(client.getQueryData(adminOrderKeys.detail(actor.id, base.id))).toBeUndefined();
    expect(screen.queryByText(base.customerEmail)).not.toBeInTheDocument();
  });
});
