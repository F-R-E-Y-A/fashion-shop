import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queryClient } from '@/core';

import { adminCatalogKeys } from './admin-catalog.api.js';
import { actorA, backend, deferred, mountCatalog, product, reply } from './catalog-test-support.js';

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

const detailPath = `/admin/products/${product.id}`;

describe('Quản trị Biến thể & Giá (Đợt 2 Frontend)', () => {
  it('1. Hiển thị danh sách biến thể đầy đủ thông tin và nút Thao tác', async () => {
    backend();
    mountCatalog(detailPath);

    expect(await screen.findByRole('heading', { name: /Biến thể/i })).toBeDefined();
    expect(screen.getByRole('button', { name: '+ Thêm biến thể' })).toBeDefined();

    // Dòng biến thể hiện có
    const row = screen.getByText(product.variants[0]!.sku).closest('tr');
    expect(row).toBeDefined();
    expect(within(row!).getByText(/Đen \/ M/i)).toBeDefined();
    expect(within(row!).getByRole('button', { name: 'Sửa giá & trạng thái' })).toBeDefined();
  });

  it('2. Thêm biến thể mới thành công với UUID v4 do client sinh', async () => {
    const api = backend();
    mountCatalog(detailPath);

    // Bấm nút thêm biến thể
    fireEvent.click(await screen.findByRole('button', { name: '+ Thêm biến thể' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeDefined();

    // Điền form
    fireEvent.change(within(dialog).getByLabelText('Màu sắc'), { target: { value: 'col-1' } });
    fireEvent.change(within(dialog).getByLabelText('Kích cỡ'), { target: { value: 'sz-3' } });
    fireEvent.change(within(dialog).getByLabelText('Mã SKU'), {
      target: { value: 'NEW-SKU-COTTON-L' },
    });
    fireEvent.change(within(dialog).getByLabelText('Giá niêm yết'), {
      target: { value: '350000' },
    });
    fireEvent.change(within(dialog).getByLabelText('Giá giảm'), { target: { value: '250000' } });

    // Bấm tạo
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo biến thể' }));

    await waitFor(() => {
      const postReq = api.requests.find((r) => r.method === 'POST' && r.path.includes('/variants'));
      expect(postReq).toBeDefined();
      const body = postReq?.body as {
        id: string;
        sku: string;
        listPrice: string;
        salePrice: string;
      };
      expect(body.sku).toBe('NEW-SKU-COTTON-L');
      expect(body.listPrice).toBe('350000');
      expect(body.salePrice).toBe('250000');
      expect(body.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    expect(await screen.findByText(/Đã thêm biến thể mới/i)).toBeDefined();
  });

  it('3. Thêm biến thể thất bại khi trùng SKU (409 SKU_EXISTS)', async () => {
    backend();
    mountCatalog(detailPath);

    fireEvent.click(await screen.findByRole('button', { name: '+ Thêm biến thể' }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText('Màu sắc'), { target: { value: 'col-1' } });
    fireEvent.change(within(dialog).getByLabelText('Kích cỡ'), { target: { value: 'sz-1' } });
    // Trùng SKU của biến thể v1 hiện có
    fireEvent.change(within(dialog).getByLabelText('Mã SKU'), {
      target: { value: product.variants[0]!.sku },
    });
    fireEvent.change(within(dialog).getByLabelText('Giá niêm yết'), {
      target: { value: '299000' },
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo biến thể' }));

    expect(await screen.findByText(/Mã SKU này đã tồn tại trong hệ thống/i)).toBeDefined();
  });

  it('4. Sửa giá biến thể thành công gửi CAS token expectedUpdatedAt', async () => {
    const api = backend();
    mountCatalog(detailPath);

    const row = (await screen.findByText(product.variants[0]!.sku)).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Sửa giá & trạng thái' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeDefined();

    // Sửa giá niêm yết và giá giảm
    fireEvent.change(within(dialog).getByLabelText('Giá niêm yết'), {
      target: { value: '450000' },
    });
    fireEvent.change(within(dialog).getByLabelText('Giá giảm'), { target: { value: '320000' } });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => {
      const patchReq = api.requests.find(
        (r) => r.method === 'PATCH' && r.path.includes('/variants/v1'),
      );
      expect(patchReq).toBeDefined();
      const body = patchReq?.body as {
        listPrice: string;
        salePrice: string;
        expectedUpdatedAt: string;
      };
      expect(body.listPrice).toBe('450000');
      expect(body.salePrice).toBe('320000');
      expect(body.expectedUpdatedAt).toBe(product.variants[0]!.updatedAt);
    });

    expect(await screen.findByText(/Đã cập nhật biến thể/i)).toBeDefined();
  });

  it('5. Sửa giá thất bại CAS (409 CONCURRENT_MODIFICATION)', async () => {
    const api = backend();
    api.state.override = (r) =>
      r.method === 'PATCH' && r.path.includes('/variants')
        ? reply(
            {
              statusCode: 409,
              code: 'CONCURRENT_MODIFICATION',
              message:
                'Biến thể đã được thay đổi trên máy chủ bởi người dùng khác. Vui lòng tải lại.',
            },
            409,
          )
        : undefined;

    mountCatalog(detailPath);

    const row = (await screen.findByText(product.variants[0]!.sku)).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Sửa giá & trạng thái' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Giá niêm yết'), {
      target: { value: '499000' },
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));

    expect(
      await screen.findByText(/Biến thể đã được thay đổi trên máy chủ bởi người dùng khác/i),
    ).toBeDefined();
  });

  it('6. Chặn tắt biến thể cuối cùng khi sản phẩm đang mở bán', async () => {
    const api = backend();
    // Sản phẩm đang mở bán và chỉ có đúng 1 biến thể active
    api.state.products = [
      {
        ...product,
        isActive: true,
        adminDisabled: false,
        variants: [
          {
            ...product.variants[0]!,
            isActive: true,
          },
        ],
      },
    ];

    mountCatalog(detailPath);

    const row = (await screen.findByText(product.variants[0]!.sku)).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Sửa giá & trạng thái' }));

    const dialog = await screen.findByRole('dialog');
    // Chọn tắt biến thể
    fireEvent.change(within(dialog).getByLabelText('Trạng thái mở bán'), {
      target: { value: 'false' },
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));

    // Bị chặn ngay tại client validation
    expect(
      await screen.findByText(
        /Không thể tắt biến thể hoạt động cuối cùng khi sản phẩm đang mở bán. Vui lòng ngừng bán sản phẩm trước./i,
      ),
    ).toBeDefined();

    // Không gửi PATCH request
    expect(api.requests.some((r) => r.method === 'PATCH' && r.path.includes('/variants'))).toBe(
      false,
    );
  });

  it('7. Giữ uncertain marker qua điều hướng route và đối chiếu thành công', async () => {
    const api = backend();
    const gate = deferred<Response>();
    api.state.override = (r) =>
      r.method === 'POST' && r.path.includes('/variants') ? gate.promise : undefined;

    const view = mountCatalog(detailPath);

    // Mở form tạo
    fireEvent.click(await screen.findByRole('button', { name: '+ Thêm biến thể' }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText('Màu sắc'), { target: { value: 'col-1' } });
    fireEvent.change(within(dialog).getByLabelText('Kích cỡ'), { target: { value: 'sz-2' } });
    fireEvent.change(within(dialog).getByLabelText('Mã SKU'), {
      target: { value: 'UNCERTAIN-SKU-1' },
    });
    fireEvent.change(within(dialog).getByLabelText('Giá niêm yết'), {
      target: { value: '299000' },
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo biến thể' }));

    await waitFor(() => expect(api.requests.some((r) => r.method === 'POST')).toBe(true));

    // Điều hướng sang trang danh sách sản phẩm
    act(() => view.go('/admin/products'));
    await screen.findByRole('link', { name: product.name });

    // Máy chủ hoàn tất lưu trong lúc admin ở trang khác
    const postReq = api.requests.find((r) => r.method === 'POST' && r.path.includes('/variants'))!;
    const postedBody = postReq.body as { id: string; sku: string; listPrice: string };
    api.state.products = [
      {
        ...product,
        variants: [
          ...product.variants,
          {
            id: postedBody.id,
            sku: postedBody.sku,
            color: { code: 'den', name: 'Đen', hex: '#000000' },
            sizeCode: 'M',
            listPrice: postedBody.listPrice,
            salePrice: null,
            isActive: true,
            isCustom: true,
            adminManagedFields: ['listPrice', 'isActive'],
            updatedAt: '2026-11-14T10:00:00.000Z',
          },
        ],
      },
    ];

    // Gate trả lỗi mạng/timeout để kích hoạt trạng thái uncertain
    gate.resolve(reply({ message: 'Network Timeout' }, 504));

    // Quay lại trang chi tiết sản phẩm
    act(() => view.go(detailPath));
    await screen.findByRole('heading', { name: product.name });

    // Nút đối chiếu vẫn tồn tại nhờ uncertain marker được giữ qua route
    const recheckBtn = await screen.findByRole('button', { name: 'Đối chiếu máy chủ (Tạo)' });
    expect(recheckBtn).toBeDefined();

    // Bấm đối chiếu
    api.state.override = undefined;
    fireEvent.click(recheckBtn);

    // Xác nhận đã đối chiếu thành công và giải phóng marker
    expect(await screen.findByText(/đã được tạo thành công trên máy chủ/i)).toBeDefined();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Đối chiếu máy chủ (Tạo)' })).toBeNull();
    });
  });

  describe('Regression review-127 (R1 - R9)', () => {
    const payload = {
      id: '00000000-0000-4000-8000-000000000127',
      colorId: 'col-1',
      sizeId: 'sz-2',
      sku: 'REVIEW-127',
      listPrice: '299000',
      salePrice: null,
      isActive: true,
    };

    async function loaded() {
      const api = backend();
      const view = mountCatalog(detailPath);
      await screen.findByRole('heading', { name: product.name });
      return { api, view };
    }

    function setCreate(view: ReturnType<typeof mountCatalog>) {
      const key = adminCatalogKeys.uncertainVariantCreate(
        actorA.id,
        view.auth().getSessionEpoch(),
        product.id,
      );
      act(() => {
        view.client.setQueryData(key, {
          operationId: 127,
          productId: product.id,
          id: payload.id,
          payload,
          status: 'uncertain',
        });
      });
      return key;
    }

    function setUpdate(view: ReturnType<typeof mountCatalog>) {
      const key = adminCatalogKeys.uncertainVariantUpdate(
        actorA.id,
        view.auth().getSessionEpoch(),
        product.id,
        'v1',
      );
      act(() => {
        view.client.setQueryData(key, {
          operationId: 128,
          productId: product.id,
          variantId: 'v1',
          payload: {
            listPrice: '299000',
            salePrice: null,
            isActive: false,
            expectedUpdatedAt: product.variants[0]!.updatedAt,
          },
          status: 'uncertain',
        });
      });
      return key;
    }

    async function openEdit() {
      const row = screen.getByText(product.variants[0]!.sku).closest('tr')!;
      fireEvent.click(within(row).getByRole('button', { name: 'Sửa giá & trạng thái' }));
      return screen.findByRole('dialog');
    }

    it('R1 POST recheck must retain marker when color, size, active and null sale do not match', async () => {
      const { api, view } = await loaded();
      const key = setCreate(view);
      api.state.products = [
        {
          ...product,
          variants: [
            ...product.variants,
            {
              ...product.variants[0]!,
              id: payload.id,
              sku: payload.sku,
              listPrice: payload.listPrice,
              salePrice: '100000',
              isActive: false,
              color: { code: 'WRONG', name: 'Wrong', hex: null },
              sizeCode: 'WRONG',
            },
          ],
        },
      ];
      fireEvent.click(await screen.findByRole('button', { name: 'Đối chiếu máy chủ (Tạo)' }));
      await screen.findByText(/Không thể xác nhận đầy đủ thông tin biến thể từ máy chủ/);
      expect(view.client.getQueryData(key)).not.toBeNull();
    });

    it('R2 PATCH recheck must not accept a remaining sale when requested sale=null', async () => {
      const { api, view } = await loaded();
      await openEdit();
      const key = setUpdate(view);
      api.state.products = [
        {
          ...product,
          variants: [
            {
              ...product.variants[0]!,
              listPrice: '299000',
              salePrice: '100000',
              updatedAt: '2026-11-14T10:00:00.000Z',
            },
          ],
        },
      ];
      fireEvent.click(await screen.findByRole('button', { name: 'Đối chiếu máy chủ (Sửa)' }));
      await screen.findByText(/Máy chủ chưa cập nhật/);
      expect(view.client.getQueryData(key)).toBeNull();
    });

    it('R3 uncertain create must lock creation of a different operation', async () => {
      const { view } = await loaded();
      setCreate(view);
      await screen.findByRole('button', { name: 'Đối chiếu máy chủ (Tạo)' });
      expect(screen.getByRole('button', { name: '+ Thêm biến thể' })).toBeDisabled();
    });

    it('R4 uncertain PATCH must remain discoverable after route remount', async () => {
      const { view } = await loaded();
      await openEdit();
      setUpdate(view);
      await screen.findByRole('button', { name: 'Đối chiếu máy chủ (Sửa)' });
      act(() => view.go('/admin/products'));
      await screen.findByRole('link', { name: product.name });
      act(() => view.go(detailPath));
      await screen.findByRole('heading', { name: product.name });
      expect(screen.queryByRole('button', { name: 'Đối chiếu máy chủ (Sửa)' })).not.toBeNull();
    });

    it('R5 production query defaults must preserve uncertain variants across GC', () => {
      const key = adminCatalogKeys.uncertainVariantCreate(actorA.id, 1, product.id);
      const query = queryClient.getQueryCache().build(queryClient, { queryKey: key });
      expect(query.gcTime).toBe(Infinity);
      queryClient.removeQueries({ queryKey: key });
    });

    it('R6 mutation signal must abort when its route unmounts', async () => {
      const { api, view } = await loaded();
      const gate = deferred<Response>();
      api.state.override = (r) =>
        r.method === 'POST' && r.path.includes('/variants') ? gate.promise : undefined;
      fireEvent.click(screen.getByRole('button', { name: '+ Thêm biến thể' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText('Màu sắc'), { target: { value: 'col-1' } });
      fireEvent.change(within(dialog).getByLabelText('Kích cỡ'), { target: { value: 'sz-2' } });
      fireEvent.change(within(dialog).getByLabelText('Mã SKU'), {
        target: { value: 'REVIEW-SIGNAL' },
      });
      fireEvent.change(within(dialog).getByLabelText('Giá niêm yết'), {
        target: { value: '299000' },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo biến thể' }));
      await waitFor(() => expect(api.requests.some((r) => r.method === 'POST')).toBe(true));
      const req = api.requests.find((r) => r.method === 'POST' && r.path.includes('/variants'))!;
      act(() => view.go('/admin/products'));
      await screen.findByRole('link', { name: product.name });
      const aborted = req.signal?.aborted;
      await act(async () => gate.resolve(reply({}, 504)));
      expect(aborted).toBe(true);
    });

    it('R7 recheck 403 must revoke admin access and purge detail cache', async () => {
      const { api, view } = await loaded();
      setCreate(view);
      api.state.override = (r) =>
        r.path === `/api/admin/products/${product.id}`
          ? reply({ statusCode: 403, code: 'FORBIDDEN', message: 'Forbidden' }, 403)
          : undefined;
      fireEvent.click(await screen.findByRole('button', { name: 'Đối chiếu máy chủ (Tạo)' }));
      await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' });
      expect(
        view.client.getQueryData(adminCatalogKeys.detail(actorA.id, product.id)),
      ).toBeUndefined();
    });

    it('R8 recheck when GET is unchanged must retry exactly the original POST', async () => {
      const { api, view } = await loaded();
      setCreate(view);
      fireEvent.click(await screen.findByRole('button', { name: 'Đối chiếu máy chủ (Tạo)' }));
      await screen.findByText(/Đã thêm biến thể mới/);
      expect(
        api.requests.filter((r) => r.method === 'POST' && r.path.includes('/variants')),
      ).toHaveLength(1);
    });

    it('R9 conflict must lock stale PATCH until an explicit reload', async () => {
      const { api } = await loaded();
      api.state.override = (r) =>
        r.method === 'PATCH' && r.path.includes('/variants')
          ? reply({ statusCode: 409, code: 'CONCURRENT_MODIFICATION', message: 'Conflict' }, 409)
          : undefined;
      const dialog = await openEdit();
      fireEvent.change(within(dialog).getByLabelText('Giá niêm yết'), {
        target: { value: '299000' },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
      await screen.findByText(/Biến thể đã được thay đổi trên máy chủ/);
      expect(within(dialog).getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled();
    });

    it('C1: open create modal cannot overwrite uncertain request with edited payload', async () => {
      const { api } = await loaded();
      const gate = deferred<Response>();
      api.state.override = (r) =>
        r.method === 'POST' && r.path.includes('/variants') ? gate.promise : undefined;

      fireEvent.click(await screen.findByRole('button', { name: '+ Thêm biến thể' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText('Màu sắc'), { target: { value: 'col-1' } });
      fireEvent.change(within(dialog).getByLabelText('Kích cỡ'), { target: { value: 'sz-1' } });
      fireEvent.change(within(dialog).getByLabelText('Mã SKU'), { target: { value: 'SKU-C1-A' } });
      fireEvent.change(within(dialog).getByLabelText('Giá niêm yết'), {
        target: { value: '299000' },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo biến thể' }));
      await waitFor(() => expect(api.requests.some((r) => r.method === 'POST')).toBe(true));

      await act(async () => gate.resolve(reply({}, 504)));
      await screen.findByRole('button', { name: 'Đối chiếu máy chủ (Tạo)' });

      fireEvent.change(within(dialog).getByLabelText('Mã SKU'), { target: { value: 'SKU-C1-B' } });
      const confirmBtn = within(dialog).getByRole('button', { name: 'Tạo biến thể' });
      expect(confirmBtn).toBeDisabled();
      fireEvent.click(confirmBtn);
      expect(
        api.requests.filter((r) => r.method === 'POST' && r.path.includes('/variants')),
      ).toHaveLength(1);
    });

    it('C2: uncertain PATCH must disable EditVariantButton', async () => {
      const { view } = await loaded();
      setUpdate(view);
      const row = screen.getByText(product.variants[0]!.sku).closest('tr')!;
      expect(within(row).getByRole('button', { name: 'Sửa giá & trạng thái' })).toBeDisabled();
    });

    it('C3: recheckUpdate retries old CAS PATCH when GET is unchanged', async () => {
      const { api, view } = await loaded();
      setUpdate(view);
      fireEvent.click(await screen.findByRole('button', { name: 'Đối chiếu máy chủ (Sửa)' }));
      await waitFor(() =>
        expect(
          api.requests.filter((r) => r.method === 'PATCH' && r.path.includes('/variants')),
        ).toHaveLength(1),
      );
      await screen.findByText(/Đã cập nhật biến thể/);
    });

    it('C4: recheckUpdate clears marker and marks conflict when GET has newer updatedAt with different payload', async () => {
      const { api, view } = await loaded();
      const key = setUpdate(view);
      api.state.products = [
        {
          ...product,
          variants: [
            {
              ...product.variants[0]!,
              listPrice: '999000',
              updatedAt: '2026-11-14T10:00:00.000Z',
            },
          ],
        },
      ];
      fireEvent.click(await screen.findByRole('button', { name: 'Đối chiếu máy chủ (Sửa)' }));
      await screen.findByText(/phiên bản mới hơn/);
      expect(view.client.getQueryData(key)).toBeNull();
    });

    it('C5: recheckCreate retry POST 403 revokes admin access and purges caches', async () => {
      const { api, view } = await loaded();
      setCreate(view);
      api.state.override = (r) =>
        r.method === 'POST' && r.path.includes('/variants')
          ? reply({ statusCode: 403, code: 'FORBIDDEN', message: 'Forbidden' }, 403)
          : undefined;
      fireEvent.click(await screen.findByRole('button', { name: 'Đối chiếu máy chủ (Tạo)' }));
      await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' });
      expect(
        view.client.getQueryData(adminCatalogKeys.detail(actorA.id, product.id)),
      ).toBeUndefined();
    });

    it('C6: recheckCreate retry POST success clears uncertain marker', async () => {
      const { api, view } = await loaded();
      const key = setCreate(view);
      fireEvent.click(await screen.findByRole('button', { name: 'Đối chiếu máy chủ (Tạo)' }));
      await waitFor(() =>
        expect(
          api.requests.filter((r) => r.method === 'POST' && r.path.includes('/variants')),
        ).toHaveLength(1),
      );
      await screen.findByText(/Đã thêm biến thể mới/);
      expect(view.client.getQueryData(key)).toBeNull();
    });

    it('C7: recheckCreate does not confirm match when variant-options are missing and colorId/sizeId are absent', async () => {
      const { api, view } = await loaded();
      const key = setCreate(view);
      api.state.override = (r) =>
        r.path.includes('/variant-options')
          ? reply({ statusCode: 500, message: 'err' }, 500)
          : undefined;
      await act(async () => {
        view.client.removeQueries({ queryKey: adminCatalogKeys.variantOptions(actorA.id) });
      });
      api.state.products = [
        {
          ...product,
          variants: [
            ...product.variants,
            {
              ...product.variants[0]!,
              id: payload.id,
              sku: payload.sku,
              listPrice: payload.listPrice,
              salePrice: null,
              isActive: true,
              color: { code: 'WRONG', name: 'Wrong', hex: null },
              sizeCode: 'WRONG',
            },
          ],
        },
      ];
      fireEvent.click(await screen.findByRole('button', { name: 'Đối chiếu máy chủ (Tạo)' }));
      await screen.findByText(/Không thể xác nhận đầy đủ thông tin biến thể từ máy chủ/);
      expect(view.client.getQueryData(key)).not.toBeNull();
    });

    it('C8: recheckCreate normalizes Decimal strings (299000.00 vs 299000) before comparing', async () => {
      const { api, view } = await loaded();
      const key = setCreate(view);
      api.state.products = [
        {
          ...product,
          variants: [
            ...product.variants,
            {
              ...product.variants[0]!,
              id: payload.id,
              sku: payload.sku,
              listPrice: '299000.00',
              salePrice: null,
              isActive: true,
              color: { code: 'den', name: 'Đen', hex: '#000000' },
              sizeCode: 'M',
            },
          ],
        },
      ];
      fireEvent.click(await screen.findByRole('button', { name: 'Đối chiếu máy chủ (Tạo)' }));
      await screen.findByText(/đã được tạo thành công trên máy chủ/);
      expect(view.client.getQueryData(key)).toBeNull();
    });

    it('C9: frontend allows valid 2-decimal price inputs (299000.50)', async () => {
      const { api } = await loaded();
      const dialog = await openEdit();
      fireEvent.change(within(dialog).getByLabelText('Giá niêm yết'), {
        target: { value: '299000.50' },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
      await waitFor(() =>
        expect(api.requests.some((r) => r.method === 'PATCH' && r.path.includes('/variants'))).toBe(
          true,
        ),
      );
    });

    it('C10: recheckCreate retry POST aborts on route unmount', async () => {
      const { api, view } = await loaded();
      setCreate(view);
      const gate = deferred<Response>();
      api.state.override = (r) =>
        r.method === 'POST' && r.path.includes('/variants') ? gate.promise : undefined;

      fireEvent.click(await screen.findByRole('button', { name: 'Đối chiếu máy chủ (Tạo)' }));
      await waitFor(() =>
        expect(api.requests.some((r) => r.method === 'POST' && r.path.includes('/variants'))).toBe(
          true,
        ),
      );
      const req = api.requests.find((r) => r.method === 'POST' && r.path.includes('/variants'))!;

      act(() => view.go('/admin/products'));
      await screen.findByRole('link', { name: product.name });
      const aborted = req.signal?.aborted;
      await act(async () => gate.resolve(reply({}, 504)));
      expect(aborted).toBe(true);
    });

    it('D1: recheck GET must abort after its deadline rather than remain pending forever', async () => {
      const { api, view } = await loaded();
      setCreate(view);
      await screen.findByRole('button', { name: 'Đối chiếu máy chủ (Tạo)' });
      const gate = deferred<Response>();
      api.state.override = (r) =>
        r.path === `/api/admin/products/${product.id}` ? gate.promise : undefined;

      const start = api.requests.length;
      vi.useFakeTimers();
      fireEvent.click(screen.getByRole('button', { name: 'Đối chiếu máy chủ (Tạo)' }));
      await act(async () => {});

      const req = api.requests
        .slice(start)
        .find((r) => r.path === `/api/admin/products/${product.id}`)!;
      expect(req).toBeDefined();

      await act(async () => vi.advanceTimersByTimeAsync(16000));
      const aborted = req.signal?.aborted;
      await act(async () =>
        gate.resolve(
          reply({
            ...product,
            variants: [
              {
                ...product.variants[0]!,
                id: payload.id,
                sku: payload.sku,
                listPrice: payload.listPrice,
                isActive: true,
                colorId: payload.colorId,
                sizeId: payload.sizeId,
              },
            ],
          }),
        ),
      );
      vi.useRealTimers();
      expect(aborted).toBe(true);
    });

    it('D2: old recheck must not close another variant dirty dialog', async () => {
      const { api, view } = await loaded();
      const variant2 = { ...product.variants[0]!, id: 'v2', sku: 'SECOND-VARIANT' };
      api.state.products = [{ ...product, variants: [...product.variants, variant2] }];
      await act(async () =>
        view.client.invalidateQueries({ queryKey: adminCatalogKeys.detail(actorA.id, product.id) }),
      );
      await screen.findByText('SECOND-VARIANT');

      setUpdate(view);
      const button = await screen.findByRole('button', { name: 'Đối chiếu máy chủ (Sửa)' });
      const gate = deferred<Response>();
      api.state.override = (r) =>
        r.path === `/api/admin/products/${product.id}` ? gate.promise : undefined;

      fireEvent.click(button);
      await act(async () => {});

      fireEvent.click(
        within(screen.getByText('SECOND-VARIANT').closest('tr')!).getByRole('button', {
          name: 'Sửa giá & trạng thái',
        }),
      );
      const d = await screen.findByRole('dialog');
      fireEvent.change(within(d).getByLabelText('Giá niêm yết'), { target: { value: '399000' } });

      await act(async () =>
        gate.resolve(
          reply({
            ...product,
            variants: [
              {
                ...product.variants[0]!,
                listPrice: '299000',
                updatedAt: '2026-11-14T10:00:00.000Z',
              },
              variant2,
            ],
          }),
        ),
      );

      expect(screen.queryByRole('dialog')).not.toBeNull();
      expect(screen.getByLabelText('Giá niêm yết')).toHaveValue('399000');
    });

    it('D3: GET 429 is not evidence that the original uncertain POST was rejected', async () => {
      const { api, view } = await loaded();
      const key = setCreate(view);
      api.state.override = (r) =>
        r.path === `/api/admin/products/${product.id}`
          ? reply({ statusCode: 429, code: 'TOO_MANY_REQUESTS', message: 'Too many requests' }, 429)
          : undefined;

      fireEvent.click(await screen.findByRole('button', { name: 'Đối chiếu máy chủ (Tạo)' }));
      await waitFor(() => expect(screen.queryByText('Đang kiểm tra…')).toBeNull());
      await act(async () => {});
      expect(view.client.getQueryData(key)).not.toBeNull();
    });

    it('D4: frontend allows salePrice equal to listPrice and normalizes it to null', async () => {
      const { api } = await loaded();
      fireEvent.click(
        within(screen.getByText(product.variants[0]!.sku).closest('tr')!).getByRole('button', {
          name: 'Sửa giá & trạng thái',
        }),
      );
      const d = await screen.findByRole('dialog');
      fireEvent.change(within(d).getByLabelText('Giá giảm'), {
        target: { value: product.variants[0]!.listPrice },
      });
      fireEvent.click(within(d).getByRole('button', { name: 'Lưu thay đổi' }));
      await waitFor(() =>
        expect(
          api.requests.filter((r) => r.method === 'PATCH' && r.path.includes('/variants')),
        ).toHaveLength(1),
      );
      const patchReq = api.requests.find(
        (r) => r.method === 'PATCH' && r.path.includes('/variants'),
      );
      expect((patchReq?.body as { salePrice: string | null }).salePrice).toBeNull();
    });

    it('E1: recheck deadline must abort an existing in-flight detail GET, exit checking, and keep uncertain marker', async () => {
      const { api, view } = await loaded();
      const key = setCreate(view);
      await screen.findByRole('button', { name: 'Đối chiếu máy chủ (Tạo)' });
      const gate = deferred<Response>();
      api.state.override = (r) =>
        r.path === `/api/admin/products/${product.id}` ? gate.promise : undefined;

      const start = api.requests.length;
      let background: Promise<unknown>;
      act(() => {
        background = view.client.refetchQueries({
          queryKey: adminCatalogKeys.detail(actorA.id, product.id),
        });
      });
      await waitFor(() =>
        expect(
          api.requests.slice(start).some((r) => r.path === `/api/admin/products/${product.id}`),
        ).toBe(true),
      );
      const req = api.requests
        .slice(start)
        .find((r) => r.path === `/api/admin/products/${product.id}`)!;

      vi.useFakeTimers();
      fireEvent.click(screen.getByRole('button', { name: 'Đối chiếu máy chủ (Tạo)' }));
      await act(async () => {});

      await act(async () => vi.advanceTimersByTimeAsync(16000));
      const aborted = req.signal?.aborted;
      const checking = screen.queryByText('Đang kiểm tra…') !== null;

      await act(async () =>
        gate.resolve(
          reply({
            ...product,
            variants: [
              {
                ...product.variants[0]!,
                id: payload.id,
                sku: payload.sku,
                listPrice: payload.listPrice,
                isActive: true,
                colorId: payload.colorId,
                sizeId: payload.sizeId,
              },
            ],
          }),
        ),
      );
      await background!;
      vi.useRealTimers();

      expect({ aborted, checking }).toEqual({ aborted: true, checking: false });
      expect(view.client.getQueryData(key)).not.toBeNull();
    });

    it('E2: revoking access (403) must abort the in-flight recheck GET socket, exit checking, and keep uncertain marker', async () => {
      const { api, view } = await loaded();
      const key = setCreate(view);
      await screen.findByRole('button', { name: 'Đối chiếu máy chủ (Tạo)' });
      const gate = deferred<Response>();
      api.state.override = (r) =>
        r.path === `/api/admin/products/${product.id}` ? gate.promise : undefined;

      const start = api.requests.length;
      fireEvent.click(screen.getByRole('button', { name: 'Đối chiếu máy chủ (Tạo)' }));
      await waitFor(() =>
        expect(
          api.requests.slice(start).some((r) => r.path === `/api/admin/products/${product.id}`),
        ).toBe(true),
      );
      const req = api.requests
        .slice(start)
        .find((r) => r.path === `/api/admin/products/${product.id}`)!;

      api.state.override = (r) =>
        r.path === `/api/admin/products/${product.id}`
          ? gate.promise
          : r.path === '/api/admin/products/variant-options'
            ? reply({ statusCode: 403, code: 'FORBIDDEN', message: 'Forbidden' }, 403)
            : undefined;

      await act(async () =>
        view.client.refetchQueries({ queryKey: adminCatalogKeys.variantOptions(actorA.id) }),
      );
      await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' });

      const aborted = req.signal?.aborted;
      await act(async () => gate.resolve(reply(product)));
      expect(aborted).toBe(true);
      expect(screen.queryByText('Đang kiểm tra…')).toBeNull();
      expect(
        view.client.getQueryData(adminCatalogKeys.detail(actorA.id, product.id)),
      ).toBeUndefined();
      expect(view.client.getQueryData(key)).not.toBeNull();
    });

    it('F1: older recheck GET must not overwrite a newer committed variant cache', async () => {
      const api = backend();
      const view = mountCatalog(`/admin/products/${product.id}`);
      await screen.findByRole('heading', { name: product.name });

      const variant2 = { ...product.variants[0]!, id: 'v2', sku: 'SECOND-VARIANT' };
      api.state.products = [
        {
          ...product,
          variants: [
            { ...product.variants[0]!, listPrice: '299000', updatedAt: '2026-11-14T10:00:00.000Z' },
            variant2,
          ],
        },
      ];
      await act(async () =>
        view.client.invalidateQueries({ queryKey: adminCatalogKeys.detail(actorA.id, product.id) }),
      );
      await screen.findByText('SECOND-VARIANT');

      const olderResponse = structuredClone(api.state.products[0]);
      const key = adminCatalogKeys.uncertainVariantUpdate(
        actorA.id,
        view.auth().getSessionEpoch(),
        product.id,
        'v1',
      );
      act(() => {
        view.client.setQueryData(key, {
          operationId: 128,
          productId: product.id,
          variantId: 'v1',
          payload: {
            listPrice: '299000',
            salePrice: null,
            isActive: false,
            expectedUpdatedAt: product.variants[0]!.updatedAt,
          },
          status: 'uncertain',
        });
      });

      const gate = deferred<Response>();
      let detailCalls = 0;
      api.state.override = (r) =>
        r.path === `/api/admin/products/${product.id}` && detailCalls++ === 0
          ? gate.promise
          : undefined;

      fireEvent.click(await screen.findByRole('button', { name: 'Đối chiếu máy chủ (Sửa)' }));
      await act(async () => {});

      fireEvent.click(
        within(screen.getByText('SECOND-VARIANT').closest('tr')!).getByRole('button', {
          name: 'Sửa giá & trạng thái',
        }),
      );
      const d = await screen.findByRole('dialog');
      fireEvent.change(within(d).getByLabelText('Giá niêm yết'), { target: { value: '399000' } });
      fireEvent.click(within(d).getByRole('button', { name: 'Lưu thay đổi' }));

      const detailKey = adminCatalogKeys.detail(actorA.id, product.id);
      const cachedPrice = () =>
        view.client.getQueryData<typeof product>(detailKey)?.variants.find((v) => v.id === 'v2')
          ?.listPrice;

      await waitFor(() => expect(cachedPrice()).toBe('399000'));
      await act(async () => gate.resolve(reply(olderResponse)));
      expect(cachedPrice()).toBe('399000');
    });
  });
});
