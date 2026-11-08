import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminOrderDetailPage } from './AdminOrderDetailPage.js';
import { AdminOrdersPage } from './AdminOrdersPage.js';
import { base } from './test-support/order-fixture.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/features/account', async (original) => ({
  ...(await original<typeof import('@/features/account')>()),
  useAuth: () => ({
    user: { id: 'admin1' },
    authenticatedRequest: request,
    getSessionEpoch: () => 1,
  }),
}));
afterEach(cleanup);
beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async (path: string) => {
    if (!path.startsWith('/admin/orders?')) return base;
    const page = Number(new URL(path, 'http://test').searchParams.get('page'));
    return {
      items: page > 3 ? [] : [{ ...base, itemCount: 1 }],
      total: 41,
      page,
      pageSize: 20,
      totalPages: 3,
    };
  });
});
function Location() {
  const location = useLocation(),
    navigate = useNavigate();
  return (
    <>
      <output aria-label="URL hiện tại">
        {location.pathname}
        {location.search}
      </output>
      <button onClick={() => void navigate(-1)}>Lùi history</button>
      <button onClick={() => void navigate(1)}>Tiến history</button>
    </>
  );
}
function mount(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Location />
        <Routes>
          <Route path="/admin/orders" element={<AdminOrdersPage />} />
          <Route path="/admin/orders/:id" element={<AdminOrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const url = () => screen.getByLabelText('URL hiện tại').textContent;

describe('UC-12.1 điều hướng quản trị — Issue #61, AC đề xuất ở orders/use-cases.md', () => {
  it('UC-12.1/AC3 link chi tiết mang tab/q/page, quay lại đúng danh sách', async () => {
    mount('/admin/orders?tab=all&q=khach&page=2');
    const link = await screen.findByRole('link', { name: base.orderCode });
    expect(link).toHaveAttribute('href', '/admin/orders/o1?tab=all&q=khach&page=2');
    fireEvent.click(link);
    const back = await screen.findByRole('link', { name: /Danh sách đơn/ });
    expect(back).toHaveAttribute('href', '/admin/orders?tab=all&q=khach&page=2');
    fireEvent.click(back);
    expect(await screen.findByLabelText('Tìm mã đơn hoặc email khách')).toHaveValue('khach');
    expect(url()).toBe('/admin/orders?tab=all&q=khach&page=2');
  });
  it('UC-12.1/AC3 mở trực tiếp chi tiết sau reload vẫn có link về điều kiện, không nhận URL ngoài', async () => {
    mount('/admin/orders/o1?tab=shipping&q=khach&page=2&returnTo=https://evil.test');
    expect(await screen.findByRole('link', { name: /Danh sách đơn/ })).toHaveAttribute(
      'href',
      '/admin/orders?tab=shipping&q=khach&page=2',
    );
  });
  it('UC-12.1/AC2 Back/Forward đồng bộ ô tìm, URL và request', async () => {
    mount('/admin/orders?tab=all&q=mot');
    await screen.findByRole('link', { name: base.orderCode });
    fireEvent.change(screen.getByLabelText('Tìm mã đơn hoặc email khách'), {
      target: { value: 'hai' },
    });
    fireEvent.submit(screen.getByRole('search'));
    await waitFor(() => expect(url()).toBe('/admin/orders?tab=all&q=hai'));
    fireEvent.click(screen.getByRole('button', { name: 'Lùi history' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Tìm mã đơn hoặc email khách')).toHaveValue('mot'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tiến history' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Tìm mã đơn hoặc email khách')).toHaveValue('hai'),
    );
  });
  it.each(['1.5', 'Infinity', '1e2', '0', '-1', 'NaN', '100001', '02'])(
    'UC-12.1/AC1 page=%s chuẩn hóa trước request, replace không thêm history',
    async (page) => {
      mount(`/admin/orders?tab=all&page=${page}`);
      await screen.findByRole('link', { name: base.orderCode });
      expect(url()).toBe('/admin/orders?tab=all');
      expect(
        request.mock.calls.every(
          ([path]) => new URL(String(path), 'http://test').searchParams.get('page') === '1',
        ),
      ).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Lùi history' }));
      await waitFor(() => expect(url()).toBe('/admin/orders?tab=all'));
    },
  );
  it('UC-12.1/AC1 tham số lặp/lạ bị bỏ, q trim và giới hạn như API', async () => {
    mount(
      '/admin/orders?tab=all&tab=cod&page=2&page=3&unknown=x&q=%20%20' + 'a'.repeat(300) + '%20',
    );
    await screen.findByRole('link', { name: base.orderCode });
    expect(url()).toBe('/admin/orders?q=' + 'a'.repeat(254));
    expect(screen.getByLabelText('Tìm mã đơn hoặc email khách')).toHaveValue('a'.repeat(254));
    const first = new URL(String(request.mock.calls[0]![0]), 'http://test');
    expect(first.searchParams.get('q')).toHaveLength(254);
    expect(first.searchParams.get('page')).toBe('1');
    expect(first.searchParams.get('attention')).toBe('true');
  });
  it('UC-12.1/AC4 trang vượt dữ liệu có link phục hồi, không tự redirect', async () => {
    mount('/admin/orders?tab=all&q=khach&page=9');
    expect(await screen.findByRole('link', { name: 'Về trang cuối có dữ liệu' })).toHaveAttribute(
      'href',
      '/admin/orders?tab=all&q=khach&page=3',
    );
    expect(url()).toBe('/admin/orders?tab=all&q=khach&page=9');
    fireEvent.click(screen.getByRole('link', { name: 'Về trang cuối có dữ liệu' }));
    await screen.findByRole('link', { name: base.orderCode });
    expect(url()).toBe('/admin/orders?tab=all&q=khach&page=3');
  });
  it('UC-12.1/AC4 tập lọc hết dữ liệu ở trang sau có đường về trang đầu', async () => {
    request.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 20, totalPages: 0 });
    mount('/admin/orders?tab=all&q=khong-co&page=2');
    expect(await screen.findByRole('link', { name: 'Về trang đầu' })).toHaveAttribute(
      'href',
      '/admin/orders?tab=all&q=khong-co',
    );
  });
});
