import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  categoryTree,
  errorBody,
  facets,
  interpretation,
  jsonResponse,
  product,
  productPage,
} from '../test-support/catalog-fixtures.js';
import { SearchPage } from './SearchPage.js';

function Where() {
  const location = useLocation();
  return <span data-testid="where">{location.search}</span>;
}

function renderPage(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/tim-kiem" element={<SearchPage />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** fetch gia: `products` la ham tra ve Response cho /products; danh muc luon co. */
function stubFetch(products: (url: URL) => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/categories')) return jsonResponse(categoryTree);
      if (url.pathname.endsWith('/products')) return products(url);
      throw new Error(`Unexpected fetch ${url.pathname}`);
    }),
  );
}

const productCalls = () =>
  vi
    .mocked(fetch)
    .mock.calls.map(([url]) => new URL(String(url)))
    .filter((url) => url.pathname.endsWith('/products'));

const results = (extra = {}) =>
  productPage([product(), product({ id: 'p2', name: 'Áo Polo Nam', slug: 'ao-polo-nam' })], {
    interpretation,
    relaxed: [],
    facets,
    ...extra,
  });

afterEach(() => vi.unstubAllGlobals());

describe('SearchPage (UC-03.2, UC-03.3)', () => {
  it('goi API voi cau tim, bo loc tu duong dan va facets=true', async () => {
    stubFetch(() => jsonResponse(results()));
    renderPage(
      '/tim-kiem?q=polo+n%E1%BB%AF&colors=den&sizes=m&minPrice=1000&sort=price_asc&page=2',
    );
    await screen.findByRole('heading', { name: 'Kết quả cho “polo nữ”' });
    const query = productCalls()[0]?.searchParams;
    expect(Object.fromEntries(query ?? [])).toMatchObject({
      search: 'polo nữ',
      colors: 'den',
      sizes: 'M',
      minPrice: '1000',
      sort: 'price_asc',
      page: '2',
      pageSize: '20',
      facets: 'true',
    });
  });

  it('ba trang thai: dang tai, ket qua kem so dem, va danh sach san pham', async () => {
    stubFetch(() => jsonResponse(results()));
    renderPage('/tim-kiem?q=polo');
    expect(screen.getByRole('status', { name: 'Đang tải' })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Áo Polo Nam', level: 3 }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 sản phẩm', { selector: 'p' })).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });

  it('loi may chu: bao loi kem nut thu lai', async () => {
    let calls = 0;
    stubFetch(() => {
      calls += 1;
      return calls === 1
        ? jsonResponse(errorBody(500, '/api/products'), 500)
        : jsonResponse(results());
    });
    renderPage('/tim-kiem?q=polo');
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được kết quả.');
    fireEvent.click(screen.getByRole('button', { name: /Thử lại/ }));
    expect(
      await screen.findByRole('heading', { name: 'Áo Polo Nam', level: 3 }),
    ).toBeInTheDocument();
  });

  it('UC-03.2/E1 khong co ket qua: goi y danh muc goc (an danh muc 0) va cau mau', async () => {
    stubFetch(() => jsonResponse(productPage([], { interpretation, relaxed: [], facets })));
    renderPage('/tim-kiem?q=xyzqwv');
    expect(
      await screen.findByRole('heading', { name: 'Không có sản phẩm nào khớp.' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Áo' })).toHaveAttribute('href', '/danh-muc/ao');
    expect(screen.getByRole('link', { name: 'Quần' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Đồ rỗng' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'polo nữ trắng dưới 100k' })).toHaveAttribute(
      'href',
      `/tim-kiem?q=${encodeURIComponent('polo nữ trắng dưới 100k')}`,
    );
  });

  it('chip "Da hieu" lay tu interpretation; bam x bo dung nhung chu da sinh ra chip', async () => {
    stubFetch(() => jsonResponse(results()));
    renderPage(`/tim-kiem?${new URLSearchParams({ q: 'polo nữ trắng dưới 100k' })}`);
    const row = (await screen.findByText('Đã hiểu')).parentElement as HTMLElement;
    for (const label of ['Áo polo', 'Nữ', 'Màu trắng', 'Dưới 100.000 ₫']) {
      expect(within(row).getByText(label)).toBeInTheDocument();
    }
    fireEvent.click(within(row).getByRole('button', { name: 'Bỏ Nữ' }));
    expect(screen.getByTestId('where')).toHaveTextContent(
      `?${new URLSearchParams({ q: 'polo trắng dưới 100k' })}`,
    );
    fireEvent.click(within(row).getByRole('button', { name: 'Bỏ Dưới 100.000 ₫' }));
    expect(screen.getByTestId('where')).toHaveTextContent(
      `?${new URLSearchParams({ q: 'polo trắng' })}`,
    );
  });

  it('bo loc tuong minh hien o dong "Bo loc" va bo duoc rieng', async () => {
    stubFetch(() => jsonResponse(results({ interpretation: { ...interpretation, chips: [] } })));
    renderPage('/tim-kiem?colors=den&sizes=M');
    // Nhan mau cho toi khi facets ve; luc do moi la "Màu đen".
    const chip = await screen.findByText('Màu đen');
    const row = chip.parentElement as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Bỏ Cỡ M' }));
    expect(screen.getByTestId('where')).toHaveTextContent('?colors=den');
    expect(screen.getByTestId('where')).not.toHaveTextContent('sizes');
  });

  it('"Xoa tat ca" xoa ca cau lan bo loc', async () => {
    stubFetch(() => jsonResponse(results()));
    renderPage('/tim-kiem?q=polo&colors=den');
    fireEvent.click(await screen.findByRole('button', { name: 'Xoá tất cả' }));
    expect(screen.getByTestId('where')).toHaveTextContent('');
    expect(screen.getByTestId('where').textContent).toBe('');
  });

  it('UC-03.2 nới truy vấn: hộp chữ nêu rõ đã bỏ ý nào', async () => {
    stubFetch(() => jsonResponse(results({ relaxed: ['bỏ lọc giá', 'bỏ lọc màu'] })));
    renderPage('/tim-kiem?q=polo+trang+duoi+1k');
    expect(
      await screen.findByText(
        /Không có sản phẩm nào khớp đủ mọi ý của câu\. Cửa hàng đã bỏ lọc giá, bỏ lọc màu và hiện các sản phẩm gần nhất\./,
      ),
    ).toBeInTheDocument();
  });

  it('"Liên quan nhất" chỉ có khi có câu tìm', async () => {
    stubFetch(() => jsonResponse(results()));
    const first = renderPage('/tim-kiem?q=polo');
    await screen.findByRole('heading', { name: 'Áo Polo Nam', level: 3 });
    expect(
      within(screen.getByLabelText('Sắp xếp')).getByRole('option', { name: 'Liên quan nhất' }),
    ).toBeInTheDocument();
    first.unmount();

    stubFetch(() => jsonResponse(results({ interpretation: undefined })));
    renderPage('/tim-kiem');
    await screen.findByRole('heading', { name: 'Áo Polo Nam', level: 3 });
    expect(screen.queryByRole('option', { name: 'Liên quan nhất' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tất cả sản phẩm' })).toBeInTheDocument();
  });

  it('doi sap xep ve trang 1 tren duong dan; dau sao "1 ky tu" khong goi API', async () => {
    stubFetch(() => jsonResponse(results()));
    renderPage('/tim-kiem?q=polo&page=3');
    await screen.findByRole('heading', { name: 'Áo Polo Nam', level: 3 });
    fireEvent.change(screen.getByLabelText('Sắp xếp'), { target: { value: 'price_desc' } });
    expect(screen.getByTestId('where')).toHaveTextContent('sort=price_desc');
    expect(screen.getByTestId('where')).not.toHaveTextContent('page=');
  });

  it('cau 1 ky tu khong goi API theo cau, nhac nhap it nhat 2 ky tu', async () => {
    stubFetch(() => jsonResponse(results({ interpretation: undefined })));
    renderPage('/tim-kiem?q=a');
    await screen.findByRole('heading', { name: 'Áo Polo Nam', level: 3 });
    expect(productCalls()[0]?.searchParams.has('search')).toBe(false);
    expect(screen.getByText('Nhập ít nhất 2 ký tự để tìm theo câu.')).toBeInTheDocument();
  });

  it('gui lai o nhap lon dat q moi va ve trang 1', async () => {
    stubFetch(() => jsonResponse(results()));
    renderPage('/tim-kiem?q=polo&page=2');
    await screen.findByRole('heading', { name: 'Áo Polo Nam', level: 3 });
    const input = screen.getByRole('searchbox', { name: 'Tìm sản phẩm' });
    fireEvent.change(input, { target: { value: '  quần tây  ' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(screen.getByTestId('where')).toHaveTextContent(
      `?${new URLSearchParams({ q: 'quần tây' })}`,
    );
  });
});
