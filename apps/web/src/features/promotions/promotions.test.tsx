import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { BestPromotionBanner } from './components/BestPromotionBanner.js';
import { PromotionField } from './components/PromotionField.js';
import { VoucherModal } from './components/VoucherModal.js';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    if (!this.open) return;
    this.removeAttribute('open');
    setTimeout(() => this.dispatchEvent(new Event('close')), 0);
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
});

const sampleVouchers = [
  {
    id: 'v-1',
    code: 'FREYA10',
    status: 'ACTIVE',
    discountType: 'PERCENTAGE',
    discountValue: '10',
    maxDiscountAmount: '50000',
    minOrderAmount: '200000',
    usageLimit: 100,
    perUserLimit: 1,
    usageCount: 5,
    startsAt: null,
    expiresAt: null,
  },
  {
    id: 'v-2',
    code: 'VIP50K',
    status: 'ACTIVE',
    discountType: 'FIXED_AMOUNT',
    discountValue: '50000',
    maxDiscountAmount: null,
    minOrderAmount: '500000',
    usageLimit: 50,
    perUserLimit: 1,
    usageCount: 2,
    startsAt: null,
    expiresAt: null,
  },
];

function wrapper(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PH-10 Khuyến mãi & Voucher UI (UC-07.2, UC-10.1)', () => {
  it('VoucherModal hiển thị danh sách voucher và lọc điều kiện theo giá trị đơn', async () => {
    const request = vi.fn(async (url: string) => {
      if (url.includes('/promotions/vouchers/available')) {
        return { ok: true, status: 200, json: async () => sampleVouchers } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', request);

    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(
      <VoucherModal open={true} onClose={onClose} subtotal="300000" onSelectVoucher={onSelect} />,
      { wrapper: wrapper() },
    );

    expect(await screen.findByText('FREYA10')).toBeInTheDocument();
    expect(screen.getByText('VIP50K')).toBeInTheDocument();

    // Với đơn 300k: FREYA10 (min 200k) thỏa điều kiện, VIP50K (min 500k) chưa thỏa
    expect(screen.getByText(/Mua thêm 200\.000/)).toBeInTheDocument();

    const applyButtons = screen.getAllByRole('button', { name: /Áp dụng/ });
    expect(applyButtons[0]).toBeInTheDocument();
  });

  it('áp dụng mã hợp lệ gọi API và kích hoạt callback', async () => {
    const request = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url.includes('/promotions/vouchers/available')) {
        return { ok: true, status: 200, json: async () => sampleVouchers } as Response;
      }
      if (url.includes('/promotions/vouchers/apply')) {
        const body = JSON.parse(opts?.body as string);
        if (body.code === 'FREYA10') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              valid: true,
              code: 'FREYA10',
              voucherId: 'v-1',
              discountType: 'PERCENTAGE',
              discountValue: '10',
              discountAmount: '30000',
              finalAmount: '270000',
              minOrderAmount: '200000',
              maxDiscountAmount: '50000',
            }),
          } as Response;
        }
      }
      return {
        ok: false,
        status: 400,
        json: async () => ({ message: 'Mã không tồn tại' }),
      } as Response;
    });
    vi.stubGlobal('fetch', request);

    const onSelect = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <VoucherModal open={true} onClose={onClose} subtotal="300000" onSelectVoucher={onSelect} />,
      { wrapper: wrapper() },
    );

    const input = await screen.findByRole('textbox', { name: 'Nhập mã giảm giá' });
    await user.type(input, 'FREYA10');

    const submitBtn = screen.getByRole('button', { name: 'Áp dụng mã vừa nhập' });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          valid: true,
          code: 'FREYA10',
          discountAmount: '30000',
        }),
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('nhập mã không hợp lệ hiển thị thông báo lỗi', async () => {
    const request = vi.fn(async (url: string) => {
      if (url.includes('/promotions/vouchers/available')) {
        return { ok: true, status: 200, json: async () => [] } as Response;
      }
      if (url.includes('/promotions/vouchers/apply')) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            statusCode: 400,
            message: 'Mã giảm giá không tồn tại hoặc đã hết hạn',
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', request);

    const user = userEvent.setup();
    render(
      <VoucherModal open={true} onClose={vi.fn()} subtotal="300000" onSelectVoucher={vi.fn()} />,
      { wrapper: wrapper() },
    );

    const input = await screen.findByRole('textbox', { name: 'Nhập mã giảm giá' });
    await user.type(input, 'SAIMA');

    const submitBtn = screen.getByRole('button', { name: 'Áp dụng mã vừa nhập' });
    await user.click(submitBtn);

    expect(
      await screen.findByText('Mã giảm giá không tồn tại hoặc đã hết hạn'),
    ).toBeInTheDocument();
  });

  it('BestPromotionBanner tự động hiển thị gợi ý tốt nhất và áp dụng 1-chạm', async () => {
    const request = vi.fn(async (url: string) => {
      if (url.includes('/promotions/evaluate')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            subtotal: '600000',
            applicablePromotions: [
              {
                promotionId: 'p-autumn',
                name: 'Thu Vàng Freya 2026',
                discountType: 'PERCENTAGE',
                discountAmount: '90000',
                finalAmount: '510000',
              },
            ],
            bestPromotion: {
              promotionId: 'p-autumn',
              name: 'Thu Vàng Freya 2026',
              discountType: 'PERCENTAGE',
              discountAmount: '90000',
              finalAmount: '510000',
            },
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', request);

    const onApply = vi.fn();
    const user = userEvent.setup();

    render(<BestPromotionBanner subtotal="600000" itemCount={2} onApplyBest={onApply} />, {
      wrapper: wrapper(),
    });

    expect(await screen.findByText(/Gợi ý ưu đãi tốt nhất cho giỏ hàng/)).toBeInTheDocument();
    expect(screen.getByText(/Thu Vàng Freya 2026/)).toBeInTheDocument();

    const applyBtn = screen.getByRole('button', { name: /Áp dụng ưu đãi/ });
    await user.click(applyBtn);

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        promotionId: 'p-autumn',
        discountAmount: '90000',
      }),
    );
  });

  it('PromotionField cho phép đổi mã và gỡ mã đã áp dụng', async () => {
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

    const user = userEvent.setup();
    render(<PromotionField subtotal="500000" />, { wrapper: wrapper() });

    const input = screen.getByRole('textbox', { name: 'Khuyến mãi' });
    expect(input).toHaveValue('FREYA10');

    const clearBtn = screen.getByRole('button', { name: 'Gỡ mã ưu đãi' });
    await user.click(clearBtn);

    expect(input).toHaveValue('');
    expect(sessionStorage.getItem('freya_applied_promotion')).toBeNull();
  });
});
