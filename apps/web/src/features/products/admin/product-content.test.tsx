import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sessionQueryKeys } from '@/core';

import { adminCatalogKeys } from './admin-catalog.api.js';
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

const detailPath = `/admin/products/${product.id}`;
const contentPath = `/api/admin/products/${product.id}/content`;
const detailApi = `/api/admin/products/${product.id}`;

async function openEditDialog() {
  const button = await screen.findByRole('button', { name: 'Sửa nội dung' });
  fireEvent.click(button);
  return screen.findByRole('dialog');
}

function confirmSave(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu nội dung' }));
}

describe('UC-04.2 sua noi dung san pham quan tri', () => {
  it('UC-04.2/AC24 modal snapshot, dem ky tu, huy khong PATCH, luu chuan hoa trim va null, giu query va focus', async () => {
    const api = backend();
    mountCatalog(`${detailPath}?q=linen&sort=name_asc&page=2`);

    const dialog = await openEditDialog();
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Hủy' })).toHaveFocus();
    expect(within(dialog).getByText('Sửa nội dung sản phẩm')).toBeInTheDocument();

    const nameInput = within(dialog).getByDisplayValue('Áo khoác linen');
    expect(nameInput).toBeInTheDocument();
    expect(within(dialog).getByText('14/200')).toBeInTheDocument();

    const descInput = within(dialog).getByDisplayValue('Mô tả sản phẩm');
    expect(descInput).toBeInTheDocument();
    expect(within(dialog).getByText('14/20000')).toBeInTheDocument();

    // GET nền khi đang mở modal không ghi đè bản đang gõ
    fireEvent.change(nameInput, { target: { value: 'Đang gõ dở' } });
    api.state.products = [{ ...product, name: 'Tên nền khác' }];
    expect(within(dialog).getByDisplayValue('Đang gõ dở')).toBeInTheDocument();
    api.state.products = [product];

    // Hủy đóng modal -> không gọi PATCH, giữ nguyên query điều hướng về danh sách
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.requests.filter((r) => r.method === 'PATCH')).toHaveLength(0);
    expect(screen.getByRole('link', { name: /Về danh sách sản phẩm/ })).toHaveAttribute(
      'href',
      '/admin/products?q=linen&sort=name_asc&page=2',
    );

    // Mở lại, sửa 4 trường
    const dialog2 = await openEditDialog();
    fireEvent.change(within(dialog2).getByDisplayValue('Áo khoác linen'), {
      target: { value: '  Áo khoác linen cao cấp  ' },
    });
    fireEvent.change(within(dialog2).getByDisplayValue('Mô tả sản phẩm'), {
      target: { value: '   ' },
    });
    fireEvent.change(within(dialog2).getByLabelText(/Chất liệu/), {
      target: { value: '  100% Linen tự nhiên  ' },
    });
    fireEvent.change(within(dialog2).getByLabelText(/Hướng dẫn bảo quản/), {
      target: { value: '  Giặt tay nhẹ  ' },
    });

    confirmSave(dialog2);

    await screen.findByText(/Đã lưu thay đổi nội dung sản phẩm/);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const patchRequests = api.requests.filter(
      (r) => r.path === contentPath && r.method === 'PATCH',
    );
    expect(patchRequests).toHaveLength(1);
    expect(patchRequests[0]?.body).toEqual({
      name: 'Áo khoác linen cao cấp',
      description: null,
      material: '100% Linen tự nhiên',
      careInstructions: 'Giặt tay nhẹ',
      expectedVersion: 0,
    });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Áo khoác linen cao cấp' }),
    ).toBeInTheDocument();
    expect(screen.getByText('100% Linen tự nhiên')).toBeInTheDocument();
    expect(screen.getByText('Giặt tay nhẹ')).toBeInTheDocument();
    expect(
      screen.getByText('Tên sản phẩm, Mô tả, Chất liệu, Hướng dẫn bảo quản'),
    ).toBeInTheDocument();
  });

  it('UC-04.2/AC25 validation chan ten rong, Enter khong submit tu dong, chan double-click va pending', async () => {
    const api = backend();
    mountCatalog(detailPath);

    const dialog = await openEditDialog();
    const nameInput = within(dialog).getByDisplayValue('Áo khoác linen');

    fireEvent.change(nameInput, { target: { value: '    ' } });
    confirmSave(dialog);

    expect(
      await within(dialog).findByText('Tên sản phẩm không được để trống.'),
    ).toBeInTheDocument();
    expect(api.requests.filter((r) => r.method === 'PATCH')).toHaveLength(0);

    fireEvent.keyDown(nameInput, { key: 'Enter', code: 'Enter' });
    expect(api.requests.filter((r) => r.method === 'PATCH')).toHaveLength(0);

    fireEvent.change(nameInput, { target: { value: 'Tên hợp lệ' } });

    const gate = deferred<Response>();
    api.state.override = (r) => (r.method === 'PATCH' ? gate.promise : undefined);

    const saveButton = within(dialog).getByRole('button', { name: 'Lưu nội dung' });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.requests.filter((r) => r.method === 'PATCH')).toHaveLength(1);
    });
    expect(within(dialog).getByRole('button', { name: 'Đang lưu…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    expect(await screen.findByText(/Đang xử lý yêu cầu/)).toBeInTheDocument();

    await act(async () => {
      gate.resolve(
        reply({
          ...product,
          name: 'Tên hợp lệ',
          contentVersion: 1,
          adminContentFields: ['name'],
        }),
      );
    });
    await screen.findByText(/Đã lưu thay đổi nội dung sản phẩm/);
  });

  it('UC-04.2/AC25 409 reload cap nhat truong admin khac vua doi va khong ghi de mat du lieu', async () => {
    const api = backend();
    mountCatalog(detailPath);

    const dialog = await openEditDialog();
    fireEvent.change(within(dialog).getByDisplayValue(product.name), {
      target: { value: 'Tên đang soạn' },
    });
    api.state.products = [
      { ...product, contentVersion: 1, description: 'Mô tả mới của admin khác' },
    ];

    confirmSave(dialog);
    await within(dialog).findByText(/Nội dung đã được thay đổi trên máy chủ/);

    // Bấm lưu khi chưa tải lại không gửi thêm PATCH
    confirmSave(dialog);
    expect(api.requests.filter((r) => r.method === 'PATCH')).toHaveLength(1);

    // Tải dữ liệu mới nhất: giữ 'Tên đang soạn' của A và nạp 'Mô tả mới của admin khác' của B
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tải dữ liệu mới nhất' }));
    await waitFor(() =>
      expect(
        within(dialog).queryByText(/Nội dung đã được thay đổi trên máy chủ/),
      ).not.toBeInTheDocument(),
    );
    expect(within(dialog).getByDisplayValue('Tên đang soạn')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('Mô tả mới của admin khác')).toBeInTheDocument();

    confirmSave(dialog);
    await screen.findByText(/Đã lưu thay đổi nội dung sản phẩm/);
    expect(api.state.products[0]?.name).toBe('Tên đang soạn');
    expect(api.state.products[0]?.description).toBe('Mô tả mới của admin khác');
  });

  it('UC-04.2/AC25 thao tac nhap trong luc GET tai ban moi dang cho duoc giu nguyen va khong bi ghi de', async () => {
    const api = backend();
    mountCatalog(detailPath);

    const dialog = await openEditDialog();
    fireEvent.change(within(dialog).getByDisplayValue(product.name), {
      target: { value: 'Tên đang soạn' },
    });
    api.state.products = [
      { ...product, contentVersion: 1, description: 'Mô tả mới của admin khác' },
    ];

    confirmSave(dialog);
    await within(dialog).findByText(/Nội dung đã được thay đổi trên máy chủ/);

    const gate = deferred<Response>();
    api.state.override = (r) =>
      r.method === 'GET' && r.path === `/api/admin/products/${product.id}`
        ? gate.promise
        : undefined;

    const before = api.requests.length;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tải dữ liệu mới nhất' }));
    await waitFor(() => expect(api.requests.length).toBeGreaterThan(before));

    fireEvent.change(within(dialog).getByDisplayValue('Tên đang soạn'), {
      target: { value: 'Tên gõ thêm khi đang tải' },
    });

    await act(async () => {
      gate.resolve(reply(api.state.products[0]));
      api.state.override = undefined;
    });

    await waitFor(() =>
      expect(
        within(dialog).queryByText(/Nội dung đã được thay đổi trên máy chủ/),
      ).not.toBeInTheDocument(),
    );

    expect(within(dialog).getByDisplayValue('Tên gõ thêm khi đang tải')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('Mô tả mới của admin khác')).toBeInTheDocument();

    confirmSave(dialog);
    await screen.findByText(/Đã lưu thay đổi nội dung sản phẩm/);
    expect(api.state.products[0]?.name).toBe('Tên gõ thêm khi đang tải');
    expect(api.state.products[0]?.description).toBe('Mô tả mới của admin khác');
  });

  it.each(['server', 'draft'] as const)(
    'UC-04.2/AC25 409 cung sua mot truong yeu cau chon ban (%s) truoc khi luu',
    async (choice) => {
      const api = backend();
      mountCatalog(detailPath);

      const dialog = await openEditDialog();
      fireEvent.change(within(dialog).getByDisplayValue(product.name), {
        target: { value: 'Tên đang soạn' },
      });
      api.state.products = [
        {
          ...product,
          contentVersion: 1,
          name: 'Tên từ admin khác',
          description: 'Mô tả từ admin khác',
        },
      ];

      confirmSave(dialog);
      await within(dialog).findByText(/Nội dung đã được thay đổi trên máy chủ/);

      fireEvent.click(within(dialog).getByRole('button', { name: 'Tải dữ liệu mới nhất' }));
      await within(dialog).findByText(/Giá trị mới trên máy chủ:/);
      expect(within(dialog).getByDisplayValue('Mô tả từ admin khác')).toBeInTheDocument();

      // Chưa chọn giải quyết xung đột thì bấm Lưu nội dung không gửi PATCH
      confirmSave(dialog);
      expect(api.requests.filter((r) => r.method === 'PATCH')).toHaveLength(1);

      fireEvent.click(
        within(dialog).getByRole('button', {
          name: choice === 'server' ? 'Dùng bản máy chủ' : 'Giữ bản đang soạn',
        }),
      );
      await waitFor(() =>
        expect(within(dialog).queryByText(/Giá trị mới trên máy chủ:/)).not.toBeInTheDocument(),
      );

      confirmSave(dialog);
      await screen.findByText(/Đã lưu thay đổi nội dung sản phẩm/);
      expect(api.state.products[0]?.name).toBe(
        choice === 'server' ? 'Tên từ admin khác' : 'Tên đang soạn',
      );
      expect(api.state.products[0]?.description).toBe('Mô tả từ admin khác');
    },
  );

  it('UC-04.2/AC25 ket qua chua ro qua dieu huong van giu marker va can GET doi chieu', async () => {
    const api = backend();
    const gate = deferred<Response>();
    api.state.override = (r) => (r.method === 'PATCH' ? gate.promise : undefined);

    const view = mountCatalog(detailPath);
    const dialog = await openEditDialog();
    confirmSave(dialog);
    await waitFor(() => expect(api.requests.some((r) => r.method === 'PATCH')).toBe(true));

    // Điều hướng sang danh sách khi PATCH chưa trả lời, sau đó lỗi 500 về rồi quay lại chi tiết
    act(() => view.go('/admin/products'));
    await screen.findByRole('link', { name: product.name });
    await act(async () => gate.resolve(failure(500)));
    act(() => view.go(detailPath));

    expect(
      await screen.findByRole('button', { name: 'Kiểm tra lại nội dung' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sửa nội dung' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại nội dung' }));
    await screen.findByText(/Đã đối chiếu nội dung sản phẩm mới nhất/);
    expect(screen.getByRole('button', { name: 'Sửa nội dung' })).not.toBeDisabled();
  });

  it.each(['network', 'timeout'] as const)(
    'UC-04.2/AC25 %s chi GET doi chieu; GET loi van chan thao tac moi',
    async (kind) => {
      const api = backend();
      api.state.override = (r) => {
        if (r.method !== 'PATCH') return undefined;
        return kind === 'network'
          ? Promise.reject(new TypeError('Synthetic offline'))
          : new Promise<Response>((_resolve, reject) =>
              r.signal?.addEventListener('abort', () => reject(r.signal?.reason), { once: true }),
            );
      };
      mountCatalog(detailPath);
      const dialog = await openEditDialog();
      if (kind === 'timeout') vi.useFakeTimers();
      confirmSave(dialog);
      if (kind === 'timeout') {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(PRODUCT_ACTION_TIMEOUT_MS + 1);
        });
        vi.useRealTimers();
      }
      await screen.findByRole('button', { name: 'Kiểm tra lại nội dung' });
      expect(screen.getByRole('button', { name: 'Sửa nội dung' })).toBeDisabled();

      // GET đối chiếu lỗi vẫn chặn thao tác mới
      api.state.override = (r) => (r.path === detailApi ? failure(500) : undefined);
      fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại nội dung' }));
      await screen.findByText('Chưa đối chiếu được nội dung. Kiểm tra kết nối rồi thử lại.');
      expect(screen.queryByRole('button', { name: 'Sửa nội dung' })).not.toBeInTheDocument();

      // GET đối chiếu thành công mở lại nút Sửa nội dung
      api.state.override = undefined;
      fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại nội dung' }));
      await screen.findByText(/Đã đối chiếu nội dung sản phẩm mới nhất/);
      expect(screen.getByRole('button', { name: 'Sửa nội dung' })).not.toBeDisabled();
      expect(api.requests.filter((r) => r.method === 'PATCH')).toHaveLength(1);
    },
  );

  it.each([400, 404, 409, 422, 500])(
    'UC-04.2/AC25 loi %s khong retry PATCH, unknown can GET doi chieu',
    async (status) => {
      const api = backend();
      api.state.override = (r) => (r.method === 'PATCH' ? failure(status) : undefined);
      mountCatalog(detailPath);
      const dialog = await openEditDialog();
      confirmSave(dialog);
      await screen.findByRole('alert');
      expect(api.requests.filter((r) => r.method === 'PATCH')).toHaveLength(1);
      if (status === 404) {
        expect(screen.getByText('Sản phẩm không còn tồn tại.')).toBeInTheDocument();
      }
      if (status === 500) {
        expect(screen.getByRole('button', { name: 'Sửa nội dung' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại nội dung' }));
        await screen.findByText(/Đã đối chiếu nội dung sản phẩm mới nhất/);
        expect(screen.getByRole('button', { name: 'Sửa nội dung' })).not.toBeDisabled();
      }
    },
  );

  it('UC-04.2/AC26 PATCH403 xoa du lieu va khong gui them', async () => {
    const api = backend();
    api.state.override = (r) => (r.method === 'PATCH' ? failure(403) : undefined);
    const view = mountCatalog(detailPath);
    const dialog = await openEditDialog();
    confirmSave(dialog);
    await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' });
    expect(
      view.client
        .getQueriesData({ queryKey: sessionQueryKeys.admin })
        .every(([, data]) => data === undefined),
    ).toBe(true);
    expect(api.requests.filter((r) => r.method === 'PATCH')).toHaveLength(1);
  });

  it('UC-04.2/AC26 403 tu tai ban moi sau 409 thu hoi quyen admin va xoa cache', async () => {
    const api = backend();
    const view = mountCatalog(detailPath);
    const dialog = await openEditDialog();
    fireEvent.change(within(dialog).getByDisplayValue(product.name), {
      target: { value: 'Tên đang soạn' },
    });
    api.state.products = [
      { ...product, contentVersion: 1, description: 'Mô tả mới của admin khác' },
    ];
    confirmSave(dialog);
    await within(dialog).findByText(/Nội dung đã được thay đổi trên máy chủ/);

    api.state.override = (r) =>
      r.method === 'GET' && r.path === detailApi ? failure(403) : undefined;
    const prior = api.requests.length;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tải dữ liệu mới nhất' }));
    await waitFor(() => expect(api.requests.length).toBeGreaterThan(prior));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Sửa nội dung' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { name: 'Không đủ quyền truy cập' })).toBeInTheDocument();
    expect(
      view.client
        .getQueriesData({ queryKey: sessionQueryKeys.admin })
        .every(([, data]) => data === undefined),
    ).toBe(true);
  });

  it('UC-04.2/AC26 GET reload/recheck truyen AbortSignal, response muon sau dong/403 khong ghi de', async () => {
    const api = backend();
    const view = mountCatalog(detailPath);
    const dialog = await openEditDialog();
    fireEvent.change(within(dialog).getByDisplayValue(product.name), {
      target: { value: 'Tên đang soạn' },
    });
    api.state.products = [{ ...product, contentVersion: 1, description: 'Mô tả v1' }];
    confirmSave(dialog);
    await within(dialog).findByText(/Nội dung đã được thay đổi trên máy chủ/);

    // Bấm tải lại nhưng giữ response treo, sau đó đóng modal trước khi response về
    const reloadGate = deferred<Response>();
    api.state.override = (r) =>
      r.method === 'GET' && r.path === detailApi ? reloadGate.promise : undefined;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tải dữ liệu mới nhất' }));
    await waitFor(() =>
      expect(api.requests.filter((r) => r.method === 'GET' && r.path === detailApi)).toHaveLength(
        2,
      ),
    );
    expect(api.requests.at(-1)?.signal).toBeInstanceOf(AbortSignal);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await act(async () => {
      reloadGate.resolve(reply(api.state.products[0]));
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Kiểm tra recheck trả 403 thu hồi quyền và xóa sạch cache admin
    api.state.override = (r) => (r.method === 'PATCH' ? failure(500) : undefined);
    const dialog2 = await openEditDialog();
    confirmSave(dialog2);
    const recheckBtn = await screen.findByRole('button', { name: 'Kiểm tra lại nội dung' });

    api.state.override = (r) =>
      r.method === 'GET' && r.path === detailApi ? failure(403) : undefined;
    fireEvent.click(recheckBtn);
    await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' });
    expect(
      view.client
        .getQueriesData({ queryKey: sessionQueryKeys.admin })
        .every(([, data]) => data === undefined),
    ).toBe(true);
  });

  it('UC-04.2/AC26 PATCH401 va refresh401 ket thuc phien, khong retry mutation', async () => {
    const api = backend();
    mountCatalog(detailPath);
    const dialog = await openEditDialog();
    api.state.override = (r) =>
      r.method === 'PATCH' || r.path === '/api/auth/refresh' ? failure(401) : undefined;
    confirmSave(dialog);
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    expect(api.requests.filter((r) => r.method === 'PATCH')).toHaveLength(1);
  });

  it('UC-04.2/AC26 GET cu sau mutation bi huy, khong de noi dung moi', async () => {
    const api = backend();
    const view = mountCatalog(detailPath);
    const dialog = await openEditDialog();
    fireEvent.change(within(dialog).getByDisplayValue(product.name), {
      target: { value: 'Tên vừa lưu' },
    });

    const old = deferred<Response>();
    let late = true;
    api.state.override = (r) => (r.path === detailApi && late ? old.promise : undefined);
    let flight!: Promise<void>;
    act(() => {
      flight = view.client.refetchQueries({
        queryKey: adminCatalogKeys.detail(actorA.id, product.id),
      });
    });
    await waitFor(() => expect(api.requests.filter((r) => r.path === detailApi)).toHaveLength(2));
    const signal = api.requests.at(-1)?.signal;
    late = false;

    confirmSave(dialog);
    await screen.findByText(/Đã lưu thay đổi nội dung sản phẩm/);
    expect(signal?.aborted).toBe(true);

    await act(async () => {
      old.resolve(reply(product));
      await flight;
    });
    expect(view.client.getQueryData(adminCatalogKeys.detail(actorA.id, product.id))).toMatchObject({
      name: 'Tên vừa lưu',
      contentVersion: 1,
    });
  });

  it('UC-04.2/AC26 mutation version cu sau GET moi khong ghi de version moi', async () => {
    const api = backend();
    const gate = deferred<Response>();
    api.state.override = (r) => (r.path === contentPath ? gate.promise : undefined);
    const view = mountCatalog(detailPath);
    const dialog = await openEditDialog();
    fireEvent.change(within(dialog).getByDisplayValue(product.name), {
      target: { value: 'Tên phiên bản 1' },
    });
    confirmSave(dialog);
    await waitFor(() => expect(api.requests.some((r) => r.method === 'PATCH')).toBe(true));

    const latest = {
      ...product,
      name: 'Tên phiên bản 2 mới hơn',
      contentVersion: 2,
      adminContentFields: ['name'],
    };
    api.state.products = [latest];
    await act(async () => {
      await view.client.refetchQueries({
        queryKey: adminCatalogKeys.detail(actorA.id, product.id),
      });
    });

    const versions: number[] = [];
    const unsubscribe = view.client.getQueryCache().subscribe(() => {
      const data = view.client.getQueryData<{ contentVersion: number }>(
        adminCatalogKeys.detail(actorA.id, product.id),
      );
      if (data) versions.push(data.contentVersion);
    });

    await act(async () =>
      gate.resolve(
        reply({
          id: product.id,
          name: 'Tên phiên bản 1',
          description: product.description,
          material: null,
          careInstructions: null,
          contentVersion: 1,
          adminContentFields: ['name'],
        }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    unsubscribe();

    expect(screen.getByText(/sản phẩm có thay đổi mới hơn/)).toBeInTheDocument();
    expect(versions.length).toBeGreaterThan(0);
    expect(versions.every((v) => v === 2)).toBe(true);
  });

  it('UC-04.2/AC26 GET403 truoc PATCH thanh cong muon xoa cache va chan notice', async () => {
    const api = backend();
    const gate = deferred<Response>();
    api.state.override = (r) => (r.path === contentPath ? gate.promise : undefined);
    const view = mountCatalog(detailPath);
    const dialog = await openEditDialog();
    fireEvent.change(within(dialog).getByDisplayValue(product.name), {
      target: { value: 'Tên muộn' },
    });
    confirmSave(dialog);
    await waitFor(() => expect(api.requests.some((r) => r.method === 'PATCH')).toBe(true));

    api.state.override = (r) =>
      r.path === detailApi ? failure(403) : r.path === contentPath ? gate.promise : undefined;
    await act(async () => {
      await view.client.refetchQueries({
        queryKey: adminCatalogKeys.detail(actorA.id, product.id),
      });
    });
    await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' });
    const count = api.adminRequests().length;

    await act(async () =>
      gate.resolve(
        reply({
          id: product.id,
          name: 'Tên muộn',
          description: product.description,
          material: null,
          careInstructions: null,
          contentVersion: 1,
          adminContentFields: ['name'],
        }),
      ),
    );
    expect(
      view.client
        .getQueriesData({ queryKey: sessionQueryKeys.admin })
        .every(([, data]) => data === undefined),
    ).toBe(true);
    expect(api.adminRequests()).toHaveLength(count);
    expect(screen.queryByText(/Đã lưu thay đổi nội dung sản phẩm/)).not.toBeInTheDocument();
  });

  it('UC-04.2/AC26 logout A→B/A→A khong invalidate phien moi', async () => {
    for (const actor of [actorA, actorB]) {
      const api = backend();
      const gate = deferred<Response>();
      api.state.override = (r) => (r.path === contentPath ? gate.promise : undefined);
      const view = mountCatalog(detailPath);
      const dialog = await openEditDialog();
      fireEvent.change(within(dialog).getByDisplayValue(product.name), {
        target: { value: 'Tên đã lưu muộn' },
      });
      confirmSave(dialog);
      await waitFor(() => expect(api.requests.some((r) => r.method === 'PATCH')).toBe(true));

      await act(async () => {
        await view.auth().logout();
      });
      expect(api.requests.find((r) => r.method === 'PATCH')?.signal?.aborted).toBe(true);

      await act(async () => {
        await view.auth().login({ email: actor.email, password: 'Password123' });
        view.go(detailPath);
      });
      await screen.findByRole('heading', { name: product.name });
      const count = api.adminRequests().length;

      await act(async () =>
        gate.resolve(
          reply({
            id: product.id,
            name: 'Tên đã lưu muộn',
            description: product.description,
            material: null,
            careInstructions: null,
            contentVersion: 1,
            adminContentFields: ['name'],
          }),
        ),
      );
      expect(api.adminRequests()).toHaveLength(count);
      expect(view.client.getQueryData(adminCatalogKeys.detail(actor.id, product.id))).toMatchObject(
        {
          name: product.name,
          contentVersion: 0,
        },
      );
      cleanup();
      localStorage.clear();
    }
  });

  it('UC-04.2/AC27 status response muon khong ghi de ten da sua; content mutation khong doi status va reset list cache', async () => {
    const api = backend();
    const view = mountCatalog('/admin/products?q=linen');
    await screen.findByRole('link', { name: product.name });
    act(() => view.go(`${detailPath}?q=linen`));

    // 1. Sửa nội dung thành công
    const dialog = await openEditDialog();
    fireEvent.change(within(dialog).getByDisplayValue('Áo khoác linen'), {
      target: { value: 'Tên mới sau khi sửa' },
    });
    confirmSave(dialog);

    await screen.findByText(/Đã lưu thay đổi nội dung sản phẩm/);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Tên mới sau khi sửa' }),
    ).toBeInTheDocument();

    // 2. Một status PATCH trả về phản hồi mang `name: 'Áo khoác linen'` (tên cũ)
    const statusGate = deferred<Response>();
    api.state.override = (r) => (r.path.endsWith('/status') ? statusGate.promise : undefined);

    fireEvent.click(screen.getByRole('button', { name: 'Ngừng bán' }));
    const statusDialog = await screen.findByRole('dialog');
    fireEvent.click(within(statusDialog).getByRole('button', { name: 'Ngừng bán' }));

    api.state.products = [
      {
        ...api.state.products[0]!,
        adminDisabled: true,
        isActive: false,
        statusVersion: 1,
      },
    ];
    await act(async () => {
      statusGate.resolve(
        reply({
          id: product.id,
          name: 'Áo khoác linen',
          isActive: false,
          adminDisabled: true,
          statusVersion: 1,
        }),
      );
    });

    await screen.findByText(/Đã ngừng bán thủ công/);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Tên mới sau khi sửa' }),
    ).toBeInTheDocument();
    expect(view.client.getQueryData(adminCatalogKeys.detail(actorA.id, product.id))).toMatchObject({
      name: 'Tên mới sau khi sửa',
      adminDisabled: true,
      statusVersion: 1,
      contentVersion: 1,
    });
  });
});
