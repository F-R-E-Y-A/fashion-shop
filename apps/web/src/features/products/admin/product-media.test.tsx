import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queryClient, sessionQueryKeys } from '@/core';

import { type AdminCatalogDetail, adminCatalogKeys } from './admin-catalog.api.js';
import {
  actorA,
  actorB,
  backend,
  deferred,
  failure,
  mountCatalog,
  product,
  reply,
} from './catalog-test-support.js';
import { PRODUCT_ACTION_TIMEOUT_MS } from './product-status-action.js';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

const productWithImages: AdminCatalogDetail = {
  ...product,
  isActive: true,
  adminDisabled: false,
  imagesVersion: 0,
  imagesManagedByAdmin: false,
  imageUrl: 'https://cdn.test/img-1.jpg',
  images: [
    {
      id: '10000000-0000-4000-8000-000000000101',
      url: 'https://cdn.test/img-1.jpg',
      alt: 'Ảnh góc chính',
      sortOrder: 0,
      color: null,
    },
    {
      id: '10000000-0000-4000-8000-000000000102',
      url: 'https://cdn.test/img-2.jpg',
      alt: 'Ảnh màu đen',
      sortOrder: 1,
      color: { code: 'den', name: 'Đen', hex: '#000000' },
    },
    {
      id: '10000000-0000-4000-8000-000000000103',
      url: 'https://cdn.test/img-3.jpg',
      alt: null,
      sortOrder: 2,
      color: null,
    },
  ],
};

const productB: AdminCatalogDetail = {
  ...productWithImages,
  id: '20000000-0000-4000-8000-000000000002',
  name: 'Quần tây ống suông',
  slug: 'quan-tay-ong-suong',
  imagesVersion: 0,
  images: [
    {
      id: '20000000-0000-4000-8000-000000000201',
      url: 'https://cdn.test/b-1.jpg',
      alt: 'Ảnh quần B',
      sortOrder: 0,
      color: null,
    },
  ],
};

const detailPath = `/admin/products/${productWithImages.id}`;
const imagesApiPath = `/api/admin/products/${productWithImages.id}/images`;
const detailApiPath = `/api/admin/products/${productWithImages.id}`;

