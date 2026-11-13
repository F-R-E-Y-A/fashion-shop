import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/core';

import { MyReviewsPage } from './MyReviewsPage.js';
import { ReviewOrderPrompt } from './ReviewOrderPrompt.js';
import type { MyReview, ReviewableItem } from './reviews.api.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/features/account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/account')>()),
  useAuth: () => ({ user: { id: 'u1' }, authenticatedRequest: request }),
}));

/** jsdom chua co showModal va URL.createObjectURL: stub toi thieu cho hop va anh xem truoc. */
beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal(): void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto.close = function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
  let preview = 0;
  Object.assign(URL, {
    createObjectURL: () => `blob:preview-${(preview += 1)}`,
    revokeObjectURL: () => undefined,
  });
});

const uploads: { url: string; init?: RequestInit }[] = [];
beforeEach(() => {
  request.mockReset();
  uploads.length = 0;
  // Ngoai authenticatedRequest chi con hai loi goi: cau hinh tai anh (cong khai) va kho anh ngoai.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/uploads/config')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ enabled: true, maxBytes: 5 * 1024 * 1024, formats: ['jpg', 'png'] }),
        } as Response;
      }
      uploads.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ public_id: 'x' }) } as Response;
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function item(orderItemId: string, orderId: string, name: string): ReviewableItem {
  return {
    orderItemId,
    orderId,
    orderCode: `FR-${orderId.toUpperCase()}`,
    product: { name, slug: `sp-${orderItemId}`, imageUrl: null },
    variantLabel: 'Đen / M',
    deliveredAt: '2026-11-01T03:00:00.000Z',
    reviewDeadline: '2026-12-01T03:00:00.000Z',
  };
}
const eligible = [
  item('i1', 'o1', 'Áo thun cổ tròn'),
  item('i2', 'o1', 'Chân váy xếp ly'),
  item('i3', 'o2', 'Quần tây ống đứng'),
];
function mine(overrides: Partial<MyReview> = {}): MyReview {
  return {
    id: 'r1',
    orderItemId: 'i1',
    orderId: 'o1',
    product: { name: 'Áo thun cổ tròn', slug: 'sp-i1', imageUrl: null },
    variantLabel: 'Đen / M',
    rating: 5,
    content: 'Áo đẹp, vải dày.',
    fitFeedback: 'TRUE_TO_SIZE',
    heightCm: 165,
    weightKg: null,
    isAnonymous: false,
    reviewerName: 'Minh Anh',
    media: [
      {
        url: 'https://cdn.test/legacy.jpg',
        thumbnailUrl: 'https://cdn.test/legacy.jpg',
        key: null,
      },
    ],
    status: 'PENDING',
    moderationNote: null,
    reply: null,
    helpfulCount: 0,
    canEdit: true,
    editDeadline: '2026-12-01T03:00:00.000Z',
    createdAt: '2026-11-12T03:00:00.000Z',
    editedAt: null,
    ...overrides,
  };
}
const minePage = (items: MyReview[]) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 10,
  totalPages: 1,
});
type Body = Record<string, unknown>;
const sent = (method: string, path: string) =>
  request.mock.calls.filter(
    ([callPath, options]) => callPath === path && (options?.method ?? 'GET') === method,
  );

