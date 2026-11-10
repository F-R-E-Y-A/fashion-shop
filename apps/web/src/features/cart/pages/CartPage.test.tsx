import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type Cart, cartKeys } from '../api/cart.api.js';
import { CartPage } from './CartPage.js';

function fixture(): Cart {
  return {
    cartId: 'cart',
    itemCount: 2,
    selectedItemCount: 2,
    total: '898000.00',
    discountAmount: '0.00',
    items: [
      {
        variantId: 'v1',
        productId: 'p1',
        productSlug: 'ao-thu',
        name: 'Áo thử',
        variantLabel: 'M / Đen',
        imageUrl: null,
        price: '449000',
        quantity: 2,
        subtotal: '898000.00',
        isActive: true,
        availableQuantity: 10,
        availability: 'AVAILABLE',
        isSelected: true,
        canCheckout: true,
      },
    ],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function setup(initial: Cart) {
  let cart = initial;
  const request = vi.fn(async (_url: string, options: RequestInit) => {
    if (options.method === 'PATCH') {
      const { isSelected } = JSON.parse(options.body as string) as { isSelected: boolean };
      cart = {
        ...cart,
        total: isSelected ? '898000.00' : '0.00',
        selectedItemCount: isSelected ? 2 : 0,
        items: cart.items.map((item) => ({ ...item, isSelected })),
      };
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
  return {
    client,
    request,
    setCart: (next: Cart) => {
      cart = next;
    },
  };
}

describe('PH-11 Cart storefront', () => {
  it('cho bỏ chọn dòng thiếu dữ liệu kho đang được chọn, không bắt xóa khỏi giỏ', async () => {
    const cart = fixture();
    cart.items[0] = {
      ...cart.items[0]!,
      availability: 'UNKNOWN',
      availableQuantity: null,
      canCheckout: false,
    };
    cart.total = '0.00';
    cart.selectedItemCount = 0;
    setup(cart);
    const checkbox = await screen.findByRole('checkbox', { name: 'Chọn Áo thử' });
    expect(checkbox).toBeChecked();
    expect(checkbox).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Tiến hành đặt hàng' })).toBeDisabled();
    fireEvent.click(checkbox);
    await waitFor(() => expect(checkbox).not.toBeChecked());
    expect(checkbox).toBeDisabled();
    expect(screen.getByText('Áo thử')).toBeInTheDocument();
  });
  it('chon tung dong, cap nhat tong tien, khuyen mai de trong va discount 0', async () => {
    setup(fixture());
    const select = await screen.findByRole('checkbox', { name: 'Chọn Áo thử' });
    expect(select).toBeChecked();
    const promo = screen.getByRole('textbox', { name: 'Khuyến mãi' });
    expect(promo).toHaveValue('');
    expect(promo).toBeDisabled();
    fireEvent.click(select);
    await waitFor(() => expect(select).not.toBeChecked());
    expect(screen.getByText('Tạm tính · 0 sản phẩm đã chọn')).toBeInTheDocument();
  });

  it('het hang giu ten va quantity, khong cho chon; co hang lai van chua chon', async () => {
    const cart = fixture();
    cart.items[0] = {
      ...cart.items[0]!,
      availability: 'OUT_OF_STOCK',
      availableQuantity: 0,
      isSelected: false,
      canCheckout: false,
    };
    cart.total = '0.00';
    cart.selectedItemCount = 0;
    const view = setup(cart);
    expect(
      await screen.findByText('Hết hàng — sản phẩm được giữ lại trong giỏ.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Số lượng Áo thử')).toHaveTextContent('2');
    expect(screen.getByRole('checkbox')).toBeDisabled();
    const restocked = fixture();
    restocked.items[0]!.isSelected = false;
    restocked.total = '0.00';
    restocked.selectedItemCount = 0;
    view.setCart(restocked);
    await act(async () => {
      await view.client.invalidateQueries({ queryKey: cartKeys.all });
    });
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled());
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
});