describe('UC-04.2 Quản trị Ảnh Sản Phẩm (Đợt 3 Frontend, AC50 - AC51)', () => {
  it('UC-04.2/AC50 hiển thị danh sách ảnh, huy hiệu ảnh đại diện/màu, sửa alt, di chuyển lên/xuống, đưa lên đầu và gỡ ảnh với nhãn bàn phím rõ ràng', async () => {
    const api = backend();
    api.state.products = [structuredClone(productWithImages)];
    mountCatalog(detailPath);

    expect(await screen.findByRole('heading', { name: 'Hình ảnh (3)' })).toBeInTheDocument();
    expect(screen.getByText('Ảnh đại diện (#1)')).toBeInTheDocument();
    expect(screen.getByText('Màu: Đen')).toBeInTheDocument();

    // Nút Lên của vị trí 1 bị khóa, nút Xuống của vị trí 3 bị khóa
    expect(screen.getByRole('button', { name: 'Chuyển ảnh vị trí 1 lên' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Chuyển ảnh vị trí 3 xuống' })).toBeDisabled();

    // Đưa ảnh vị trí 3 lên đầu làm ảnh đại diện
    fireEvent.click(
      screen.getByRole('button', { name: 'Đưa ảnh vị trí 3 lên đầu làm ảnh đại diện' }),
    );

    // Sửa alt cho ảnh mới ở vị trí 1
    const altInput1 = screen.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 1' });
    fireEvent.change(altInput1, { target: { value: '  Ảnh đại diện mới sau sắp xếp  ' } });

    // Chuyển ảnh vị trí 2 xuống vị trí 3
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển ảnh vị trí 2 xuống' }));

    // Gỡ ảnh vị trí 3 (ảnh gốc #1)
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ ảnh vị trí 3' }));
    expect(screen.getByRole('heading', { name: 'Hình ảnh (2)' })).toBeInTheDocument();

    // Bấm Lưu bộ ảnh
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bộ ảnh' }));

    await screen.findByText(/Đã lưu bộ ảnh sản phẩm/);

    const putReqs = api.requests.filter((r) => r.method === 'PUT' && r.path === imagesApiPath);
    expect(putReqs).toHaveLength(1);
    expect(putReqs[0]?.body).toEqual({
      expectedVersion: 0,
      items: [
        {
          id: '10000000-0000-4000-8000-000000000103',
          alt: 'Ảnh đại diện mới sau sắp xếp',
        },
        {
          id: '10000000-0000-4000-8000-000000000102',
          alt: 'Ảnh màu đen',
        },
      ],
    });
  });

  it('UC-04.2/AC50 tải ảnh mới với UUID client-generated ổn định, báo lỗi từng ảnh (sai định dạng, quá 5MB, vượt 8 ảnh) và giữ các ảnh hợp lệ', async () => {
    const api = backend();
    api.state.products = [structuredClone(productWithImages)];
    mountCatalog(detailPath);

    await screen.findByRole('heading', { name: 'Hình ảnh (3)' });
    const fileInput = screen.getByLabelText('Chọn tệp ảnh sản phẩm để tải lên');

    const validFile = new File(['valid-image-bytes'], 'ao-moi.webp', { type: 'image/webp' });
    const invalidFormatFile = new File(['gif-bytes'], 'dong.gif', { type: 'image/gif' });
    const oversizedFile = new File([new Uint8Array(5 * 1024 * 1024 + 10)], 'qua-nang.jpg', {
      type: 'image/jpeg',
    });

    await act(async () => {
      fireEvent.change(fileInput, {
        target: { files: [validFile, invalidFormatFile, oversizedFile] },
      });
    });

    // Hiển thị danh sách lỗi từng tệp nhưng tệp hợp lệ vẫn được tải lên và thêm vào draft
    const errList = await screen.findByRole('alert', { name: 'Lỗi tải ảnh lên' });
    expect(within(errList).getByText(/dong\.gif:/)).toBeInTheDocument();
    expect(within(errList).getByText(/qua-nang\.jpg:/)).toBeInTheDocument();

    expect(await screen.findByRole('heading', { name: 'Hình ảnh (4)' })).toBeInTheDocument();
    expect(screen.getByText('Mới tải lên')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 4' }), {
      target: { value: 'Ảnh mới tải lên' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu bộ ảnh' }));
    await screen.findByText(/Đã lưu bộ ảnh sản phẩm/);

    const putReq = api.requests.find((r) => r.method === 'PUT' && r.path === imagesApiPath);
    expect(putReq).toBeDefined();
    const body = putReq?.body as {
      expectedVersion: number;
      items: { id: string; key?: string; alt: string | null }[];
    };
    expect(body.items).toHaveLength(4);
    expect(body.items[3]?.key).toMatch(/^freya\/products\//);
    expect(body.items[3]?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('UC-04.2/AC50 khi kho chưa cấu hình (uploadsEnabled = false): hiện thông báo kho tắt, khóa nút tải ảnh nhưng vẫn sửa alt, đổi thứ tự và gỡ ảnh hiện có bình thường', async () => {
    const api = backend();
    api.state.uploadsEnabled = false;
    api.state.products = [structuredClone(productWithImages)];
    mountCatalog(detailPath);

    expect(await screen.findByText(/Kho ảnh chưa được cấu hình trên máy chủ/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Tải ảnh lên' })).toBeDisabled();

    // Vẫn đổi thứ tự và sửa alt ảnh hiện có được
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển ảnh vị trí 2 lên' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 1' }), {
      target: { value: 'Đã đổi lên đầu khi kho tắt' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu bộ ảnh' }));
    await screen.findByText(/Đã lưu bộ ảnh sản phẩm/);

    const putReq = api.requests.find((r) => r.method === 'PUT' && r.path === imagesApiPath);
    expect(putReq).toBeDefined();
  });

  it('UC-04.2/AC51 xung đột 409 giữ nguyên bản nháp, khóa nút Lưu cho đến khi bấm Tải dữ liệu mới nhất để đối chiếu', async () => {
    const api = backend();
    api.state.products = [structuredClone(productWithImages)];
    mountCatalog(detailPath);

    await screen.findByRole('heading', { name: 'Hình ảnh (3)' });
    // Admin sửa alt và đảo vị trí
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển ảnh vị trí 2 lên' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 1' }), {
      target: { value: 'Bản nháp của tôi khi 409' },
    });

    // Máy chủ đã tăng imagesVersion lên 1 bởi admin khác (và thêm 1 ảnh thứ 4 trên server)
    api.state.products = [
      {
        ...structuredClone(productWithImages),
        imagesVersion: 1,
        images: [
          ...productWithImages.images,
          {
            id: '10000000-0000-4000-8000-000000000104',
            url: 'https://cdn.test/img-4.jpg',
            alt: 'Ảnh từ admin khác',
            sortOrder: 3,
            color: null,
          },
        ],
      },
    ];

    fireEvent.click(screen.getByRole('button', { name: 'Lưu bộ ảnh' }));

    // Hiển thị cảnh báo 409 và giữ nguyên bản nháp đang sửa
    expect(await screen.findAllByText(/Bộ ảnh đã thay đổi trên máy chủ \(409\)/)).not.toHaveLength(
      0,
    );
    expect(screen.getByDisplayValue('Bản nháp của tôi khi 409')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu bộ ảnh' })).toBeDisabled();

    // Bấm Tải dữ liệu mới nhất -> giữ thứ tự & alt bản nháp, ghép thêm ảnh mới trên server và nâng expectedVersion lên 1
    fireEvent.click(screen.getByRole('button', { name: 'Tải dữ liệu mới nhất' }));
    await screen.findByText(/Đã tải dữ liệu mới nhất \(phiên bản 1\)/);

    expect(screen.getByDisplayValue('Bản nháp của tôi khi 409')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ảnh từ admin khác')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu bộ ảnh' })).not.toBeDisabled();

    // Lưu lại với phiên bản 1 thành công
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bộ ảnh' }));
    await screen.findByText(/Đã lưu bộ ảnh sản phẩm/);

    const putReqs = api.requests.filter((r) => r.method === 'PUT' && r.path === imagesApiPath);
    expect(putReqs).toHaveLength(2);
    expect((putReqs[1]?.body as { expectedVersion: number }).expectedVersion).toBe(1);
  });

  it('UC-04.2/AC51 timeout/mất kết nối khi lưu: giữ phiên bản và bản nháp qua điều hướng cùng phiên, hiện trạng thái chờ đối chiếu, đối chiếu GET theo id/thứ tự/alt/version và KHÔNG tự động gửi lại PUT', async () => {
    const api = backend();
    api.state.products = [structuredClone(productWithImages)];
    const gate = deferred<Response>();
    api.state.override = (r) =>
      r.method === 'PUT' && r.path === imagesApiPath ? gate.promise : undefined;

    const view = mountCatalog(detailPath);
    await screen.findByRole('heading', { name: 'Hình ảnh (3)' });

    // Tải 1 ảnh mới và đưa lên vị trí #1
    const fileInput = screen.getByLabelText('Chọn tệp ảnh sản phẩm để tải lên');
    const newFile = new File(['photo'], 'timeout-photo.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [newFile] } });
    });
    await screen.findByRole('heading', { name: 'Hình ảnh (4)' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Đưa ảnh vị trí 4 lên đầu làm ảnh đại diện' }),
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 1' }), {
      target: { value: 'Ảnh mới qua timeout' },
    });

    // Bấm Lưu bộ ảnh
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bộ ảnh' }));
    await waitFor(() =>
      expect(api.requests.some((r) => r.method === 'PUT' && r.path === imagesApiPath)).toBe(true),
    );

    const sentPut = api.requests.find((r) => r.method === 'PUT' && r.path === imagesApiPath)!;
    const sentPayload = sentPut.body as {
      expectedVersion: number;
      items: { id: string; key?: string; alt: string | null }[];
    };

    // Điều hướng sang trang danh sách sản phẩm rồi response lỗi mạng/timeout (504) trả về
    act(() => view.go('/admin/products'));
    await screen.findByRole('link', { name: productWithImages.name });
    await act(async () => {
      gate.resolve(failure(504));
    });

    // Quay lại trang chi tiết sản phẩm: bản nháp và trạng thái chờ đối chiếu vẫn được giữ nguyên!
    act(() => view.go(detailPath));
    await screen.findByRole('heading', { name: productWithImages.name });

    expect(screen.getByDisplayValue('Ảnh mới qua timeout')).toBeInTheDocument();
    const recheckBtn = await screen.findByRole('button', { name: 'Đối chiếu bộ ảnh' });
    expect(recheckBtn).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu bộ ảnh' })).toBeDisabled();

    // Trường hợp 1: GET đối chiếu lỗi 500 -> vẫn giữ nguyên bản nháp và trạng thái chờ đối chiếu
    api.state.override = (r) =>
      r.method === 'GET' && r.path === detailApiPath ? failure(500) : undefined;
    fireEvent.click(recheckBtn);
    await screen.findByText(/Chưa đối chiếu được trạng thái bộ ảnh/);
    expect(screen.getByRole('button', { name: 'Đối chiếu bộ ảnh' })).toBeInTheDocument();

    // Trường hợp 2: Máy chủ thực tế CHƯA ghi nhận (vẫn ở version 0) -> đối chiếu mở khóa bản nháp để người dùng chủ động lưu, KHÔNG tự động gửi lại PUT
    api.state.override = undefined;
    fireEvent.click(screen.getByRole('button', { name: 'Đối chiếu bộ ảnh' }));
    await screen.findByText(/máy chủ chưa ghi nhận thay đổi vừa gửi/);
    expect(api.requests.filter((r) => r.method === 'PUT' && r.path === imagesApiPath)).toHaveLength(
      1,
    );
    expect(screen.getByDisplayValue('Ảnh mới qua timeout')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu bộ ảnh' })).not.toBeDisabled();

    // Trường hợp 3: Gửi lại bị timeout nhưng máy chủ ĐÃ ghi nhận thành công với đúng client ID, thứ tự, alt và version
    const gate2 = deferred<Response>();
    api.state.override = (r) =>
      r.method === 'PUT' && r.path === imagesApiPath ? gate2.promise : undefined;
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bộ ảnh' }));
    await waitFor(() =>
      expect(
        api.requests.filter((r) => r.method === 'PUT' && r.path === imagesApiPath),
      ).toHaveLength(2),
    );

    api.state.products = [
      {
        ...structuredClone(productWithImages),
        imagesVersion: 1,
        imagesManagedByAdmin: true,
        imageUrl: `https://cdn.test/${sentPayload.items[0]!.key}.jpg`,
        images: sentPayload.items.map((item, idx) => ({
          id: item.id,
          url: item.key ? `https://cdn.test/${item.key}.jpg` : `https://cdn.test/img-${idx}.jpg`,
          alt: item.alt,
          sortOrder: idx,
          color: null,
        })),
      },
    ];
    await act(async () => {
      gate2.resolve(failure(504));
    });

    api.state.override = undefined;
    fireEvent.click(await screen.findByRole('button', { name: 'Đối chiếu bộ ảnh' }));
    await screen.findByText(/bộ ảnh bạn gửi đã được lưu thành công trên máy chủ/);
    expect(screen.queryByRole('button', { name: 'Đối chiếu bộ ảnh' })).toBeNull();
    // Không gửi thêm PUT lần thứ 3
    expect(api.requests.filter((r) => r.method === 'PUT' && r.path === imagesApiPath)).toHaveLength(
      2,
    );
  });

  it('UC-04.2/AC51 cô lập sản phẩm A → B: response hoặc draft của sản phẩm A về muộn khi đang xem sản phẩm B không làm lẫn state của B', async () => {
    const api = backend();
    api.state.products = [structuredClone(productWithImages), structuredClone(productB)];
    const putGateA = deferred<Response>();
    api.state.override = (r) =>
      r.method === 'PUT' && r.path === imagesApiPath ? putGateA.promise : undefined;

    const view = mountCatalog(detailPath);
    await screen.findByRole('heading', { name: productWithImages.name });

    // Sửa alt ở sản phẩm A và bấm Lưu
    fireEvent.change(screen.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 1' }), {
      target: { value: 'Alt đang lưu của sản phẩm A' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bộ ảnh' }));
    await waitFor(() =>
      expect(api.requests.some((r) => r.method === 'PUT' && r.path === imagesApiPath)).toBe(true),
    );

    // Chuyển ngay sang sản phẩm B trong khi request của A chưa xong
    act(() => view.go(`/admin/products/${productB.id}`));
    await screen.findByRole('heading', { name: productB.name });

    // Sản phẩm B hiển thị đúng 1 ảnh của B, không bị trộn draft của A
    expect(screen.getByRole('heading', { name: 'Hình ảnh (1)' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ảnh quần B')).toBeInTheDocument();

    // Response của A trả về muộn khi đang ở B -> không hiện banner của A trên trang B và không đè dữ liệu B
    await act(async () => {
      putGateA.resolve(
        reply({
          id: productWithImages.id,
          imagesVersion: 1,
          imagesManagedByAdmin: true,
          imageUrl: productWithImages.imageUrl,
          images: productWithImages.images,
        }),
      );
    });

    expect(screen.getByDisplayValue('Ảnh quần B')).toBeInTheDocument();
    expect(screen.queryByText(/Alt đang lưu của sản phẩm A/)).toBeNull();
  });

  it('UC-04.2/AC51 chặn response muộn sau 403, logout hoặc đổi tài khoản (A → B) và xóa sạch draft/uncertain marker của phiên cũ', async () => {
    // 1. Khi nhận 403 trong lúc PUT đang bay
    const api = backend();
    api.state.products = [structuredClone(productWithImages)];
    const putGate = deferred<Response>();
    api.state.override = (r) =>
      r.method === 'PUT' && r.path === imagesApiPath ? putGate.promise : undefined;

    const view = mountCatalog(detailPath);
    await screen.findByRole('heading', { name: productWithImages.name });

    fireEvent.change(screen.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 1' }), {
      target: { value: 'Sửa trước khi mất quyền' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bộ ảnh' }));
    await waitFor(() =>
      expect(api.requests.some((r) => r.method === 'PUT' && r.path === imagesApiPath)).toBe(true),
    );

    await act(async () => {
      putGate.resolve(failure(403));
    });

    await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' });
    expect(
      view.client
        .getQueriesData({ queryKey: sessionQueryKeys.admin })
        .every(([, data]) => data === undefined),
    ).toBe(true);
    cleanup();

    // 2. Khi logout và đăng nhập tài khoản B trong lúc PUT của A đang bay
    const api2 = backend();
    api2.state.products = [structuredClone(productWithImages)];
    const putGate2 = deferred<Response>();
    api2.state.override = (r) =>
      r.method === 'PUT' && r.path === imagesApiPath ? putGate2.promise : undefined;

    const view2 = mountCatalog(detailPath);
    await screen.findByRole('heading', { name: productWithImages.name });

    fireEvent.change(screen.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 1' }), {
      target: { value: 'Draft của Actor A' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bộ ảnh' }));
    await waitFor(() =>
      expect(api2.requests.some((r) => r.method === 'PUT' && r.path === imagesApiPath)).toBe(true),
    );

    const inFlightSignal = api2.requests.find(
      (r) => r.method === 'PUT' && r.path === imagesApiPath,
    )?.signal;

    await act(async () => {
      await view2.auth().logout();
    });
    expect(inFlightSignal?.aborted).toBe(true);

    await act(async () => {
      await view2.auth().login({ email: actorB.email, password: 'Password123' });
      view2.go(detailPath);
    });
    await screen.findByRole('heading', { name: productWithImages.name });

    // Actor B thấy dữ liệu sạch từ server, không thấy draft của Actor A
    expect(screen.getByDisplayValue('Ảnh góc chính')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Draft của Actor A')).toBeNull();

    // Phản hồi muộn của Actor A về tới không tác động tới cache của Actor B
    await act(async () => {
      putGate2.resolve(
        reply({
          id: productWithImages.id,
          imagesVersion: 9,
          imagesManagedByAdmin: true,
          imageUrl: productWithImages.imageUrl,
          images: productWithImages.images.map((i, idx) =>
            idx === 0 ? { ...i, alt: 'Draft của Actor A' } : i,
          ),
        }),
      );
    });

    expect(screen.getByDisplayValue('Ảnh góc chính')).toBeInTheDocument();
  });

  it('UC-04.2/AC51 uncertain marker cho images có gcTime = Infinity và tự động abort sau PRODUCT_ACTION_TIMEOUT_MS', async () => {
    const key = adminCatalogKeys.uncertainImagesUpdate(actorA.id, 1, productWithImages.id);
    const query = queryClient.getQueryCache().build(queryClient, { queryKey: key });
    expect(query.gcTime).toBe(Infinity);
    queryClient.removeQueries({ queryKey: key });

    const api = backend();
    api.state.products = [structuredClone(productWithImages)];
    api.state.override = (r) => {
      if (r.method !== 'PUT') return undefined;
      return new Promise<Response>((_resolve, reject) =>
        r.signal?.addEventListener('abort', () => reject(r.signal?.reason), { once: true }),
      );
    };

    mountCatalog(detailPath);
    await screen.findByRole('heading', { name: 'Hình ảnh (3)' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 1' }), {
      target: { value: 'Test timeout abort' },
    });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bộ ảnh' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PRODUCT_ACTION_TIMEOUT_MS + 100);
    });
    vi.useRealTimers();

    expect(await screen.findByRole('button', { name: 'Đối chiếu bộ ảnh' })).toBeInTheDocument();
  });

  it('UC-04.2/AC51 (hồi quy P2-1) Tải lại sau 409 gộp alt ba chiều: không ghi đè alt của admin khác trên ảnh mình chưa sửa và khóa lưu khi cùng sửa một ảnh khác nhau', async () => {
    const api = backend();
    api.state.products = [structuredClone(productWithImages)];
    mountCatalog(detailPath);

    await screen.findByRole('heading', { name: 'Hình ảnh (3)' });

    // Admin A sửa alt ảnh #1 và ảnh #3; KHÔNG đụng vào alt ảnh #2
    fireEvent.change(screen.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 1' }), {
      target: { value: 'Alt mới từ A cho ảnh 1' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 3' }), {
      target: { value: 'Alt từ A cho ảnh 3' },
    });

    // Trước khi A lưu, Admin B đã lưu phiên bản 1 với alt mới ở ảnh #2 (A không sửa) và ảnh #3 (cùng sửa với A)
    const serverUpdated = structuredClone(productWithImages);
    serverUpdated.imagesVersion = 1;
    serverUpdated.imagesManagedByAdmin = true;
    serverUpdated.images[1]!.alt = 'Alt của admin B trên ảnh 2';
    serverUpdated.images[2]!.alt = 'Alt của admin B trên ảnh 3';
    api.state.products = [serverUpdated];

    fireEvent.click(screen.getByRole('button', { name: 'Lưu bộ ảnh' }));
    expect(await screen.findAllByText(/Bộ ảnh đã thay đổi trên máy chủ \(409\)/)).not.toHaveLength(
      0,
    );

    // Bấm Tải dữ liệu mới nhất ->
    //  - ảnh #1 giữ bản A ('Alt mới từ A cho ảnh 1')
    //  - ảnh #2 tự động nhận bản B ('Alt của admin B trên ảnh 2'), KHÔNG ghi đè bằng giá trị cũ
    //  - ảnh #3 báo xung đột alt và khóa nút Lưu cho đến khi A chọn rõ
    fireEvent.click(screen.getByRole('button', { name: 'Tải dữ liệu mới nhất' }));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 2' })).toHaveValue(
        'Alt của admin B trên ảnh 2',
      ),
    );
    expect(screen.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 1' })).toHaveValue(
      'Alt mới từ A cho ảnh 1',
    );
    expect(screen.getByText(/Alt của admin B trên ảnh 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu bộ ảnh' })).toBeDisabled();

    // Chọn giữ bản đang soạn cho ảnh #3 -> mở khóa Lưu bộ ảnh và gửi đủ cả 3 alt đúng
    fireEvent.click(screen.getByRole('button', { name: 'Giữ mô tả đang soạn cho ảnh vị trí 3' }));
    expect(screen.getByRole('button', { name: 'Lưu bộ ảnh' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu bộ ảnh' }));
    await screen.findByText(/Đã lưu bộ ảnh sản phẩm/);

    const putReqs = api.requests.filter((r) => r.method === 'PUT' && r.path === imagesApiPath);
    expect(putReqs).toHaveLength(2);
    expect(putReqs[1]?.body).toEqual({
      expectedVersion: 1,
      items: [
        { id: serverUpdated.images[0]!.id, alt: 'Alt mới từ A cho ảnh 1' },
        { id: serverUpdated.images[1]!.id, alt: 'Alt của admin B trên ảnh 2' },
        { id: serverUpdated.images[2]!.id, alt: 'Alt từ A cho ảnh 3' },
      ],
    });
  });

  it('UC-04.2/AC51 (hồi quy P2-A) Tải lại sau 409 gộp thứ tự ba chiều: nhận ảnh đại diện mới từ máy chủ khi mình không đổi thứ tự và yêu cầu chọn khi cả hai đổi thứ tự khác nhau', async () => {
    // Trường hợp 1: Admin A chỉ sửa alt ảnh #2 (không đổi thứ tự), Admin B đưa ảnh 3 lên làm ảnh đại diện (#1)
    const api = backend();
    api.state.products = [structuredClone(productWithImages)];
    const view = mountCatalog(detailPath);

    await screen.findByRole('heading', { name: 'Hình ảnh (3)' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 2' }), {
      target: { value: 'Alt mới từ A cho ảnh đen' },
    });

    const serverReordered = structuredClone(productWithImages);
    const [s1, s2, s3] = serverReordered.images;
    serverReordered.imagesVersion = 1;
    serverReordered.imagesManagedByAdmin = true;
    serverReordered.images = [
      { ...s3!, sortOrder: 0 },
      { ...s1!, sortOrder: 1 },
      { ...s2!, sortOrder: 2 },
    ];
    serverReordered.imageUrl = s3!.url;
    api.state.products = [serverReordered];

    fireEvent.click(screen.getByRole('button', { name: 'Lưu bộ ảnh' }));
    expect(await screen.findAllByText(/Bộ ảnh đã thay đổi trên máy chủ \(409\)/)).not.toHaveLength(
      0,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tải dữ liệu mới nhất' }));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 1' })).toHaveValue(
        s3!.alt ?? '',
      ),
    );
    expect(screen.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 3' })).toHaveValue(
      'Alt mới từ A cho ảnh đen',
    );
    expect(screen.getByRole('button', { name: 'Lưu bộ ảnh' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu bộ ảnh' }));
    await screen.findByText(/Đã lưu bộ ảnh sản phẩm/);

    const putReqs1 = api.requests.filter((r) => r.method === 'PUT' && r.path === imagesApiPath);
    expect(putReqs1[1]?.body).toEqual({
      expectedVersion: 1,
      items: [
        { id: s3!.id, alt: s3!.alt },
        { id: s1!.id, alt: s1!.alt },
        { id: s2!.id, alt: 'Alt mới từ A cho ảnh đen' },
      ],
    });

    // Trường hợp 2: Cả A và B cùng đổi thứ tự theo hai cách khác nhau -> bắt buộc chọn trước khi lưu
    view.unmount();
    const api2 = backend();
    api2.state.products = [structuredClone(productWithImages)];
    mountCatalog(detailPath);

    await screen.findByRole('heading', { name: 'Hình ảnh (3)' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Đưa ảnh vị trí 2 lên đầu làm ảnh đại diện' }),
    );

    const serverDiffOrder = structuredClone(productWithImages);
    const [b1, b2, b3] = serverDiffOrder.images;
    serverDiffOrder.imagesVersion = 1;
    serverDiffOrder.imagesManagedByAdmin = true;
    serverDiffOrder.images = [
      { ...b3!, sortOrder: 0 },
      { ...b1!, sortOrder: 1 },
      { ...b2!, sortOrder: 2 },
    ];
    api2.state.products = [serverDiffOrder];

    fireEvent.click(screen.getByRole('button', { name: 'Lưu bộ ảnh' }));
    expect(await screen.findAllByText(/Bộ ảnh đã thay đổi trên máy chủ \(409\)/)).not.toHaveLength(
      0,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tải dữ liệu mới nhất' }));
    expect(await screen.findByRole('button', { name: 'Dùng thứ tự máy chủ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Giữ thứ tự đang soạn' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu bộ ảnh' })).toBeDisabled();

    // Khi sửa thêm alt rồi chọn Dùng thứ tự máy chủ -> thứ tự khớp máy chủ và Lưu mở khóa để lưu phần alt
    fireEvent.change(screen.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 1' }), {
      target: { value: 'Alt bổ sung trên b2' },
    });
    expect(screen.getByRole('button', { name: 'Lưu bộ ảnh' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Dùng thứ tự máy chủ' }));
    expect(screen.queryByRole('button', { name: 'Dùng thứ tự máy chủ' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 1' })).toHaveValue(
      b3!.alt ?? '',
    );
    expect(screen.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 3' })).toHaveValue(
      'Alt bổ sung trên b2',
    );
    expect(screen.getByRole('button', { name: 'Lưu bộ ảnh' })).not.toBeDisabled();
  });

  it('UC-04.2/AC51 (hồi quy P2-B) Tải lại sau 409 giữ thao tác gỡ ảnh không bị hồi sinh và báo xung đột nếu admin khác vừa sửa ảnh đó', async () => {
    // Trường hợp 1: Admin A gỡ ảnh 3, Admin B chỉ sửa alt ảnh 2 -> sau 409 tải lại, ảnh 3 vẫn bị gỡ và nhận alt mới của B trên ảnh 2
    const api = backend();
    api.state.products = [structuredClone(productWithImages)];
    const view = mountCatalog(detailPath);

    await screen.findByRole('heading', { name: 'Hình ảnh (3)' });
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ ảnh vị trí 3' }));
    expect(screen.getByRole('heading', { name: 'Hình ảnh (2)' })).toBeInTheDocument();

    const serverEdited2 = structuredClone(productWithImages);
    serverEdited2.imagesVersion = 1;
    serverEdited2.imagesManagedByAdmin = true;
    serverEdited2.images[1]!.alt = 'Alt mới của admin B cho ảnh 2';
    api.state.products = [serverEdited2];

    fireEvent.click(screen.getByRole('button', { name: 'Lưu bộ ảnh' }));
    expect(await screen.findAllByText(/Bộ ảnh đã thay đổi trên máy chủ \(409\)/)).not.toHaveLength(
      0,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tải dữ liệu mới nhất' }));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 2' })).toHaveValue(
        'Alt mới của admin B cho ảnh 2',
      ),
    );
    expect(screen.getByRole('heading', { name: 'Hình ảnh (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu bộ ảnh' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu bộ ảnh' }));
    await screen.findByText(/Đã lưu bộ ảnh sản phẩm/);

    const putReqs1 = api.requests.filter((r) => r.method === 'PUT' && r.path === imagesApiPath);
    expect(putReqs1[1]?.body).toEqual({
      expectedVersion: 1,
      items: [
        { id: serverEdited2.images[0]!.id, alt: serverEdited2.images[0]!.alt },
        { id: serverEdited2.images[1]!.id, alt: 'Alt mới của admin B cho ảnh 2' },
      ],
    });

    // Trường hợp 2: Admin A gỡ ảnh 3 trong khi Admin B sửa alt của chính ảnh 3 -> hiện xung đột gỡ ảnh và khóa Lưu cho đến khi A chọn
    view.unmount();
    const api2 = backend();
    api2.state.products = [structuredClone(productWithImages)];
    mountCatalog(detailPath);

    await screen.findByRole('heading', { name: 'Hình ảnh (3)' });
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ ảnh vị trí 3' }));

    const serverEdited3 = structuredClone(productWithImages);
    serverEdited3.imagesVersion = 1;
    serverEdited3.imagesManagedByAdmin = true;
    serverEdited3.images[2]!.alt = 'Admin B vừa cập nhật ảnh 3';
    api2.state.products = [serverEdited3];

    fireEvent.click(screen.getByRole('button', { name: 'Lưu bộ ảnh' }));
    expect(await screen.findAllByText(/Bộ ảnh đã thay đổi trên máy chủ \(409\)/)).not.toHaveLength(
      0,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tải dữ liệu mới nhất' }));
    expect(await screen.findByText(/Admin B vừa cập nhật ảnh 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vẫn gỡ ảnh này' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Giữ lại ảnh từ máy chủ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu bộ ảnh' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Vẫn gỡ ảnh này' }));
    expect(screen.getByRole('heading', { name: 'Hình ảnh (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu bộ ảnh' })).not.toBeDisabled();
  });

  it('UC-04.2/AC51 (hồi quy P2-C) Tải lại sau 409 phát hiện import thay URL dù giữ nguyên ID, alt và thứ tự của ảnh định gỡ', async () => {
    const api = backend();
    api.state.products = [structuredClone(productWithImages)];
    mountCatalog(detailPath);

    await screen.findByRole('heading', { name: 'Hình ảnh (3)' });
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ ảnh vị trí 3' }));
    expect(screen.getByRole('heading', { name: 'Hình ảnh (2)' })).toBeInTheDocument();

    // Import cập nhật vị trí 3: giữ nguyên ID, alt và sortOrder, chỉ thay URL mới và tăng imagesVersion
    const serverReplacedUrl = structuredClone(productWithImages);
    serverReplacedUrl.imagesVersion = 1;
    serverReplacedUrl.images[2]!.url = 'https://cdn.test/img-3-replaced-by-import.jpg';
    api.state.products = [serverReplacedUrl];

    fireEvent.click(screen.getByRole('button', { name: 'Lưu bộ ảnh' }));
    expect(await screen.findAllByText(/Bộ ảnh đã thay đổi trên máy chủ \(409\)/)).not.toHaveLength(
      0,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tải dữ liệu mới nhất' }));
    expect(
      await screen.findByRole('button', { name: 'Giữ lại ảnh từ máy chủ' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vẫn gỡ ảnh này' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu bộ ảnh' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Giữ lại ảnh từ máy chủ' }));
    expect(screen.getByRole('heading', { name: 'Hình ảnh (3)' })).toBeInTheDocument();
    const imgs = screen.getAllByRole('img');
    expect(imgs[2]).toHaveAttribute('src', 'https://cdn.test/img-3-replaced-by-import.jpg');
  });

  it('UC-04.2/AC51 (hồi quy P2-D) Khi admin đang sửa alt mà import thay URL mới vào cùng ID và giữ nguyên alt máy chủ, tải lại sau 409 phải yêu cầu xác nhận trước khi lưu', async () => {
    const api = backend();
    api.state.products = [structuredClone(productWithImages)];
    mountCatalog(detailPath);

    await screen.findByRole('heading', { name: 'Hình ảnh (3)' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 1' }), {
      target: { value: 'Mô tả dành cho ảnh cũ' },
    });

    // Import thay ảnh #1 bằng URL mới nhưng giữ nguyên ID, alt và sortOrder
    const serverReplacedUrl = structuredClone(productWithImages);
    serverReplacedUrl.imagesVersion = 1;
    serverReplacedUrl.images[0]!.url = 'https://cdn.test/img-1-replaced-by-import.jpg';
    api.state.products = [serverReplacedUrl];

    fireEvent.click(screen.getByRole('button', { name: 'Lưu bộ ảnh' }));
    expect(await screen.findAllByText(/Bộ ảnh đã thay đổi trên máy chủ \(409\)/)).not.toHaveLength(
      0,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tải dữ liệu mới nhất' }));
    expect(
      await screen.findByRole('button', { name: 'Dùng mô tả máy chủ cho ảnh vị trí 1' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Giữ mô tả đang soạn cho ảnh vị trí 1' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu bộ ảnh' })).toBeDisabled();
    expect(screen.getAllByRole('img')[0]).toHaveAttribute(
      'src',
      'https://cdn.test/img-1-replaced-by-import.jpg',
    );

    // Chọn Dùng mô tả máy chủ -> mô tả quay về alt ảnh mới của máy chủ, không lưu nhầm mô tả ảnh cũ lên ảnh mới
    fireEvent.click(screen.getByRole('button', { name: 'Dùng mô tả máy chủ cho ảnh vị trí 1' }));
    expect(screen.getByRole('textbox', { name: 'Mô tả thay thế ảnh vị trí 1' })).toHaveValue(
      serverReplacedUrl.images[0]!.alt ?? '',
    );
    expect(
      screen.queryByRole('button', { name: 'Dùng mô tả máy chủ cho ảnh vị trí 1' }),
    ).toBeNull();
  });

  it('UC-04.2/AC50 kéo-thả trực tiếp ô ảnh trên thanh sắp xếp nhanh lên vị trí #1 và kéo-thả tệp để tải lên', async () => {
    const api = backend();
    api.state.products = [structuredClone(productWithImages)];
    mountCatalog(detailPath);

    await screen.findByRole('heading', { name: 'Hình ảnh (3)' });

    const tile3 = screen.getByRole('button', { name: 'Chọn ảnh vị trí 3' });
    const tile1 = screen.getByRole('button', { name: 'Chọn ảnh vị trí 1 (Ảnh đại diện)' });

    const transferData: Record<string, string> = {};
    const dt = {
      effectAllowed: 'move',
      dropEffect: 'move',
      types: ['text/plain'],
      files: [] as unknown as FileList,
      setData: (k: string, v: string) => {
        transferData[k] = v;
      },
      getData: (k: string) => transferData[k] ?? '',
    };

    fireEvent.dragStart(tile3, { dataTransfer: dt });
    fireEvent.dragOver(tile1, { dataTransfer: dt });
    fireEvent.drop(tile1, { dataTransfer: dt });
    fireEvent.dragEnd(tile3, { dataTransfer: dt });

    // Ảnh #3 đã lên đầu làm ảnh đại diện (#1)
    expect(screen.getAllByRole('img')[0]).toHaveAttribute('src', 'https://cdn.test/img-3.jpg');

    // Kéo-thả tệp PNG mới vào nút "+ Thêm" trên thanh sắp xếp nhanh
    const addTile = screen.getByRole('button', { name: '+ Thêm' });
    const droppedFile = new File(['photo'], 'drag-upload.png', { type: 'image/png' });
    const fileDt = {
      types: ['Files'],
      files: [droppedFile] as unknown as FileList,
      setData: () => {},
      getData: () => '',
    };
    await act(async () => {
      fireEvent.dragOver(addTile, { dataTransfer: fileDt });
      fireEvent.drop(addTile, { dataTransfer: fileDt });
    });

    expect(await screen.findByRole('heading', { name: 'Hình ảnh (4)' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu bộ ảnh' }));
    await screen.findByText(/Đã lưu bộ ảnh sản phẩm/);

    const putReqs = api.requests.filter((r) => r.method === 'PUT' && r.path === imagesApiPath);
    const body = putReqs[0]?.body as { items: { id: string; key?: string }[] };
    expect(body.items).toHaveLength(4);
    expect(body.items[0]?.id).toBe(productWithImages.images[2]!.id);
    expect(body.items[3]?.key).toMatch(/^freya\/products\//);
  });
});
