import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  categoryTree,
  errorBody,
  facets,
  jsonResponse,
  product,
  productPage,
} from '../test-support/catalog-fixtures.js';
import { HomePage } from './HomePage.js';

function Where() {
  const location = useLocation();
  return <span data-testid="where">{location.pathname + location.search}</span>;
}

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

type Handler = (url: URL) => Response | undefined;

/** fetch gia: `handler` tra loi rieng tung yeu cau; khong tra thi dung mac dinh cua trang chu. */
function stubFetch(handler: Handler = () => undefined) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const custom = handler(url);
      if (custom) return custom;
      if (url.pathname.endsWith('/categories')) return jsonResponse(categoryTree);
      const params = url.searchParams;
      if (params.get('featured') === 'true') return jsonResponse(productPage([]));
      if (params.has('audience')) {
        return jsonResponse(productPage([product()], { total: 42, facets }));
      }
      if (params.has('search')) {
        return jsonResponse(productPage([product()], { total: 7, relaxed: [] }));
      }
      return jsonResponse(productPage([product({ id: 'moi', name: 'Mẫu mới', slug: 'mau-moi' })]));
    }),
  );
}

const productCalls = () =>
  vi
    .mocked(fetch)
    .mock.calls.map(([url]) => new URL(String(url)))
    .filter((url) => url.pathname.endsWith('/products'));

afterEach(() => vi.unstubAllGlobals());

