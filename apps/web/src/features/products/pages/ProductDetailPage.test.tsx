import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProductDetailPage } from './ProductDetailPage.js';

const detail = {
  id: 'p1',
  slug: 'mau-thu',
  name: 'Mẫu thử',
  description: null,
  price: '299000',
  listPrice: null,
  imageUrl: null,
  brandName: 'Mộc',
  categoryName: 'Áo thun',
  categorySlug: 'ao-thun',
  material: 'Cotton',
  careInstructions: null,
  breadcrumb: [
    { name: 'Áo', slug: 'ao' },
    { name: 'Áo thun', slug: 'ao-thun' },
  ],
  colors: [
    { code: 'den', name: 'Đen', hex: '#111111' },
    { code: 'trang', name: 'Trắng', hex: '#ffffff' },
  ],
  images: [{ url: '/common.jpg', alt: null, colorCode: null }],
  variants: [
    { id: 'v1', sku: 'DEN-S', colorCode: 'den', sizeCode: 'S', price: '299000', listPrice: null },
    { id: 'v2', sku: 'DEN-M', colorCode: 'den', sizeCode: 'M', price: '299000', listPrice: null },
    {
      id: 'v3',
      sku: 'TRANG-S',
      colorCode: 'trang',
      sizeCode: 'S',
      price: '299000',
      listPrice: null,
    },
  ],
};
const response = (body: unknown, status = 200) =>
  ({
    ok: status < 400,
    status,
    json: async () => body,
  }) as Response;
function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/san-pham/mau-thu']}>
        <Routes>
          <Route path="/san-pham/:slug" element={<ProductDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(() => vi.unstubAllGlobals());
describe('ProductDetailPage (UC-03.4)', () => {
  it('màu trắng chỉ có cỡ S; chọn cỡ hiện đúng SKU', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        return response(url.pathname.endsWith('/related') ? [] : detail);
      }),
    );
    renderDetail();
    await screen.findByRole('heading', { name: 'Mẫu thử' });
    fireEvent.click(screen.getByRole('button', { name: 'Trắng' }));
    expect(screen.getByRole('button', { name: 'M' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'S' }));
    expect(screen.getByText('Mã hàng: TRANG-S')).toBeInTheDocument();
  });

  it('404 có lối về trang chủ', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        return url.pathname.endsWith('/related')
          ? response([])
          : response(
              {
                statusCode: 404,
                code: 'NOT_FOUND',
                message: 'Không thấy',
                path: url.pathname,
                timestamp: new Date().toISOString(),
              },
              404,
            );
      }),
    );
    renderDetail();
    expect(await screen.findByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/');
  });
});
