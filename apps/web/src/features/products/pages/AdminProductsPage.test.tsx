import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminProductsPage } from './AdminProductsPage.js';

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <AdminProductsPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UC-02.1/AC9 trình bày Tổng quan — total công khai theo UC-03.1/AC4', () => {
  it('UC-02.1/AC9 giữ tiêu đề và thông báo tải khi query chưa hoàn tất', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    renderPage();
    expect(screen.getByRole('heading', { name: 'Tổng quan cửa hàng' })).toBeInTheDocument();
    expect(screen.getByText('Đang tải dữ liệu tổng quan…')).toBeInTheDocument();
  });

  it.each([
    [97, '97'],
    [0, '0'],
    [1234, '1.234'],
  ])('UC-02.1/AC9 hiển thị total %i từ API thành %s', async (total, formatted) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          items: [],
          total,
          page: 1,
          pageSize: 1,
          totalPages: total,
        }),
      })),
    );

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Sản phẩm công khai' })).toBeInTheDocument();
    expect(screen.getByText(formatted)).toBeInTheDocument();
  });

  it('UC-02.1/AC9 thử lại sau lỗi tải và hiển thị total từ lần GET mới', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('Mạng không khả dụng'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ items: [], total: 97, page: 1, pageSize: 1, totalPages: 97 }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    expect(
      await screen.findByText('Không thể tải dữ liệu tổng quan. Vui lòng thử lại.'),
    ).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /Thử lại/ }));
    expect(await screen.findByText('97')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