describe('HomePage (UC-03.1, PH-01 dot 2)', () => {
  it('hero co tieu de, o tim kiem cau noi va bon chip goi y', () => {
    stubFetch();
    renderHome();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Cứ nói điều bạn muốn mặc.' }),
    ).toBeInTheDocument();
    const hero = screen.getByRole('search');
    expect(within(hero).getByLabelText('Tìm sản phẩm bằng câu nói tự nhiên')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Áo khoác nam' })).toHaveAttribute(
      'href',
      `/tim-kiem?q=${encodeURIComponent('Áo khoác nam')}`,
    );
  });

  it('gui o tim kiem cua hero toi /tim-kiem; o trong thi tim theo cau goi y dang hien', () => {
    stubFetch();
    renderHome();
    const input = screen.getByLabelText('Tìm sản phẩm bằng câu nói tự nhiên');
    fireEvent.change(input, { target: { value: '  quần tây nữ  ' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(screen.getByTestId('where')).toHaveTextContent(
      `/tim-kiem?q=${encodeURIComponent('quần tây nữ')}`,
    );
  });

  it('o trong thi dung placeholder lam cau tim', () => {
    stubFetch();
    renderHome();
    fireEvent.submit(screen.getByRole('search'));
    expect(screen.getByTestId('where')).toHaveTextContent(
      `/tim-kiem?q=${encodeURIComponent('polo nữ trắng dưới 100k')}`,
    );
  });

  it('hang moi ve va an muc noi bat khi chua co san pham duoc chon', async () => {
    stubFetch();
    renderHome();
    expect(await screen.findByRole('heading', { name: 'Mẫu mới', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Hàng mới về, cuộn ngang' })).toBeInTheDocument();
    expect(await screen.findByText('Ba lối vào tủ đồ')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Nổi bật' })).not.toBeInTheDocument();
  });

  it('o danh muc: chi hien danh muc co san pham, kem so va chip con; o la mot lien ket phu ca o', async () => {
    stubFetch();
    renderHome();
    const bento = (await screen.findByText('Ba lối vào tủ đồ')).closest('section') as HTMLElement;
    expect(await within(bento).findByRole('link', { name: 'Xem tất cả áo' })).toHaveAttribute(
      'href',
      '/danh-muc/ao',
    );
    expect(within(bento).getByText('10 sản phẩm')).toBeInTheDocument();
    expect(within(bento).getByRole('link', { name: 'Áo polo · 6' })).toHaveAttribute(
      'href',
      '/danh-muc/ao-polo',
    );
    expect(within(bento).queryByText('Đồ rỗng')).not.toBeInTheDocument();
  });

  it('dip mac va chat lieu goi tim kiem voi log=false de khong lam lech nhat ky', async () => {
    stubFetch();
    renderHome();
    expect(await screen.findByText('Mặc cho dịp nào?')).toBeInTheDocument();
    await screen.findAllByText('7 gợi ý');
    const searches = productCalls().filter((url) => url.searchParams.has('search'));
    expect(searches.map((url) => url.searchParams.get('search'))).toEqual(
      expect.arrayContaining(['đồ đi làm công sở', 'áo mát mẻ mùa hè', 'cotton', 'lụa']),
    );
    expect(searches).toHaveLength(8);
    expect(searches.every((url) => url.searchParams.get('log') === 'false')).toBe(true);
  });

  it('o dip mac noi truy van thi so goi y la 0 va khong khoe san pham gan dung', async () => {
    stubFetch((url) =>
      url.searchParams.get('search') === 'đồ thể thao'
        ? jsonResponse(productPage([product()], { total: 5, relaxed: ['bỏ lọc màu'] }))
        : undefined,
    );
    renderHome();
    const sports = (await screen.findByText('Thể thao')).closest('a') as HTMLElement;
    expect(within(sports).getByText('0 gợi ý')).toBeInTheDocument();
    expect(sports.querySelectorAll('img')).toHaveLength(0);
    expect(sports).toHaveAttribute('href', `/tim-kiem?q=${encodeURIComponent('đồ thể thao')}`);
  });

  it('o Nang/Chang: tong so, chip la danh muc con co san pham xep giam dan, toi da 4', async () => {
    stubFetch();
    renderHome();
    const women = (await screen.findByRole('heading', { name: 'Nàng' })).closest(
      'article',
    ) as HTMLElement;
    expect(await within(women).findByText('42 sản phẩm')).toBeInTheDocument();
    const chips = within(women)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(chips).toEqual(['Áo polo · 6']);
    expect(within(women).getByRole('link', { name: 'Áo polo · 6' })).toHaveAttribute(
      'href',
      '/tim-kiem?audience=nu&categories=ao-polo',
    );
    expect(within(women).getByRole('link', { name: 'Xem đồ nữ' })).toHaveAttribute(
      'href',
      '/tim-kiem?audience=nu',
    );
    const audienceCalls = productCalls().filter((url) => url.searchParams.has('audience'));
    expect(audienceCalls.map((url) => url.searchParams.get('audience')).sort()).toEqual([
      'nam',
      'nu',
    ]);
    expect(audienceCalls.every((url) => url.searchParams.get('facets') === 'true')).toBe(true);
  });

  it('khoi phu loi thi an khoi, ca trang van dung', async () => {
    stubFetch((url) =>
      url.searchParams.has('search') || url.searchParams.has('audience')
        ? jsonResponse(errorBody(500, url.pathname), 500)
        : undefined,
    );
    renderHome();
    expect(await screen.findByRole('heading', { name: 'Mẫu mới', level: 3 })).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.queryByText('Mặc cho dịp nào?')).not.toBeInTheDocument());
    expect(screen.queryByText('Chạm vào trước khi mặc.')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Nàng' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('loi tai hang moi ve co nut thu lai', async () => {
    let attempts = 0;
    stubFetch((url) => {
      const isRail = url.searchParams.get('sort') === 'newest';
      if (!isRail) return undefined;
      attempts += 1;
      return attempts === 1 ? jsonResponse(errorBody(500, '/api/products'), 500) : undefined;
    });
    renderHome();
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được trang chủ.');
    fireEvent.click(screen.getByRole('button', { name: /Thử lại/ }));
    expect(await screen.findByRole('heading', { name: 'Mẫu mới', level: 3 })).toBeInTheDocument();
  });

  it('cau chuyen chat lieu: bon dong, moi dong la mot lien ket tim kiem kem so san pham', async () => {
    stubFetch();
    renderHome();
    const link = await screen.findByRole('link', { name: /Cotton/ });
    expect(link).toHaveAttribute('href', '/tim-kiem?q=cotton');
    await vi.waitFor(() => expect(link).toHaveTextContent('7 sản phẩm →'));
  });

  it('dat tieu de trang la ten cua hang', () => {
    stubFetch();
    renderHome();
    expect(document.title).toBe('THỜI TRANG');
  });
});
