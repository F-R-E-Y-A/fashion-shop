import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HomePage } from './HomePage.js';

const sample = {
  id: 'p1',
  slug: 'mau-moi',
  name: 'Mẫu mới',
  description: null,
  price: '299000',
  listPrice: null,
  imageUrl: '/mau.jpg',
  brandName: 'Mộc',
  categoryName: 'Áo',
  categorySlug: 'ao-thun',
};
const page = (items: unknown[]) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 4,
  totalPages: 1,
});
const response = (body: unknown, status = 200) =>
  ({
    ok: status < 400,
    status,
    json: async () => body,
  }) as Response;

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());
describe('HomePage (UC-03.1)', () => {
  it('hero hiện cùng sản phẩm mới; nổi bật rỗng báo trạng thái', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/categories')) return response([]);
        return response(url.searchParams.get('featured') === 'true' ? page([]) : page([sample]));
      }),
    );
    renderHome();
    expect(screen.getByRole('heading', { name: 'MẶC CHẤT RIÊNG' })).toBeInTheDocument();
    expect(await screen.findByText('Mẫu mới')).toBeInTheDocument();
    expect(await screen.findByText('Chưa có sản phẩm để khám phá.')).toBeInTheDocument();
  });

  it('lỗi tải hàng mới có nút thử lại', async () => {
    let attempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/categories')) return response([]);
        if (url.searchParams.get('featured') === 'true') return response(page([]));
        attempts += 1;
        return attempts === 1
          ? response(
              {
                statusCode: 500,
                code: 'ERROR',
                message: 'Lỗi tạm thời',
                path: '/api/products',
                timestamp: new Date().toISOString(),
              },
              500,
            )
          : response(page([sample]));
      }),
    );
    renderHome();
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được trang chủ.');
    fireEvent.click(screen.getByRole('button', { name: /Thử lại/ }));
    expect(await screen.findByText('Mẫu mới')).toBeInTheDocument();
  });
});
