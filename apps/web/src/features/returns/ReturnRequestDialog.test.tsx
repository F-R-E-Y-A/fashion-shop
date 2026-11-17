import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReturnOrderPrompt } from './ReturnOrderPrompt.js';
import type { ReturnEligibility } from './returns.api.js';
import { apiError, eligibility, returnRequest, stubBrowser } from './returns.fixtures.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/features/account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/account')>()),
  useAuth: () => ({ user: { id: 'u1' }, authenticatedRequest: request }),
}));

beforeAll(stubBrowser);

const uploads: { url: string; init?: RequestInit }[] = [];
let current: ReturnEligibility;
beforeEach(() => {
  request.mockReset();
  uploads.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      uploads.push({ url: String(input), init });
      return { ok: true, status: 200, json: async () => ({ public_id: 'x' }) } as Response;
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

/** Mot don da giao: dieu kien theo `overrides`; POST tra ve yeu cau r1; phieu tai anh co dinh. */
function setup(overrides: Partial<ReturnEligibility> = {}) {
  current = eligibility(overrides);
  request.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (path === '/orders/o1/returns/eligibility') return current;
    if (path === '/orders/o1/returns' && options?.method === 'POST') return returnRequest();
    if (path === '/uploads/tickets') {
      return {
        uploadUrl: 'https://upload.test/put',
        fields: { signature: 's' },
        key: 'returns/anh-1',
        expiresAt: '2026-11-14T10:00:00.000Z',
        maxBytes: 5 * 1024 * 1024,
        formats: ['jpg', 'png', 'webp'],
      };
    }
    throw new Error(`Chưa giả lập ${path}`);
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/don-hang/o1']}>
        <Routes>
          <Route
            path="/don-hang/:id"
            element={<ReturnOrderPrompt orderId="o1" orderCode="FR-O1" />}
          />
          <Route path="/tai-khoan/tra-hang/:id" element={<h1>Chi tiết yêu cầu</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const posts = () =>
  request.mock.calls.filter(
    ([path, options]) => path === '/orders/o1/returns' && options?.method === 'POST',
  );
async function openDialog() {
  fireEvent.click(await screen.findByRole('button', { name: 'Yêu cầu trả hàng' }));
  return screen.findByRole('dialog');
}
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));
const choose = (dialog: HTMLElement, item: string) =>
  fireEvent.click(within(dialog).getByRole('checkbox', { name: new RegExp(item) }));
const reason = (dialog: HTMLElement, label: string) =>
  fireEvent.click(within(dialog).getByRole('radio', { name: label }));

describe('UC-14.1 khách gửi yêu cầu trả hàng', () => {
  it('UC-14.1/AC9 hiện điều kiện trả, phí gửi trả và cách nhận tiền TRƯỚC form', async () => {
    setup();
    const dialog = await openDialog();
    const deadline = within(dialog).getByText(/Hạn gửi yêu cầu: .*15 ngày/);
    const shipping = within(dialog).getByText(
      'Shop chịu phí gửi trả khi hàng lỗi hoặc giao sai; lý do khác khách chịu phí gửi trả.',
    );
    const method = within(dialog).getByText('Tiền hoàn về đúng phương thức đã thanh toán.');
    const form = within(dialog).getByText('Sản phẩm cần trả');
    for (const condition of [deadline, shipping, method]) {
      expect(
        condition.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it('UC-14.1/AC9 đơn COD: điều kiện nói shop chuyển khoản vào tài khoản khách nhập', async () => {
    setup({ refundMethod: 'BANK_TRANSFER' });
    const dialog = await openDialog();
    expect(
      within(dialog).getByText('Shop chuyển khoản vào tài khoản bạn nhập.'),
    ).toBeInTheDocument();
  });

  it('UC-14.1/AC7 đơn online không hỏi tài khoản nhận tiền', async () => {
    setup({ refundMethod: 'GATEWAY' });
    const dialog = await openDialog();
    expect(within(dialog).queryByText('Số tài khoản')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Tên chủ tài khoản')).not.toBeInTheDocument();
    choose(dialog, 'Áo thun');
    reason(dialog, 'Cỡ không vừa');
    send();
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]![1].body).not.toHaveProperty('refundAccount');
  });

  it('UC-14.1/AC7 đơn COD: thiếu tài khoản nhận thì không gửi, đủ thì gửi kèm refundAccount', async () => {
    setup({ refundMethod: 'BANK_TRANSFER' });
    const dialog = await openDialog();
    choose(dialog, 'Chân váy');
    reason(dialog, 'Đổi ý');
    send();
    expect(await screen.findByRole('alert')).toHaveTextContent('Nhập tên ngân hàng nhận tiền.');
    fireEvent.change(within(dialog).getByLabelText('Ngân hàng'), {
      target: { value: 'Vietcombank' },
    });
    fireEvent.change(within(dialog).getByLabelText('Số tài khoản'), {
      target: { value: '12ab34' },
    });
    send();
    expect(await screen.findByRole('alert')).toHaveTextContent('Số tài khoản gồm 6 đến 20 chữ số.');
    fireEvent.change(within(dialog).getByLabelText('Số tài khoản'), {
      target: { value: '0123456789' },
    });
    send();
    expect(await screen.findByRole('alert')).toHaveTextContent('Nhập tên chủ tài khoản.');
    expect(posts()).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText('Tên chủ tài khoản'), {
      target: { value: 'NGUYEN VAN A' },
    });
    send();
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]![1].body.refundAccount).toEqual({
      bankName: 'Vietcombank',
      accountNumber: '0123456789',
      accountHolder: 'NGUYEN VAN A',
    });
  });

  it('UC-14.1/AC6 lý do hàng lỗi cần ảnh khi shop bật tải ảnh: chưa có ảnh thì không gửi', async () => {
    setup({ uploadsEnabled: true });
    const dialog = await openDialog();
    choose(dialog, 'Áo thun');
    reason(dialog, 'Hàng lỗi hoặc hư hỏng');
    expect(within(dialog).getByText(/bắt buộc với lý do này/)).toBeInTheDocument();
    send();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Lý do này cần ít nhất một ảnh để shop kiểm tra.',
    );
    expect(posts()).toHaveLength(0);
  });

  it('UC-14.1/AC6 có ảnh thì gửi kèm khoá ảnh; phiếu xin với mục đích return', async () => {
    setup({ uploadsEnabled: true });
    const dialog = await openDialog();
    choose(dialog, 'Áo thun');
    reason(dialog, 'Giao sai hoặc thiếu hàng');
    const file = new File(['x'], 'loi.jpg', { type: 'image/jpeg' });
    fireEvent.change(within(dialog).getByLabelText('+ Ảnh'), { target: { files: [file] } });
    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(request).toHaveBeenCalledWith(
      '/uploads/tickets',
      expect.objectContaining({ method: 'POST', body: { purpose: 'return' } }),
    );
    expect(uploads[0]!.url).toBe('https://upload.test/put');
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Bỏ ảnh 1' })).toBeEnabled(),
    );
    send();
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]![1].body.mediaKeys).toEqual(['returns/anh-1']);
  });

  it('UC-14.1/AC6 shop chưa bật tải ảnh: ẩn ô chọn ảnh, hiện ghi chú, không bắt buộc ảnh', async () => {
    setup({ uploadsEnabled: false });
    const dialog = await openDialog();
    expect(
      within(dialog).getByText('Shop chưa bật tải ảnh, hãy mô tả kỹ tình trạng hàng.'),
    ).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('+ Ảnh')).not.toBeInTheDocument();
    choose(dialog, 'Áo thun');
    reason(dialog, 'Hàng lỗi hoặc hư hỏng');
    send();
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]![1].body).not.toHaveProperty('mediaKeys');
  });

  it('UC-14.1/AC1 gửi đúng thân yêu cầu: món, số lượng, lý do, mô tả; xong chuyển tới chi tiết', async () => {
    setup();
    const dialog = await openDialog();
    send();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Chọn ít nhất một sản phẩm cần trả.',
    );
    choose(dialog, 'Áo thun');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tăng số lượng Áo thun cổ tròn' }));
    // Da mua 2 cai: nut tang het cho vuot so da mua.
    expect(
      within(dialog).getByRole('button', { name: 'Tăng số lượng Áo thun cổ tròn' }),
    ).toBeDisabled();
    send();
    expect(await screen.findByRole('alert')).toHaveTextContent('Chọn lý do trả hàng.');
    reason(dialog, 'Cỡ không vừa');
    fireEvent.change(within(dialog).getByLabelText(/Mô tả thêm/), {
      target: { value: '  Áo hơi chật vai  ' },
    });
    send();
    expect(await screen.findByRole('heading', { name: 'Chi tiết yêu cầu' })).toBeInTheDocument();
    expect(posts()[0]![1].body).toEqual({
      items: [{ orderItemId: 'oi1', quantity: 2 }],
      reasonCode: 'SIZE_MISMATCH',
      description: 'Áo hơi chật vai',
    });
  });

  it('UC-14.1/AC2 máy chủ báo quá hạn: hiện đúng thông điệp, hộp vẫn mở để khách đọc', async () => {
    setup();
    const dialog = await openDialog();
    request.mockImplementation(async (_path: string, options?: { method?: string }) => {
      if (options?.method === 'POST') {
        throw apiError(
          409,
          'RETURN_WINDOW_CLOSED',
          'Đã quá hạn 15 ngày kể từ khi nhận hàng để yêu cầu trả.',
        );
      }
      return current;
    });
    choose(dialog, 'Áo thun');
    reason(dialog, 'Cỡ không vừa');
    send();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Đã quá hạn 15 ngày kể từ khi nhận hàng để yêu cầu trả.',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
