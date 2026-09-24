import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductListPage } from './ProductListPage.js';

/**
 * Kiem thu GIAO DIEN: fetch duoc gia, khong can may chu chay.
 * Kiem dung ba trang thai bat buoc cua mot trang tai du lieu. Chep tep nay khi lam trang moi.
 */
function renderPage() {
  // retry: false de trang thai loi hien ngay, khong doi thu lai.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProductListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const page = (items: unknown[], total = items.length) => ({
  items,
  total,
  page: 1,
  pageSize: 12,
  totalPages: Math.max(1, Math.ceil(total / 12)),
});

const product = {
  id: 'p-1',
  name: 'Ao thun co tron basic',
  slug: 'ao-thun-co-tron-basic',
  description: null,
  price: '199000',
  imageUrl: null,
  categoryName: 'Ao',
  categorySlug: 'ao',
};

describe('ProductListPage (PH-03 Kham pha san pham)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const mockFetch = (init: { ok: boolean; status?: number; body: unknown }) => {
    vi.mocked(fetch).mockResolvedValue({
      ok: init.ok,
      status: init.status ?? (init.ok ? 200 : 500),
      json: async () => init.body,
    } as Response);
  };

  it('AC-1 hien the san pham va gia theo dinh dang tien Viet Nam', async () => {
    mockFetch({ ok: true, body: page([product]) });

    renderPage();

    expect(await screen.findByText('Ao thun co tron basic')).toBeInTheDocument();
    // Intl dung dau cach khong ngat truoc ky hieu tien, nen so sanh bang bieu thuc chinh quy.
    expect(screen.getByText(/199\.000/)).toBeInTheDocument();
    expect(screen.getByText(/1 trên 1 · 1 sản phẩm/)).toBeInTheDocument();
  });

  it('AC-1 danh sach rong thi bao khong co san pham nao khop', async () => {
    mockFetch({ ok: true, body: page([], 0) });

    renderPage();

    expect(await screen.findByText('Không có sản phẩm nào khớp.')).toBeInTheDocument();
  });

  it('AC-1 may chu loi thi hien thong bao loi, khong hien trang trang', async () => {
    mockFetch({
      ok: false,
      status: 500,
      body: {
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'May chu dang gap su co',
        path: '/products',
        timestamp: new Date().toISOString(),
      },
    });

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('May chu dang gap su co');
  });
});
