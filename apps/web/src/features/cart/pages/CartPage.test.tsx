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
  sessionStorage.clear();
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

  it('tự động gỡ voucher đã lưu khi bỏ chọn hết sản phẩm trong giỏ', async () => {
    sessionStorage.setItem(
      'freya_applied_promotion',
      JSON.stringify({
        kind: 'VOUCHER',
        id: 'v-1',
        code: 'FREYA10',
        name: 'Mã ưu đãi FREYA10',
        discountAmount: '50000',
        discountType: 'PERCENTAGE',
      }),
    );

    setup(fixture());
    const checkbox = await screen.findByRole('checkbox', { name: 'Chọn Áo thử' });
    fireEvent.click(checkbox);

    await waitFor(() =>
      expect(screen.getByText('Tạm tính · 0 sản phẩm đã chọn')).toBeInTheDocument(),
    );
    await waitFor(() => expect(sessionStorage.getItem('freya_applied_promotion')).toBeNull());
  });

  it('tự động đánh giá lại và gỡ ưu đãi khi đổi sang biến thể khác cùng giá và cùng số lượng', async () => {
    sessionStorage.setItem(
      'freya_applied_promotion',
      JSON.stringify({
        kind: 'PROMOTION',
        id: 'promo-1',
        name: 'Giảm 50k cho Áo thử v1',
        discountAmount: '50000',
        discountType: 'FIXED_AMOUNT',
      }),
    );

    let cart = fixture();
    const evaluatedPayloads: Array<Array<{ variantId: string; price: string; quantity: number }>> =
      [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/promotions/evaluate')) {
        const parsed = init?.body
          ? (JSON.parse(String(init.body)) as {
              items?: Array<{ variantId: string; price: string; quantity: number }>;
            })
          : {};
        const items = parsed.items ?? [];
        evaluatedPayloads.push(items);
        const eligible = items.some((item) => item.variantId === 'v1');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            subtotal: cart.total,
            applicablePromotions: eligible
              ? [
                  {
                    promotionId: 'promo-1',
                    name: 'Giảm 50k cho Áo thử v1',
                    discountAmount: '50000',
                    discountType: 'FIXED_AMOUNT',
                    finalAmount: '848000.00',
                  },
                ]
              : [],
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => cart } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CartPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText('Áo thử');
    await waitFor(() =>
      expect(evaluatedPayloads.some((items) => items.some((i) => i.variantId === 'v1'))).toBe(true),
    );
    expect(sessionStorage.getItem('freya_applied_promotion')).not.toBeNull();

    // Đổi sang biến thể v2 nhưng giữ NGUYÊN total ('898000.00'), price ('449000') và selectedItemCount (2)
    cart = {
      ...cart,
      items: [{ ...cart.items[0]!, variantId: 'v2', name: 'Áo khác cùng giá' }],
    };

    await act(async () => {
      await client.invalidateQueries({ queryKey: cartKeys.all });
    });

    await screen.findByText('Áo khác cùng giá');
    await waitFor(() =>
      expect(evaluatedPayloads.some((items) => items.some((i) => i.variantId === 'v2'))).toBe(true),
    );
    await waitFor(() => expect(sessionStorage.getItem('freya_applied_promotion')).toBeNull());
  });

  it('R2-P2.6: nếu request đánh giá lại ưu đãi lần 1 bị abort giữa chừng khi giỏ refetch cùng khóa, lần 2 vẫn chạy lại và gỡ ưu đãi hết điều kiện', async () => {
    sessionStorage.setItem(
      'freya_applied_promotion',
      JSON.stringify({
        kind: 'VOUCHER',
        id: 'voucher-expired',
        code: 'EXPIRED50',
        name: 'Mã ưu đãi EXPIRED50',
        discountAmount: '50000',
        discountType: 'FIXED_AMOUNT',
      }),
    );

    const cart = fixture();
    let applyCount = 0;
    let cartFetchCount = 0;
    let firstAborted = false;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/promotions/vouchers/apply')) {
        applyCount += 1;
        if (applyCount === 1) {
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              firstAborted = true;
              reject(new DOMException('Aborted', 'AbortError'));
            });
          });
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            valid: false,
            code: 'EXPIRED50',
            voucherId: 'voucher-expired',
            discountType: 'FIXED_AMOUNT',
            discountValue: '50000',
            discountAmount: '0',
            finalAmount: cart.total,
            minOrderAmount: null,
            maxDiscountAmount: null,
          }),
        } as Response;
      }
      if (url.includes('/promotions/evaluate')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ subtotal: cart.total, applicablePromotions: [] }),
        } as Response;
      }
      // Đổi availableQuantity (không nằm trong validationKey) để React Query trả reference cart mới nhưng giữ nguyên validationKey
      cartFetchCount += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ...cart,
          items: cart.items.map((item) => ({
            ...item,
            availableQuantity: Math.max(2, (item.availableQuantity ?? 10) - cartFetchCount),
          })),
        }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CartPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText('Áo thử');
    await waitFor(() => expect(applyCount).toBe(1));

    // Kích hoạt refetch giỏ khi lần revalidate #1 chưa xong -> cleanup hủy lần #1, lần #2 phải chạy tiếp
    await act(async () => {
      await client.invalidateQueries({ queryKey: cartKeys.all });
    });

    await waitFor(() => expect(firstAborted).toBe(true));
    await waitFor(() => expect(applyCount).toBe(2));
    await waitFor(() => expect(sessionStorage.getItem('freya_applied_promotion')).toBeNull());
  });
});
