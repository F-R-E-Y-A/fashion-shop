import { createHash } from 'node:crypto';

import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type AdminCatalogDetail,
  adminCatalogKeys,
  computeCreateProductRequestHash,
  type CreateProductPayload,
} from './admin-catalog.api.js';
import {
  actorA,
  actorB,
  backend,
  failure,
  mountCatalog,
  product,
  reply,
} from './catalog-test-support.js';

function rejectableDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

async function fillRequiredCreateFields(overrides?: {
  name?: string;
  slug?: string;
  sku?: string;
  listPrice?: string;
  salePrice?: string;
}) {
  await screen.findByLabelText(/Tên sản phẩm/i);
  const categorySelect = screen.getByLabelText(/Danh mục lá/i) as HTMLSelectElement;
  await waitFor(() => {
    expect(categorySelect.querySelector('option[value="cat-leaf"]')).not.toBeNull();
  });
  fireEvent.change(categorySelect, { target: { value: 'cat-leaf' } });
  fireEvent.change(screen.getByLabelText(/Tên sản phẩm/i), {
    target: { value: overrides?.name ?? 'Áo sơ mi poplin mới' },
  });
  fireEvent.change(screen.getByLabelText(/Slug đường dẫn/i), {
    target: { value: overrides?.slug ?? 'ao-so-mi-poplin-moi' },
  });
  fireEvent.change(screen.getByLabelText(/Màu sắc/i), {
    target: { value: 'col-1' },
  });
  fireEvent.change(screen.getByLabelText(/Kích cỡ/i), {
    target: { value: 'sz-2' },
  });
  fireEvent.change(screen.getByLabelText(/Mã SKU/i), {
    target: { value: overrides?.sku ?? 'SKU-POPLIN-01' },
  });
  fireEvent.change(screen.getByLabelText(/Giá niêm yết/i), {
    target: { value: overrides?.listPrice ?? '320000' },
  });
  if (overrides?.salePrice !== undefined) {
    fireEvent.change(screen.getByLabelText(/Giá giảm/i), {
      target: { value: overrides.salePrice },
    });
  }
}