function show(path: string, element: ReactNode = <MyReviewsPage />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/tai-khoan/danh-gia" element={element} />
          <Route path="/don-hang/:id" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
/** O chon anh chi hien khi cau hinh tai anh (cong khai) da ve va dang bat. */
async function pick(file: File) {
  fireEvent.change(await screen.findByLabelText('+ Ảnh'), { target: { files: [file] } });
}

describe('UC-11.1 khách viết và sửa đánh giá', () => {
  it('UC-11.1/AC1 trang đơn đã giao mời đánh giá đúng số dòng còn chờ của đơn đó', async () => {
    request.mockResolvedValue(eligible);
    show('/don-hang/o1', <ReviewOrderPrompt orderId="o1" />);
    const link = await screen.findByRole('link', { name: 'Đánh giá 2 sản phẩm' });
    expect(link).toHaveAttribute('href', '/tai-khoan/danh-gia?don=o1');
  });

  it('UC-11.1/AC1 đơn không còn dòng chờ đánh giá thì không hiện lời mời', async () => {
    request.mockResolvedValue(eligible);
    show('/don-hang/o9', <ReviewOrderPrompt orderId="o9" />);
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('/reviews/eligible', expect.anything()),
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('UC-11.1/AC10 kiểm trước khi gửi, ảnh tải thẳng lên kho bằng phiếu; gửi xong chuyển sang tab đã viết', async () => {
    request.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/reviews/eligible') return eligible;
      if (path === '/uploads/tickets') {
        return {
          uploadUrl: 'https://upload.test/image/upload',
          fields: { public_id: 'freya/reviews/u1/abc', signature: 'sig' },
          key: 'freya/reviews/u1/abc',
          expiresAt: '2026-11-12T03:10:00.000Z',
          maxBytes: 5 * 1024 * 1024,
          formats: ['jpg', 'png'],
        };
      }
      if (path === '/reviews' && options?.method === 'POST') return mine();
      if (path.startsWith('/reviews/mine')) return minePage([mine()]);
      throw new Error(`Không mong đợi ${path}`);
    });
    show('/tai-khoan/danh-gia?don=o1');

    expect(await screen.findByText('Áo thun cổ tròn')).toBeInTheDocument();
    expect(screen.getByText('Chân váy xếp ly')).toBeInTheDocument();
    expect(screen.queryByText('Quần tây ống đứng')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Viết đánh giá' })[0]!);

    const dialog = screen.getByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Gửi đánh giá' });
    fireEvent.click(submit);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Hãy chọn số sao.');

    fireEvent.click(within(dialog).getByRole('radio', { name: '5 sao, Tuyệt vời' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vừa vặn' }));
    fireEvent.change(within(dialog).getByLabelText('Chiều cao (cm)'), {
      target: { value: '16a5' },
    });
    expect(within(dialog).getByLabelText('Chiều cao (cm)')).toHaveValue('165');
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Nhận xét/ }), {
      target: { value: '  Áo đẹp, vải dày.  ' },
    });

    // Anh GIF: chan ngay o trinh duyet, khong xin phieu.
    await pick(new File(['gif'], 'a.gif', { type: 'image/gif' }));
    expect(await within(dialog).findByText(/Chỉ nhận ảnh JPG, PNG hoặc WebP/)).toBeInTheDocument();
    fireEvent.click(submit);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Bỏ các ảnh bị lỗi rồi gửi.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bỏ ảnh 1' }));

    await pick(new File(['jpg'], 'b.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(uploads).toHaveLength(1));
    const upload = uploads[0]!;
    expect(upload.url).toBe('https://upload.test/image/upload');
    // Token cua cua hang khong bao gio di sang kho ngoai.
    expect(upload.init?.headers).toBeUndefined();
    const form = upload.init?.body as FormData;
    expect(form.get('public_id')).toBe('freya/reviews/u1/abc');
    expect(form.get('signature')).toBe('sig');
    expect(form.get('file')).toBeInstanceOf(File);
    await waitFor(() =>
      expect(dialog.querySelector('[data-state="uploading"]')).not.toBeInTheDocument(),
    );

    fireEvent.click(submit);
    await waitFor(() => expect(sent('POST', '/reviews')).toHaveLength(1));
    expect(sent('POST', '/reviews')[0]![1].body).toEqual({
      orderItemId: 'i1',
      rating: 5,
      content: 'Áo đẹp, vải dày.',
      fitFeedback: 'TRUE_TO_SIZE',
      heightCm: 165,
      weightKg: null,
      isAnonymous: false,
      media: [{ key: 'freya/reviews/u1/abc' }],
    });

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Đã gửi đánh giá. Đánh giá sẽ hiện sau khi shop duyệt.',
    );
    // Thong bao la state cuc bo, tab doi qua dieu huong (setSearchParams): co the cham mot lan ve.
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Đã đánh giá' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
    expect(await screen.findByText('Chờ duyệt')).toBeInTheDocument();
  });

  it('UC-11.1/AC2 gửi lại sau lỗi mạng mà lần đầu đã ghi (409): báo đã ghi nhận, sang tab đã đánh giá, dòng rời danh sách chờ', async () => {
    let posts = 0;
    request.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/reviews/eligible') return posts === 0 ? eligible : eligible.slice(1);
      if (path === '/reviews' && options?.method === 'POST') {
        posts += 1;
        // Lan dau may chu da ghi nhung tra loi mat tren duong; lan hai may chu bao trung.
        if (posts === 1) throw new TypeError('Failed to fetch');
        throw new ApiError({
          statusCode: 409,
          code: 'REVIEW_ALREADY_EXISTS',
          message: 'Bạn đã đánh giá sản phẩm này trong đơn hàng.',
          path: '/reviews',
          timestamp: '',
        });
      }
      if (path.startsWith('/reviews/mine')) return minePage([mine({ status: 'APPROVED' })]);
      throw new Error(`Không mong đợi ${path}`);
    });
    show('/tai-khoan/danh-gia?don=o1');

    fireEvent.click((await screen.findAllByRole('button', { name: 'Viết đánh giá' }))[0]!);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: '5 sao, Tuyệt vời' }));
    const content = within(dialog).getByRole('textbox', { name: /Nhận xét/ });
    fireEvent.change(content, { target: { value: 'Áo đẹp, vải dày.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi đánh giá' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Không gửi được đánh giá. Kiểm tra kết nối rồi thử lại.',
    );
    expect(content).toHaveValue('Áo đẹp, vải dày.');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi đánh giá' }));
    expect(
      await screen.findByText('Đánh giá cho sản phẩm này đã được ghi nhận từ lần gửi trước.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Đã đánh giá' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
    expect(await screen.findByText('Đang hiển thị')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /^Chờ đánh giá/ })).toHaveTextContent(
        'Chờ đánh giá (2)',
      ),
    );
    expect(posts).toBe(2);
  });

  it('UC-11.1/AC7 sửa một lần: điền sẵn nội dung cũ; không đổi ảnh thì không gửi trường media', async () => {
    request.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/reviews/eligible') return [];
      if (path.startsWith('/reviews/mine')) return minePage([mine({ status: 'APPROVED' })]);
      if (path === '/reviews/r1' && options?.method === 'PATCH') {
        return mine({ status: 'APPROVED', canEdit: false, editedAt: '2026-11-13T03:00:00.000Z' });
      }
      throw new Error(`Không mong đợi ${path}`);
    });
    show('/tai-khoan/danh-gia?tab=da-danh-gia');

    fireEvent.click(await screen.findByRole('button', { name: /^Sửa \(1 lần, trước/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('radio', { name: '5 sao, Tuyệt vời' })).toBeChecked();
    const content = within(dialog).getByRole('textbox', { name: /Nhận xét/ });
    expect(content).toHaveValue('Áo đẹp, vải dày.');
    expect(await within(dialog).findByRole('img', { name: 'Ảnh 1' })).toHaveAttribute(
      'src',
      'https://cdn.test/legacy.jpg',
    );

    fireEvent.change(content, { target: { value: 'Mặc hai tuần vẫn đẹp.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(sent('PATCH', '/reviews/r1')).toHaveLength(1));
    const body = sent('PATCH', '/reviews/r1')[0]![1].body as Body;
    expect(body).toMatchObject({ rating: 5, content: 'Mặc hai tuần vẫn đẹp.' });
    expect(body).not.toHaveProperty('media');
    expect(await screen.findByRole('status')).toHaveTextContent('Đã đăng đánh giá. Cảm ơn bạn!');
  });

  it('UC-11.1/AC7 đánh giá bị ẩn: thấy lý do, không còn nút sửa', async () => {
    request.mockImplementation(async (path: string) => {
      if (path === '/reviews/eligible') return [];
      return minePage([
        mine({ status: 'REJECTED', canEdit: false, moderationNote: 'Có số điện thoại.' }),
      ]);
    });
    show('/tai-khoan/danh-gia?tab=da-danh-gia');

    expect(await screen.findByText('Lý do ẩn: Có số điện thoại.')).toBeInTheDocument();
    expect(screen.getByText('Đã ẩn')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Sửa/ })).not.toBeInTheDocument();
  });

  it('UC-11.1/AC12 xoá: hỏi lại kèm hậu quả, gửi DELETE, báo đã xoá và tải lại danh sách', async () => {
    let deleted = false;
    request.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/reviews/eligible') return [];
      if (path.startsWith('/reviews/mine')) {
        return minePage(deleted ? [] : [mine({ status: 'APPROVED' })]);
      }
      if (path === '/reviews/r1' && options?.method === 'DELETE') {
        deleted = true;
        return undefined;
      }
      throw new Error(`Không mong đợi ${path}`);
    });
    show('/tai-khoan/danh-gia?tab=da-danh-gia');

    fireEvent.click(await screen.findByRole('button', { name: 'Xoá' }));
    const dialog = screen.getByRole('dialog', { name: 'Xoá đánh giá' });
    expect(dialog).toHaveTextContent('Không viết lại được đánh giá cho sản phẩm này của đơn này.');
    expect(sent('DELETE', '/reviews/r1')).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xoá đánh giá' }));

    await waitFor(() => expect(sent('DELETE', '/reviews/r1')).toHaveLength(1));
    expect(await screen.findByText('Đã xoá đánh giá.')).toBeInTheDocument();
    expect(await screen.findByText('Bạn chưa viết đánh giá nào.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('UC-11.1/AC12 xoá lỗi mạng thì báo trong hộp, giữ bài; đã xoá ở tab khác (404) thì coi như xong', async () => {
    let attempts = 0;
    request.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/reviews/eligible') return [];
      if (path.startsWith('/reviews/mine')) {
        return minePage(attempts < 2 ? [mine({ status: 'APPROVED' })] : []);
      }
      if (path === '/reviews/r1' && options?.method === 'DELETE') {
        attempts += 1;
        if (attempts === 1) throw new TypeError('Failed to fetch');
        throw new ApiError({
          statusCode: 404,
          code: 'REVIEW_NOT_FOUND',
          message: 'Không tìm thấy đánh giá.',
          path: '/reviews/r1',
          timestamp: '',
        });
      }
      throw new Error(`Không mong đợi ${path}`);
    });
    show('/tai-khoan/danh-gia?tab=da-danh-gia');

    fireEvent.click(await screen.findByRole('button', { name: 'Xoá' }));
    const dialog = screen.getByRole('dialog', { name: 'Xoá đánh giá' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xoá đánh giá' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Không xoá được đánh giá. Kiểm tra kết nối rồi thử lại.',
    );
    expect(screen.getByText('Áo đẹp, vải dày.')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Xoá đánh giá' }));
    expect(await screen.findByText('Đã xoá đánh giá.')).toBeInTheDocument();
    expect(await screen.findByText('Bạn chưa viết đánh giá nào.')).toBeInTheDocument();
    expect(attempts).toBe(2);
  });
});
