import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Cart } from '../api/cart.api.js';
import { CartPage } from './CartPage.js';

const line = (variantId: string, variantLabel: string): Cart['items'][number] => ({
  variantId,
  productId: 'p1',
  productSlug: 'ao-thu',
  name: 'Áo thử',
  variantLabel,
  imageUrl: null,
  price: '449000',
  quantity: 2,
  subtotal: '898000.00',
  isActive: true,
  availableQuantity: 10,
  availability: 'AVAILABLE',
  isSelected: true,
  canCheckout: true,
});
const cartWith = (item: Cart['items'][number]): Cart => ({
  cartId: 'cart',
  itemCount: 2,
  selectedItemCount: 2,
  total: '898000.00',
  discountAmount: '0.00',
  items: [item],
});
const product = {
  slug: 'ao-thu',
  colors: [{ code: 'den', name: 'Đen', hex: '#000' }],
  variants: [
    {
      id: 'v-m',
      sku: 'M',
      colorCode: 'den',
      sizeCode: 'M',
      price: '449000',
      listPrice: null,
      availableQuantity: 10,
    },
    {
      id: 'v-l',
      sku: 'L',
      colorCode: 'den',
      sizeCode: 'L',
      price: '449000',
      listPrice: null,
      availableQuantity: 4,
    },
    {
      id: 'v-xl',
      sku: 'XL',
      colorCode: 'den',
      sizeCode: 'XL',
      price: '449000',
      listPrice: null,
      availableQuantity: 0,
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** Fetch gia co trang thai: PATCH thanh cong thi GET sau do tra gio moi (nhu may chu that). */
function setup(patch: { status: number; body: unknown }) {
  let cart: unknown = cartWith(line('v-m', 'Đen / M'));
  const request = vi.fn(async (url: string, options: RequestInit = {}) => {
    if (String(url).includes('/products/ao-thu')) {
      return { ok: true, status: 200, json: async () => product } as Response;
    }
    if (options.method === 'PATCH') {
      if (patch.status === 200) cart = patch.body;
      return {
        ok: patch.status === 200,
        status: patch.status,
        json: async () => patch.body,
      } as Response;
    }
    return { ok: true, status: 200, json: async () => cart } as Response;
  });
  vi.stubGlobal('fetch', request);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CartPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return request;
}

describe('PH-02 doi phan loai trong gio', () => {
  it('bam phan loai, chon co khac, xac nhan thi gui toVariantId va dong cap nhat', async () => {
    const request = setup({ status: 200, body: cartWith(line('v-l', 'Đen / L')) });
    const toggle = await screen.findByRole('button', { name: /Phân loại Đen \/ M/ });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    expect(await screen.findByRole('button', { name: 'XL, hết hàng' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'L' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Phân loại Đen \/ L/ })).toBeInTheDocument(),
    );
    const patch = request.mock.calls.find(([, options]) => options?.method === 'PATCH');
    expect(JSON.parse(patch?.[1]?.body as string)).toEqual({ toVariantId: 'v-l' });
    expect(screen.queryByRole('group', { name: 'Đổi phân loại' })).not.toBeInTheDocument();
  });

  it('may chu tu choi (vuot ton) thi bao loi, bang chon van mo', async () => {
    setup({
      status: 409,
      body: {
        statusCode: 409,
        message: 'Phân loại này chỉ còn 4 sản phẩm. Vui lòng giảm số lượng trước khi đổi.',
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Phân loại Đen \/ M/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'L' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('chỉ còn 4 sản phẩm');
    expect(screen.getByRole('group', { name: 'Đổi phân loại' })).toBeInTheDocument();
  });

  it('Huy dong bang chon va tra focus ve nut phan loai', async () => {
    setup({ status: 200, body: {} });
    const toggle = await screen.findByRole('button', { name: /Phân loại Đen \/ M/ });
    fireEvent.click(toggle);
    fireEvent.click(await screen.findByRole('button', { name: 'Huỷ' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });
});
