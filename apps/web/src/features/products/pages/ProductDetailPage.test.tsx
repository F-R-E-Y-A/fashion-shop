import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LocationProbe } from '../test-support/LocationProbe.js';
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
function renderDetail(initialEntry = '/san-pham/mau-thu') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/san-pham/:slug" element={<ProductDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(() => vi.unstubAllGlobals());
describe('ProductDetailPage (UC-03.4)', () => {
  it('mo tu deep-link ?color= chon san mau do, gallery theo mau do', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        return response(url.pathname.endsWith('/related') ? [] : detail);
      }),
    );
    renderDetail('/san-pham/mau-thu?color=trang');
    await screen.findByRole('heading', { name: 'Mẫu thử' });
    expect(screen.getByRole('button', { name: 'Trắng' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Đen' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('doi mau cap nhat bien the tren URL (replace), doi sai bo param cu', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        return response(url.pathname.endsWith('/related') ? [] : detail);
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/san-pham/mau-thu?color=trang']}>
          {/* Doi tuong do: hien search cua vi tri hien tai de assert URL cap nhat theo lua chon. */}
          <LocationProbe />
          <Routes>
            <Route path="/san-pham/:slug" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole('heading', { name: 'Mẫu thử' });
    expect(screen.getByTestId('location-search').textContent).toBe('?color=trang');
    fireEvent.click(screen.getByRole('button', { name: 'Đen' }));
    await screen.findByText('?color=den');
  });

  it('mo tu deep-link ?color= (family) van chon dung mau co code gan dai', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        return response(
          url.pathname.endsWith('/related')
            ? []
            : {
                ...detail,
                colors: [
                  { code: 'do-do', name: 'Đỏ đô', hex: '#7a1f2b' },
                  { code: 'trang', name: 'Trắng', hex: '#ffffff' },
                ],
                images: [
                  { url: '/do.jpg', alt: null, colorCode: 'do-do' },
                  { url: '/common.jpg', alt: null, colorCode: null },
                ],
                variants: [
                  {
                    id: 'v10',
                    sku: 'DO-DO-S',
                    colorCode: 'do-do',
                    sizeCode: 'S',
                    price: '299000',
                    listPrice: null,
                  },
                ],
              },
        );
      }),
    );
    renderDetail('/san-pham/mau-thu?color=do');
    await screen.findByRole('heading', { name: 'Mẫu thử' });
    expect(screen.getByRole('button', { name: 'Đỏ đô' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'S' }));
    expect(screen.getByText('Mã hàng: DO-DO-S')).toBeInTheDocument();
  });

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

  it('đổi sang màu không có cỡ đang chọn thì bỏ chọn cỡ, không tự nhảy sang cỡ khác', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        return response(url.pathname.endsWith('/related') ? [] : detail);
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/san-pham/mau-thu?color=den&size=M']}>
          <LocationProbe />
          <Routes>
            <Route path="/san-pham/:slug" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole('heading', { name: 'Mẫu thử' });
    expect(screen.getByRole('button', { name: 'M' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Trắng' }));
    await screen.findByText('?color=trang');
    expect(screen.getByRole('button', { name: 'S' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'M' })).toBeDisabled();
  });

  it('chọn số lượng trong giới hạn tồn kho và gửi đúng biến thể, số lượng vào giỏ', async () => {
    const stocked = {
      ...detail,
      variants: [
        { ...detail.variants[0], availableQuantity: 3 },
        { ...detail.variants[1], availableQuantity: 1 },
        detail.variants[2],
      ],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (init?.method === 'POST') return response({ cartId: 'c1', items: [] });
      return response(url.pathname.endsWith('/related') ? [] : stocked);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderDetail('/san-pham/mau-thu?color=den&size=M');
    await screen.findByRole('heading', { name: 'Mẫu thử' });
    const quantity = screen.getByRole('group', { name: 'Số lượng' });
    const increase = () => within(quantity).getByRole('button', { name: 'Tăng số lượng' });
    // Cỡ M chỉ còn 1: không tăng được.
    expect(increase()).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'S' }));
    fireEvent.click(increase());
    fireEvent.click(increase());
    expect(quantity).toHaveTextContent('3');
    // Tới mức tồn: nút báo tắt nhưng vẫn giữ focus được; bấm thêm không vượt tồn.
    expect(increase()).toHaveAttribute('aria-disabled', 'true');
    expect(increase()).not.toBeDisabled();
    fireEvent.click(increase());
    expect(quantity).toHaveTextContent('3');
    // Quay về cỡ M: số lượng tự hạ theo tồn kho, không gửi quá tồn.
    fireEvent.click(screen.getByRole('button', { name: 'M' }));
    expect(quantity).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: 'S' }));
    fireEvent.click(within(quantity).getByRole('button', { name: 'Giảm số lượng' }));
    expect(quantity).toHaveTextContent('2');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào giỏ' }));
    expect(await screen.findByText('Đã thêm vào giỏ.')).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(String(post?.[0])).toMatch(/\/cart\/items$/);
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ variantId: 'v1', quantity: 2 });
  });

  it('mô tả, chất liệu nằm ở mục Chi tiết sản phẩm bên dưới vùng mua', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        return response(url.pathname.endsWith('/related') ? [] : detail);
      }),
    );
    renderDetail();
    await screen.findByRole('heading', { name: 'Mẫu thử' });
    const about = screen.getByRole('region', { name: 'Chi tiết sản phẩm' });
    expect(within(about).getByText('Chất liệu: Cotton')).toBeInTheDocument();
  });

  it('có nút qua ảnh và cho chọn toàn bộ thumbnail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        return response(
          url.pathname.endsWith('/related')
            ? []
            : {
                ...detail,
                images: Array.from({ length: 5 }, (_, index) => ({
                  url: `/image-${index + 1}.jpg`,
                  alt: `Ảnh ${index + 1}`,
                  colorCode: null,
                })),
              },
        );
      }),
    );
    renderDetail();
    await screen.findByRole('heading', { name: 'Mẫu thử' });

    expect(screen.getAllByRole('button', { name: /^Xem ảnh/ })).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Ảnh tiếp theo' }));
    expect(screen.getByRole('img', { name: 'Ảnh 2' })).toHaveAttribute('src', '/image-2.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Ảnh trước' }));
    expect(screen.getByRole('img', { name: 'Ảnh 1' })).toHaveAttribute('src', '/image-1.jpg');
  });

  it('Lightbox và thư viện dùng chung một ảnh đang xem; đổi màu thì về ảnh đầu của màu mới', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        return response(
          url.pathname.endsWith('/related')
            ? []
            : {
                ...detail,
                images: [
                  ...[1, 2, 3].map((n) => ({
                    url: `/den-${n}.jpg`,
                    alt: `Đen ${n}`,
                    colorCode: 'den',
                  })),
                  ...[1, 2].map((n) => ({
                    url: `/trang-${n}.jpg`,
                    alt: `Trắng ${n}`,
                    colorCode: 'trang',
                  })),
                ],
              },
        );
      }),
    );
    renderDetail('/san-pham/mau-thu?color=den');
    await screen.findByRole('heading', { name: 'Mẫu thử' });

    fireEvent.click(screen.getByRole('button', { name: 'Ảnh tiếp theo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Phóng to ảnh' }));
    const dialog = screen.getByRole('dialog', { name: 'Thư viện ảnh sản phẩm' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ảnh tiếp theo' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng thư viện' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Đen 3' })).toHaveAttribute('src', '/den-3.jpg');
    expect(screen.getByRole('button', { name: 'Xem ảnh 3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Trắng' }));
    expect(screen.getByRole('img', { name: 'Trắng 1' })).toHaveAttribute('src', '/trang-1.jpg');
    expect(screen.getAllByRole('button', { name: /^Xem ảnh/ })).toHaveLength(2);
  });

  it('ẩn lựa chọn màu không có ảnh liên quan để tránh ghép nhầm ảnh màu khác', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        return response(
          url.pathname.endsWith('/related')
            ? []
            : {
                ...detail,
                images: [{ url: '/den.jpg', alt: 'Đen', colorCode: 'den' }],
              },
        );
      }),
    );
    renderDetail();
    await screen.findByRole('heading', { name: 'Mẫu thử' });

    expect(screen.queryByRole('button', { name: 'Trắng' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Đen' })).toHaveAttribute('src', '/den.jpg');
  });

  it('ẩn bộ chọn màu khi không ảnh nào khớp với màu của biến thể', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        return response(
          url.pathname.endsWith('/related')
            ? []
            : {
                ...detail,
                images: [{ url: '/unmatched.jpg', alt: 'Ảnh sản phẩm', colorCode: 'khac' }],
              },
        );
      }),
    );
    renderDetail();
    await screen.findByRole('heading', { name: 'Mẫu thử' });

    expect(screen.queryByRole('button', { name: 'Đen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trắng' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Ảnh sản phẩm' })).toHaveAttribute(
      'src',
      '/unmatched.jpg',
    );
  });

  it('UC-03.4/AC5 404 có lối về trang chủ', async () => {
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