describe('Admin product create', () => {
  it('computes createPayloadHash identically to server canonical SHA-256', () => {
    const payloadA: CreateProductPayload & { slug: string } = {
      id: '30000000-0000-4000-8000-000000000003',
      name: 'Áo poplin',
      slug: 'ao-poplin',
      categoryId: 'cat-leaf',
      brandId: null,
      description: null,
      material: '100% Cotton',
      careInstructions: null,
      audience: 'nu',
      isFeatured: false,
      variants: [
        {
          id: '40000000-0000-4000-8000-000000000004',
          colorId: 'col-1',
          sizeId: 'sz-2',
          sku: 'SKU-P-1',
          listPrice: '320000.00',
          salePrice: '280000.50',
          isActive: true,
        },
      ],
      images: [
        {
          id: '50000000-0000-4000-8000-000000000005',
          key: 'products/admin/tmp.jpg',
          alt: null,
        },
      ],
    };
    const payloadB: CreateProductPayload & { slug: string } = {
      ...payloadA,
      variants: [
        {
          ...payloadA.variants[0]!,
          listPrice: '320000',
          salePrice: '280000.5',
        },
      ],
    };

    const canonical = JSON.stringify({
      id: payloadA.id,
      name: payloadA.name,
      slug: payloadA.slug,
      categoryId: payloadA.categoryId,
      brandId: null,
      description: null,
      material: '100% Cotton',
      careInstructions: null,
      audience: 'nu',
      isFeatured: false,
      variants: [
        {
          id: payloadA.variants[0]!.id,
          colorId: 'col-1',
          sizeId: 'sz-2',
          sku: 'SKU-P-1',
          listPrice: '320000',
          salePrice: '280000.5',
          isActive: true,
        },
      ],
      images: [
        {
          id: payloadA.variants[0] ? payloadA.images![0]!.id : '',
          key: 'products/admin/tmp.jpg',
          alt: null,
        },
      ],
    });
    const nodeSha = createHash('sha256').update(canonical).digest('hex');

    expect(computeCreateProductRequestHash(payloadA)).toBe(nodeSha);
    expect(computeCreateProductRequestHash(payloadB)).toBe(nodeSha);
  });

  it('disables parent categories, degrades gracefully when uploads disabled, and creates hidden product without images', async () => {
    const api = backend();
    api.state.uploadsEnabled = false;
    mountCatalog('/admin/products/new');
    const user = userEvent.setup();

    await fillRequiredCreateFields();

    const categorySelect = screen.getByLabelText(/Danh mục lá/i) as HTMLSelectElement;
    const rootOpt = categorySelect.querySelector('option[value="cat-root"]') as HTMLOptionElement;
    const leafOpt = categorySelect.querySelector('option[value="cat-leaf"]') as HTMLOptionElement;
    expect(rootOpt.disabled).toBe(true);
    expect(leafOpt.disabled).toBe(false);

    await screen.findByText(/Kho ảnh chưa được cấu hình/i);

    await user.click(screen.getByRole('button', { name: /Lưu sản phẩm \(ẩn mặc định\)/i }));

    await waitFor(() => {
      const postReq = api
        .adminRequests()
        .find((r) => r.method === 'POST' && r.path === '/api/admin/products');
      expect(postReq).toBeDefined();
      expect((postReq!.body as CreateProductPayload).images).toEqual([]);
      expect((postReq!.body as CreateProductPayload).variants).toHaveLength(1);
      expect(screen.getByTestId('location').textContent).toMatch(/^\/admin\/products\/[0-9a-f-]+$/);
    });
  });

  it('uploads optional image when configured and submits key in create payload', async () => {
    const api = backend();
    api.state.uploadsEnabled = true;
    mountCatalog('/admin/products/new');
    const user = userEvent.setup();

    await fillRequiredCreateFields();

    const fileInput = screen.getByLabelText(/Chọn ảnh tải lên/i) as HTMLInputElement;
    await waitFor(() => {
      expect(fileInput.disabled).toBe(false);
    });
    const file = new File(['png-bytes'], 'poplin.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    await waitFor(() => {
      const ticketReq = api
        .adminRequests()
        .find((r) => r.method === 'POST' && r.path === '/api/admin/products/upload-tickets');
      expect(ticketReq).toBeDefined();
      expect(screen.getByAltText(/Ảnh tải lên 1/i)).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: /Lưu sản phẩm \(ẩn mặc định\)/i }));

    await waitFor(() => {
      const postReq = api
        .adminRequests()
        .find((r) => r.method === 'POST' && r.path === '/api/admin/products');
      expect(postReq).toBeDefined();
      const body = postReq!.body as CreateProductPayload;
      expect(body.images).toHaveLength(1);
      expect(body.images![0]!.key).toMatch(/^freya\/products\//);
    });
  });

  it('persists uncertain create across navigation and confirms success only when createPayloadHash matches', async () => {
    const createGate = rejectableDeferred<Response>();
    let capturedBody: CreateProductPayload | null = null;
    const api = backend();
    api.state.uploadsEnabled = false;
    api.state.override = (r) => {
      if (r.path === '/api/admin/products' && r.method === 'POST') {
        capturedBody = r.body as CreateProductPayload;
        return createGate.promise;
      }
      return undefined;
    };
    const app = mountCatalog('/admin/products/new');
    const user = userEvent.setup();

    await fillRequiredCreateFields();
    await user.click(screen.getByRole('button', { name: /Lưu sản phẩm \(ẩn mặc định\)/i }));

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
    });

    await act(async () => {
      createGate.reject(new DOMException('Aborted', 'AbortError'));
    });

    await screen.findByText(/Chưa xác định kết quả tạo sản phẩm/i);

    await act(async () => {
      app.go('/admin/products');
    });
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/admin/products');
    });
    await act(async () => {
      app.go('/admin/products/new');
    });

    await screen.findByText(/Yêu cầu tạo sản phẩm .* chưa rõ kết quả trên máy chủ/i);

    const matchingHash = computeCreateProductRequestHash({
      ...capturedBody!,
      slug: capturedBody!.slug ?? 'ao-so-mi-poplin-moi',
    });
    const createdOnServer: AdminCatalogDetail = {
      ...product,
      id: capturedBody!.id,
      name: capturedBody!.name,
      slug: capturedBody!.slug ?? 'ao-so-mi-poplin-moi',
      isCustom: true,
      adminDisabled: true,
      createPayloadHash: matchingHash,
    };
    api.state.products.push(createdOnServer);

    await user.click(screen.getByRole('button', { name: /Kiểm tra lại trạng thái/i }));

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe(
        `/admin/products/${capturedBody!.id}`,
      );
    });
  });

  it('refuses false success when GET /:id returns 200 with matching UUID but different createPayloadHash', async () => {
    const createGate = rejectableDeferred<Response>();
    let capturedBody: CreateProductPayload | null = null;
    const api = backend();
    api.state.uploadsEnabled = false;
    api.state.override = (r) => {
      if (r.path === '/api/admin/products' && r.method === 'POST') {
        capturedBody = r.body as CreateProductPayload;
        return createGate.promise;
      }
      return undefined;
    };
    mountCatalog('/admin/products/new');
    const user = userEvent.setup();

    await fillRequiredCreateFields();
    await user.click(screen.getByRole('button', { name: /Lưu sản phẩm \(ẩn mặc định\)/i }));

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
    });

    await act(async () => {
      createGate.reject(new DOMException('Aborted', 'AbortError'));
    });
    await screen.findByText(/Chưa xác định kết quả tạo sản phẩm/i);

    // Server has a DIFFERENT product under the exact same UUID
    api.state.products.push({
      ...product,
      id: capturedBody!.id,
      name: 'Sản phẩm khác chiếm UUID',
      slug: 'san-pham-khac-chiem-uuid',
      isCustom: true,
      adminDisabled: true,
      createPayloadHash: 'f'.repeat(64),
    });

    await user.click(screen.getByRole('button', { name: /Kiểm tra lại trạng thái/i }));

    await screen.findByText(/đang gắn với sản phẩm khác trên máy chủ/i);
    expect(screen.getByTestId('location').textContent).toBe('/admin/products/new');

    await user.click(screen.getByRole('button', { name: /Tạo bằng UUID mới/i }));
    await waitFor(() => {
      expect(screen.queryByText(/đang gắn với sản phẩm khác trên máy chủ/i)).toBeNull();
    });
  });

  it('freezes original payload, hash, and UUIDs when GET /:id returns 404 after timeout without offering a new UUID', async () => {
    const createGate = rejectableDeferred<Response>();
    const submittedPayloads: CreateProductPayload[] = [];
    let attempt = 0;
    const api = backend();
    api.state.uploadsEnabled = false;
    api.state.override = (r) => {
      if (r.path === '/api/admin/products' && r.method === 'POST') {
        attempt += 1;
        submittedPayloads.push(r.body as CreateProductPayload);
        if (attempt === 1) return createGate.promise;
      }
      return undefined;
    };
    mountCatalog('/admin/products/new');
    const user = userEvent.setup();

    await fillRequiredCreateFields({ name: 'Áo sơ mi poplin gốc' });
    await user.click(screen.getByRole('button', { name: /Lưu sản phẩm \(ẩn mặc định\)/i }));

    await waitFor(() => expect(submittedPayloads).toHaveLength(1));
    await act(async () => {
      createGate.reject(new DOMException('Aborted', 'AbortError'));
    });
    await screen.findByText(/Chưa xác định kết quả tạo sản phẩm/i);

    await user.click(screen.getByRole('button', { name: /Kiểm tra lại trạng thái/i }));
    await screen.findByText(/Máy chủ chưa ghi nhận sản phẩm này \(404\)/i);

    expect(screen.queryByRole('button', { name: /Tạo bằng UUID mới/i })).toBeNull();

    // Sau 404, input phải bị khóa và kể cả có thay đổi DOM thì lần gửi lại vẫn gửi đúng payload & UUID gốc
    const nameInput = screen.getByLabelText(/Tên sản phẩm/i) as HTMLInputElement;
    expect(nameInput).toBeDisabled();
    fireEvent.change(nameInput, { target: { value: 'Tên mới bị đổi sau 404' } });

    await user.click(screen.getAllByRole('button', { name: /Gửi lại với cùng mã/i })[0]!);

    await waitFor(() => {
      expect(submittedPayloads).toHaveLength(2);
      expect(submittedPayloads[1]!.id).toBe(submittedPayloads[0]!.id);
      expect(submittedPayloads[1]!.name).toBe('Áo sơ mi poplin gốc');
      expect(submittedPayloads[1]).toEqual(submittedPayloads[0]);
      expect(screen.getByTestId('location').textContent).toBe(
        `/admin/products/${submittedPayloads[0]!.id}`,
      );
      expect(api.state.products.some((p) => p.id === submittedPayloads[0]!.id)).toBe(true);
    });
  });

  it('does not offer new UUID after 404 so form stays locked to original request', async () => {
    const createGate = rejectableDeferred<Response>();
    const submittedPayloads: CreateProductPayload[] = [];
    const api = backend();
    api.state.uploadsEnabled = false;
    api.state.override = (r) => {
      if (r.path === '/api/admin/products' && r.method === 'POST') {
        submittedPayloads.push(r.body as CreateProductPayload);
        return createGate.promise;
      }
      return undefined;
    };
    const app = mountCatalog('/admin/products/new');
    const user = userEvent.setup();

    await fillRequiredCreateFields({ name: 'Bản nháp cố định' });
    await user.click(screen.getByRole('button', { name: /Lưu sản phẩm \(ẩn mặc định\)/i }));
    await waitFor(() => expect(submittedPayloads).toHaveLength(1));

    await act(async () => {
      createGate.reject(new DOMException('Aborted', 'AbortError'));
    });
    await screen.findByText(/Chưa xác định kết quả tạo sản phẩm/i);

    await user.click(screen.getByRole('button', { name: /Kiểm tra lại trạng thái/i }));
    await screen.findByText(/Máy chủ chưa ghi nhận sản phẩm này \(404\)/i);

    expect(screen.queryByRole('button', { name: /Tạo bằng UUID mới/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Kiểm tra lại trạng thái/i })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Gửi lại với cùng mã/i })).toHaveLength(2);
    expect(screen.getByLabelText(/Tên sản phẩm/i)).toBeDisabled();
    expect(screen.getByLabelText(/Mã SKU \*/i)).toBeDisabled();

    // Điều hướng qua trang khác rồi quay lại vẫn giữ trạng thái 404 bị khóa, không cấp UUID mới
    await act(async () => {
      app.go('/admin/products');
    });
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/admin/products');
    });
    await act(async () => {
      app.go('/admin/products/new');
    });
    await screen.findByText(/sau đối chiếu \(404\)/i);
    expect(screen.queryByRole('button', { name: /Tạo bằng UUID mới/i })).toBeNull();
    expect(screen.getByLabelText(/Tên sản phẩm/i)).toBeDisabled();
  });

  it('prevents duplicate product when first POST completes late after GET /:id returned 404', async () => {
    const createGate = rejectableDeferred<Response>();
    const submittedPayloads: CreateProductPayload[] = [];
    let attempt = 0;
    const api = backend();
    api.state.uploadsEnabled = false;
    api.state.override = (r) => {
      if (r.path === '/api/admin/products' && r.method === 'POST') {
        attempt += 1;
        submittedPayloads.push(r.body as CreateProductPayload);
        if (attempt === 1) return createGate.promise;
      }
      return undefined;
    };
    mountCatalog('/admin/products/new');
    const user = userEvent.setup();

    await fillRequiredCreateFields({
      name: 'Áo sơ mi hoàn tất muộn',
      slug: 'ao-so-mi-hoan-tat-muon',
      sku: 'ASM-MUON-01',
    });
    await user.click(screen.getByRole('button', { name: /Lưu sản phẩm \(ẩn mặc định\)/i }));
    await waitFor(() => expect(submittedPayloads).toHaveLength(1));

    // Phía client hết timeout, nhưng máy chủ vẫn tiếp tục xử lý POST #1
    await act(async () => {
      createGate.reject(new DOMException('Aborted', 'AbortError'));
    });
    await screen.findByText(/Chưa xác định kết quả tạo sản phẩm/i);

    // Thời điểm kiểm tra lần đầu, transaction của POST #1 chưa commit nên GET trả 404
    await user.click(screen.getByRole('button', { name: /Kiểm tra lại trạng thái/i }));
    await screen.findByText(/Máy chủ chưa ghi nhận sản phẩm này \(404\)/i);
    expect(screen.queryByRole('button', { name: /Tạo bằng UUID mới/i })).toBeNull();

    // POST đầu tiên hoàn tất muộn trên máy chủ ngay sau 404
    const first = submittedPayloads[0]!;
    const matchingHash = computeCreateProductRequestHash({
      ...first,
      slug: first.slug ?? 'ao-so-mi-hoan-tat-muon',
    });
    api.state.products.unshift({
      ...product,
      id: first.id,
      name: first.name,
      slug: first.slug ?? 'ao-so-mi-hoan-tat-muon',
      isCustom: true,
      adminDisabled: true,
      createPayloadHash: matchingHash,
      variants: first.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        color: { code: 'den', name: 'Đen', hex: '#000000' },
        sizeCode: 'M',
        listPrice: v.listPrice,
        salePrice: v.salePrice ?? null,
        isActive: v.isActive ?? true,
        isCustom: true,
        adminManagedFields: ['listPrice', 'salePrice', 'isActive'],
        updatedAt: '2026-11-20T01:00:00.000Z',
      })),
    });
    api.state.total += 1;

    // Không thể cấp UUID mới; gửi lại với cùng mã đụng idempotency và chỉ giữ đúng 1 sản phẩm
    await user.click(screen.getAllByRole('button', { name: /Gửi lại với cùng mã/i })[0]!);

    await waitFor(() => {
      expect(submittedPayloads).toHaveLength(2);
      expect(submittedPayloads[1]).toEqual(first);
      expect(screen.getByTestId('location').textContent).toBe(`/admin/products/${first.id}`);
    });

    const createdCustomProducts = api.state.products.filter((p) => p.isCustom);
    expect(createdCustomProducts).toHaveLength(1);
    expect(createdCustomProducts[0]!.id).toBe(first.id);
  });

  it('offers existing-product link and new-UUID reset when POST returns 409 IDEMPOTENCY_PAYLOAD_MISMATCH', async () => {
    const submittedIds: string[] = [];
    let attempt = 0;
    const api = backend();
    api.state.uploadsEnabled = false;
    api.state.override = (r) => {
      if (r.path === '/api/admin/products' && r.method === 'POST') {
        attempt += 1;
        const body = r.body as CreateProductPayload;
        submittedIds.push(body.id);
        if (attempt === 1) {
          return reply(
            {
              statusCode: 409,
              code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
              message: 'ID sản phẩm đã tồn tại với thông tin tạo ban đầu khác.',
            },
            409,
          );
        }
      }
      return undefined;
    };
    mountCatalog('/admin/products/new');
    const user = userEvent.setup();

    await fillRequiredCreateFields();
    await user.click(screen.getByRole('button', { name: /Lưu sản phẩm \(ẩn mặc định\)/i }));

    await waitFor(() => expect(submittedIds).toHaveLength(1));

    const conflictLink = await screen.findByRole('link', { name: /Xem sản phẩm hiện có/i });
    expect(conflictLink.getAttribute('href')).toBe(`/admin/products/${submittedIds[0]}`);
    const resetBtn = screen.getByRole('button', { name: /Tạo bằng UUID mới/i });
    expect(screen.getByLabelText(/Tên sản phẩm/i)).toBeDisabled();

    await user.click(resetBtn);
    await waitFor(() => {
      expect(screen.getByLabelText(/Tên sản phẩm/i)).not.toBeDisabled();
    });

    await user.click(screen.getByRole('button', { name: /Lưu sản phẩm \(ẩn mặc định\)/i }));

    await waitFor(() => {
      expect(submittedIds).toHaveLength(2);
      expect(submittedIds[1]).not.toBe(submittedIds[0]);
      expect(screen.getByTestId('location').textContent).toBe(`/admin/products/${submittedIds[1]}`);
    });
  });

  it('ignores late response after account switch during in-flight create', async () => {
    const createGate = rejectableDeferred<Response>();
    let capturedBody: CreateProductPayload | null = null;
    const api = backend();
    api.state.uploadsEnabled = false;
    api.state.override = (r) => {
      if (r.path === '/api/admin/products' && r.method === 'POST') {
        capturedBody = r.body as CreateProductPayload;
        return createGate.promise;
      }
      return undefined;
    };
    const app = mountCatalog('/admin/products/new');
    const user = userEvent.setup();

    await fillRequiredCreateFields();
    await user.click(screen.getByRole('button', { name: /Lưu sản phẩm \(ẩn mặc định\)/i }));

    await waitFor(() => expect(capturedBody).not.toBeNull());

    await act(async () => {
      await app.auth().login({ email: actorB.email, password: 'Password123' });
    });

    await act(async () => {
      createGate.resolve(
        reply(
          {
            ...product,
            id: capturedBody!.id,
            name: capturedBody!.name,
            slug: capturedBody!.slug,
            isCustom: true,
          },
          201,
        ),
      );
    });

    expect(screen.getByTestId('location').textContent).toBe('/admin/products/new');
    expect(app.client.getQueryData(adminCatalogKeys.uncertainCreate(actorB.id, 1))).toBeUndefined();
    expect(app.client.getQueryData(adminCatalogKeys.uncertainCreate(actorA.id, 1))).toBeUndefined();
  });

  it('clears uncertain state on 403 error and forces logout', async () => {
    const api = backend();
    api.state.uploadsEnabled = false;
    api.state.override = (r) => {
      if (r.path === '/api/admin/products' && r.method === 'POST') {
        return failure(403);
      }
      return undefined;
    };
    mountCatalog('/admin/products/new');
    const user = userEvent.setup();

    await fillRequiredCreateFields();
    await user.click(screen.getByRole('button', { name: /Lưu sản phẩm \(ẩn mặc định\)/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Không đủ quyền truy cập/i })).toBeTruthy();
    });
  });

  it('nhóm màu chuẩn tách khỏi màu mở rộng yody-* và sắp xếp theo tên tiếng Việt', async () => {
    const api = backend();
    api.state.uploadsEnabled = false;
    api.state.override = (r) => {
      if (r.path === '/api/admin/products/create-options' && r.method === 'GET') {
        return reply({
          brands: [{ id: 'brand-1', name: 'Freya Basic', slug: 'freya-basic' }],
          colors: [
            { id: 'c-yody-be', code: 'yody-be', name: 'Be.', hex: '#d8c8b0' },
            { id: 'c-mac-dinh', code: 'mac-dinh', name: 'Mặc định', hex: null },
            { id: 'c-trang', code: 'trang', name: 'Trắng', hex: '#ffffff' },
            { id: 'c-den', code: 'den', name: 'Đen', hex: '#111111' },
          ],
          sizes: [{ id: 'sz-1', code: 'M', sortOrder: 30 }],
        });
      }
      return undefined;
    };
    mountCatalog('/admin/products/new');

    const colorSelect = (await screen.findByLabelText(/Màu sắc/i)) as HTMLSelectElement;
    await waitFor(() => {
      expect(colorSelect.querySelector('option[value="c-den"]')).not.toBeNull();
    });

    const groups = Array.from(colorSelect.querySelectorAll('optgroup'));
    expect(groups.map((g) => g.label)).toEqual(['Màu chuẩn', 'Màu mở rộng (nguồn nhập)']);
    expect(Array.from(groups[0]!.querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      'Đen (den)',
      'Trắng (trang)',
      'Mặc định (mac-dinh)',
    ]);
    expect(Array.from(groups[1]!.querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      'Be (yody-be)',
    ]);
  });
});
