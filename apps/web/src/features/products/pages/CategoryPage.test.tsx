import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CategoryPage } from './CategoryPage.js';

const category = {
  id: 'c1',
  name: 'Áo',
  slug: 'ao',
  breadcrumb: [{ name: 'Áo', slug: 'ao' }],
  children: [],
};
const emptyPage = { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };
const response = (body: unknown, status = 200) =>
  ({
    ok: status < 400,
    status,
    json: async () => body,
  }) as Response;
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.search}</span>;
}
function renderCategory() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/danh-muc/ao?page=2']}>
        <Routes>
          <Route path="/danh-muc/:slug" element={<CategoryPage />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(() => vi.unstubAllGlobals());
describe('CategoryPage (UC-03.1)', () => {
  it('đổi sort đưa page về 1 trên URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        return response(url.pathname.endsWith('/categories/ao') ? category : emptyPage);
      }),
    );
    renderCategory();
    await screen.findByRole('heading', { name: 'ÁO' });
    fireEvent.change(screen.getByLabelText('Sắp xếp'), { target: { value: 'price_asc' } });
    expect(screen.getByTestId('location')).toHaveTextContent('page=1');
    expect(screen.getByTestId('location')).toHaveTextContent('sort=price_asc');
  });

  it('404 có lối về trang chủ', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        return url.pathname.endsWith('/categories/ao')
          ? response(
              {
                statusCode: 404,
                code: 'NOT_FOUND',
                message: 'Không thấy',
                path: url.pathname,
                timestamp: new Date().toISOString(),
              },
              404,
            )
          : response(emptyPage);
      }),
    );
    renderCategory();
    expect(await screen.findByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/');
  });
});
