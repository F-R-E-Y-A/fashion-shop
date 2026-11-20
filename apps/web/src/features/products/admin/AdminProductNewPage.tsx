import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ApiError, classifyRequestError, postExternalForm } from '@/core';
import {
  adminAccessGeneration,
  AdminForbidden,
  SessionChangedError,
  shouldRetryAdminQuery,
  useAdminForbidden,
  useAuth,
} from '@/features/account';
import { ActionFeedback, ErrorNote, Loading } from '@/ui';

import {
  type AdminCatalogDetail,
  adminCatalogKeys,
  type AdminCreateOptionsResponse,
  computeCreateProductRequestHash,
  type CreateProductPayload,
  type UncertainProductCreate,
  type UploadConfigResponse,
  type UploadTicketResponse,
} from './admin-catalog.api.js';
import {
  adminCategoriesKeys,
  type AdminCategoryNode,
  CATEGORY_SLUG_REGEX,
  slugifyCategoryName,
} from './admin-categories.api.js';
import styles from './AdminCatalog.module.css';
import { PRODUCT_ACTION_TIMEOUT_MS } from './product-status-action.js';

const MAX_INITIAL_IMAGES = 8;
const PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function createPreviewUrl(file: File, fallback: string): string {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      return URL.createObjectURL(file);
    } catch {
      // Fallback in environments where URL.createObjectURL is unimplemented
    }
  }
  return fallback;
}

function createClientUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface DraftVariantRow {
  id: string;
  colorId: string;
  sizeId: string;
  sku: string;
  listPrice: string;
  salePrice: string;
  isActive: boolean;
}

interface DraftImageRow {
  id: string;
  key: string;
  url: string;
  alt: string;
}

interface CreateProductFormDraft {
  productId: string;
  name: string;
  slug: string;
  slugTouched: boolean;
  categoryId: string;
  brandId: string;
  audience: '' | 'nam' | 'nu' | 'unisex';
  description: string;
  material: string;
  careInstructions: string;
  isFeatured: boolean;
  variants: DraftVariantRow[];
  images: DraftImageRow[];
}

function emptyVariantRow(): DraftVariantRow {
  return {
    id: createClientUuid(),
    colorId: '',
    sizeId: '',
    sku: '',
    listPrice: '',
    salePrice: '',
    isActive: true,
  };
}

function emptyDraft(): CreateProductFormDraft {
  return {
    productId: createClientUuid(),
    name: '',
    slug: '',
    slugTouched: false,
    categoryId: '',
    brandId: '',
    audience: '',
    description: '',
    material: '',
    careInstructions: '',
    isFeatured: false,
    variants: [emptyVariantRow()],
    images: [],
  };
}

function formatMoneyInputValid(raw: string): boolean {
  const s = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return false;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n <= 999_999_999;
}

function createErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.body.code;
    const msg =
      typeof error.body.message === 'string' && error.body.message.trim()
        ? error.body.message
        : Array.isArray(error.body.message) && error.body.message.length > 0
          ? String(error.body.message[0])
          : '';
    if (code === 'SLUG_EXISTS') return 'Slug sản phẩm đã tồn tại. Vui lòng chọn slug khác.';
    if (code === 'SKU_EXISTS') return msg || 'Mã SKU đã tồn tại trên hệ thống.';
    if (code === 'IDEMPOTENCY_PAYLOAD_MISMATCH') {
      return 'Mã định danh (UUID) sản phẩm đã tồn tại với nội dung khác.';
    }
    if (code === 'CATEGORY_NOT_LEAF') {
      return 'Chỉ được gắn sản phẩm vào danh mục lá (không có danh mục con).';
    }
    if (code === 'INVALID_MEDIA') {
      return msg || 'Ảnh tải lên không hợp lệ hoặc phiếu tải đã quá hạn.';
    }
    if (msg) return msg;
  }
  switch (classifyRequestError(error, 'mutation')) {
    case 'unauthenticated':
      return 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.';
    case 'forbidden':
      return 'Tài khoản của bạn không còn quyền quản trị.';
    case 'not-found':
      return 'Danh mục, thương hiệu, màu hoặc cỡ đã chọn không còn tồn tại.';
    default:
      return 'Chưa thể tạo sản phẩm. Kiểm tra dữ liệu và thử lại.';
  }
}

export function AdminProductNewPage() {
  const { user, getSessionEpoch } = useAuth();
  return <AdminProductNewScope key={`${user?.id ?? ''}:${getSessionEpoch()}`} />;
}

function AdminProductNewScope() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actor = user?.id ?? '';
  const epoch = getSessionEpoch();
  const { forbidden, markForbidden, guardQuery } = useAdminForbidden(actor, getSessionEpoch);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const current = (v: { epoch: number; access: number }) =>
    getSessionEpoch() === v.epoch && adminAccessGeneration(client, actor) === v.access;
  const stamp = () => ({ epoch: getSessionEpoch(), access: adminAccessGeneration(client, actor) });

  const draftKey = useMemo(
    () => [...adminCatalogKeys.all(actor), 'create-draft', epoch] as const,
    [actor, epoch],
  );
  const uncertainKey = useMemo(
    () => adminCatalogKeys.uncertainCreate(actor, epoch),
    [actor, epoch],
  );

  const draftQuery = useQuery<CreateProductFormDraft>({
    queryKey: draftKey,
    queryFn: () => emptyDraft(),
    enabled: false,
    gcTime: Infinity,
    staleTime: Infinity,
  });
  const [localFallbackDraft] = useState<CreateProductFormDraft>(() => emptyDraft());
  const draft = draftQuery.data ?? localFallbackDraft;
  const setDraft = (updater: (prev: CreateProductFormDraft) => CreateProductFormDraft) => {
    client.setQueryData<CreateProductFormDraft>(draftKey, (prev) => updater(prev ?? draft));
  };

  const uncertainQuery = useQuery<UncertainProductCreate | null>({
    queryKey: uncertainKey,
    queryFn: () => null,
    enabled: false,
    gcTime: Infinity,
    staleTime: Infinity,
  });
  const uncertain = uncertainQuery.data ?? null;
  const setUncertain = (value: UncertainProductCreate | null) => {
    client.setQueryData<UncertainProductCreate | null>(uncertainKey, value);
  };

  const optionsQuery = useQuery<AdminCreateOptionsResponse>({
    queryKey: adminCatalogKeys.createOptions(actor),
    queryFn: ({ signal }) =>
      guardQuery(() =>
        request<AdminCreateOptionsResponse>('/admin/products/create-options', { signal }),
      ),
    enabled: Boolean(actor) && !forbidden,
    retry: shouldRetryAdminQuery,
    staleTime: 60_000,
  });

  const categoriesQuery = useQuery<AdminCategoryNode[]>({
    queryKey: adminCategoriesKeys.tree(actor),
    queryFn: ({ signal }) =>
      guardQuery(() => request<AdminCategoryNode[]>('/admin/categories', { signal })),
    enabled: Boolean(actor) && !forbidden,
    retry: shouldRetryAdminQuery,
    staleTime: 60_000,
  });

  const uploadConfigQuery = useQuery<UploadConfigResponse>({
    queryKey: adminCatalogKeys.uploadConfig(actor),
    queryFn: ({ signal }) =>
      guardQuery(() => request<UploadConfigResponse>('/uploads/config', { signal })),
    enabled: Boolean(actor) && !forbidden,
    retry: shouldRetryAdminQuery,
    staleTime: 60_000,
  });

  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [rechecking, setRechecking] = useState(false);
  const noticeRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mutationKey = useMemo(
    () => [...adminCatalogKeys.all(actor), 'create-product', epoch] as const,
    [actor, epoch],
  );
  const mutating = useIsMutating({ mutationKey }) > 0;

  const categoryChoices = useMemo(() => {
    const tree = categoriesQuery.data ?? [];
    const list: Array<{ id: string; label: string; isParent: boolean; hidden: boolean }> = [];
    for (const root of tree) {
      const hasChildren = root.children.length > 0;
      list.push({
        id: root.id,
        label: hasChildren
          ? `${root.name} (Nhóm cha — không chọn trực tiếp)`
          : `${root.name}${!root.effectiveActive ? ' · Đang ẩn' : ''}`,
        isParent: hasChildren,
        hidden: !root.effectiveActive,
      });
      for (const child of root.children) {
        list.push({
          id: child.id,
          label: `↳ ${root.name} / ${child.name}${!child.effectiveActive ? ' · Đang ẩn' : ''}`,
          isParent: false,
          hidden: !child.effectiveActive,
        });
      }
    }
    return list;
  }, [categoriesQuery.data]);

  const mutation = useMutation({
    mutationKey,
    retry: 0,
    mutationFn: async (vars: {
      payload: CreateProductPayload;
      requestHash: string;
      epoch: number;
      access: number;
    }) => {
      if (!current(vars)) throw new SessionChangedError();
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new DOMException('Timeout', 'TimeoutError')),
        PRODUCT_ACTION_TIMEOUT_MS,
      );
      try {
        return await request<AdminCatalogDetail>('/admin/products', {
          method: 'POST',
          signal: controller.signal,
          body: vars.payload,
        });
      } finally {
        clearTimeout(timer);
      }
    },
    onSuccess: async (created, vars) => {
      if (!current(vars)) return;
      setUncertain(null);
      client.removeQueries({ queryKey: draftKey, exact: true });
      await client.invalidateQueries({ queryKey: adminCatalogKeys.all(actor) });
      if (!current(vars) || !mountedRef.current) return;
      navigate(`/admin/products/${encodeURIComponent(created.id)}`);
    },
    onError: (error, vars) => {
      if (!current(vars)) return;
      const kind = classifyRequestError(error, 'mutation');
      if (kind === 'forbidden') {
        setUncertain(null);
        markForbidden();
        return;
      }
      if (kind === 'unknown') {
        setUncertain({
          operationId: Date.now(),
          productId: vars.payload.id,
          payload: vars.payload,
          requestHash: vars.requestHash,
          status: 'uncertain',
        });
        if (mountedRef.current) {
          setNotice({
            error: true,
            text: 'Chưa xác định kết quả tạo sản phẩm (mất kết nối hoặc quá thời gian). Bấm "Kiểm tra lại trạng thái" trước khi gửi lại.',
          });
        }
        return;
      }
      if (error instanceof ApiError && error.body.code === 'IDEMPOTENCY_PAYLOAD_MISMATCH') {
        setUncertain({
          operationId: Date.now(),
          productId: vars.payload.id,
          payload: vars.payload,
          requestHash: vars.requestHash,
          status: 'uuid-conflict',
        });
        if (mountedRef.current) {
          setNotice({
            error: true,
            text: `UUID ${vars.payload.id} đã tồn tại trên máy chủ với nội dung ban đầu khác. Hãy kiểm tra sản phẩm hiện có hoặc tạo bằng UUID mới.`,
          });
        }
        return;
      }
      setUncertain(null);
      if (mountedRef.current) {
        setNotice({ error: true, text: createErrorText(error) });
      }
    },
  });

  async function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    const cfg = uploadConfigQuery.data;
    if (!cfg?.enabled) {
      setUploadErrors(['Máy chủ chưa cấu hình kho ảnh. Bạn vẫn có thể tạo sản phẩm không ảnh.']);
      return;
    }

    const remaining = MAX_INITIAL_IMAGES - draft.images.length;
    if (remaining <= 0) {
      setUploadErrors([`Chỉ được đính kèm tối đa ${MAX_INITIAL_IMAGES} ảnh khi tạo mới.`]);
      return;
    }

    const v = stamp();
    setUploading(true);
    setUploadErrors([]);
    const errs: string[] = [];
    const uploaded: DraftImageRow[] = [];
    const maxBytes = cfg.maxBytes || 5_242_880;

    try {
      for (const file of files.slice(0, remaining)) {
        if (!current(v)) return;
        const ext = PHOTO_TYPES[file.type];
        if (!ext || !cfg.formats.includes(ext)) {
          errs.push(`${file.name}: chỉ nhận ảnh JPG, PNG hoặc WebP.`);
          continue;
        }
        if (file.size > maxBytes) {
          errs.push(`${file.name}: vượt quá giới hạn dung lượng 5 MB.`);
          continue;
        }
        try {
          const ticket = await request<UploadTicketResponse>('/admin/products/upload-tickets', {
            method: 'POST',
            body: {},
          });
          if (!current(v)) return;
          const formData = new FormData();
          for (const [k, val] of Object.entries(ticket.fields)) {
            formData.append(k, val);
          }
          formData.append('file', file);
          await postExternalForm(ticket.uploadUrl, formData);
          if (!current(v)) return;
          const previewUrl = createPreviewUrl(
            file,
            `blob:preview/${encodeURIComponent(ticket.key)}`,
          );
          uploaded.push({
            id: createClientUuid(),
            key: ticket.key,
            url: previewUrl,
            alt: '',
          });
        } catch (err) {
          if (classifyRequestError(err, 'mutation') === 'forbidden') {
            markForbidden();
            return;
          }
          errs.push(`${file.name}: tải lên thất bại.`);
        }
      }
      if (files.length > remaining) {
        errs.push(`Chỉ giữ ${remaining} ảnh đầu để không vượt giới hạn ${MAX_INITIAL_IMAGES} ảnh.`);
      }
      if (uploaded.length > 0 && current(v)) {
        setDraft((prev) => ({ ...prev, images: [...prev.images, ...uploaded] }));
      }
      if (mountedRef.current) setUploadErrors(errs);
    } finally {
      if (mountedRef.current && current(v)) setUploading(false);
    }
  }

  function validateForm(): {
    errors: string[];
    payload?: CreateProductPayload;
    requestHash?: string;
  } {
    const errors: string[] = [];
    const trimmedName = draft.name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 200) {
      errors.push('Tên sản phẩm phải từ 1 đến 200 ký tự.');
    }
    const resolvedSlug = draft.slugTouched ? draft.slug.trim() : slugifyCategoryName(trimmedName);
    if (
      resolvedSlug.length < 2 ||
      resolvedSlug.length > 120 ||
      !CATEGORY_SLUG_REGEX.test(resolvedSlug)
    ) {
      errors.push('Slug chỉ gồm chữ thường a-z, số 0-9 và dấu gạch ngang (-), dài 2–120 ký tự.');
    }
    if (!draft.categoryId) {
      errors.push('Vui lòng chọn danh mục lá.');
    } else {
      const catChoice = categoryChoices.find((c) => c.id === draft.categoryId);
      if (catChoice?.isParent) {
        errors.push('Không thể chọn danh mục cha. Vui lòng chọn danh mục lá.');
      }
    }
    if (draft.variants.length === 0) {
      errors.push('Cần ít nhất một biến thể ban đầu.');
    }
    const seenSkus = new Set<string>();
    const seenCombos = new Set<string>();
    draft.variants.forEach((v, idx) => {
      const label = `Biến thể #${idx + 1}`;
      if (!v.colorId) errors.push(`${label}: vui lòng chọn màu.`);
      if (!v.sizeId) errors.push(`${label}: vui lòng chọn cỡ.`);
      const sku = v.sku.trim();
      if (!sku || !/^[A-Za-z0-9_-]+$/.test(sku) || sku.length > 60) {
        errors.push(`${label}: SKU chỉ gồm chữ, số, '-' hoặc '_' (tối đa 60 ký tự).`);
      } else if (seenSkus.has(sku)) {
        errors.push(`${label}: SKU "${sku}" bị trùng.`);
      } else {
        seenSkus.add(sku);
      }
      if (v.colorId && v.sizeId) {
        const combo = `${v.colorId}:${v.sizeId}`;
        if (seenCombos.has(combo)) {
          errors.push(`${label}: trùng cặp màu và cỡ với dòng khác.`);
        } else {
          seenCombos.add(combo);
        }
      }
      if (!formatMoneyInputValid(v.listPrice)) {
        errors.push(`${label}: giá niêm yết phải là số > 0 và ≤ 999.999.999.`);
      }
      if (v.salePrice.trim()) {
        if (!formatMoneyInputValid(v.salePrice)) {
          errors.push(`${label}: giá giảm không hợp lệ.`);
        } else if (
          formatMoneyInputValid(v.listPrice) &&
          Number(v.salePrice.trim()) > Number(v.listPrice.trim())
        ) {
          errors.push(`${label}: giá giảm không được lớn hơn giá niêm yết.`);
        }
      }
    });

    if (errors.length > 0) return { errors };

    const payload: CreateProductPayload = {
      id: draft.productId,
      name: trimmedName,
      slug: resolvedSlug,
      categoryId: draft.categoryId,
      brandId: draft.brandId || null,
      description: draft.description.trim() || null,
      material: draft.material.trim() || null,
      careInstructions: draft.careInstructions.trim() || null,
      audience: draft.audience || null,
      isFeatured: draft.isFeatured,
      variants: draft.variants.map((v) => ({
        id: v.id,
        colorId: v.colorId,
        sizeId: v.sizeId,
        sku: v.sku.trim(),
        listPrice: v.listPrice.trim(),
        salePrice: v.salePrice.trim() ? v.salePrice.trim() : null,
        isActive: v.isActive,
      })),
      images: draft.images.map((img) => ({
        id: img.id,
        key: img.key,
        alt: img.alt.trim() || null,
      })),
    };
    const requestHash = computeCreateProductRequestHash({ ...payload, slug: resolvedSlug });
    return { errors: [], payload, requestHash };
  }

  function retryFrozenSubmit() {
    if (!uncertain || uncertain.status !== 'not-found' || mutating || uploading) {
      return;
    }
    setFieldErrors([]);
    setNotice(null);
    const v = stamp();
    mutation.mutate({
      payload: uncertain.payload,
      requestHash: uncertain.requestHash,
      ...v,
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (
      mutating ||
      uploading ||
      uncertain?.status === 'uncertain' ||
      uncertain?.status === 'uuid-conflict'
    ) {
      return;
    }
    if (uncertain?.status === 'not-found') {
      retryFrozenSubmit();
      return;
    }
    const { errors, payload, requestHash } = validateForm();
    setFieldErrors(errors);
    if (errors.length > 0 || !payload || !requestHash) {
      return;
    }
    setNotice(null);
    const v = stamp();
    mutation.mutate({ payload, requestHash, ...v });
  }

  async function handleRecheck() {
    if (!uncertain || rechecking) return;
    const v = stamp();
    setRechecking(true);
    try {
      const detail = await client.fetchQuery({
        queryKey: adminCatalogKeys.detail(actor, uncertain.productId),
        queryFn: ({ signal }) =>
          guardQuery(() =>
            request<AdminCatalogDetail>(
              `/admin/products/${encodeURIComponent(uncertain.productId)}`,
              { signal },
            ),
          ),
        staleTime: 0,
        retry: false,
      });
      if (!current(v)) return;
      if (detail.createPayloadHash === uncertain.requestHash) {
        setUncertain(null);
        client.removeQueries({ queryKey: draftKey, exact: true });
        await client.invalidateQueries({ queryKey: adminCatalogKeys.all(actor) });
        if (!current(v) || !mountedRef.current) return;
        navigate(`/admin/products/${encodeURIComponent(detail.id)}`);
        return;
      }
      // Cùng UUID nhưng createPayloadHash không khớp: tuyệt đối không báo tạo thành công
      setUncertain({ ...uncertain, status: 'uuid-conflict' });
      if (mountedRef.current) {
        setNotice({
          error: true,
          text: `UUID ${detail.id} đã thuộc về sản phẩm "${detail.name}" có nội dung khác trên máy chủ. Không thể báo tạo thành công; hãy kiểm tra sản phẩm hiện có hoặc tạo lại với UUID mới.`,
        });
      }
    } catch (error) {
      if (!current(v)) return;
      if (classifyRequestError(error, 'detail') === 'not-found') {
        // Giữ nguyên productId, payload gốc và requestHash để gửi lại idempotent
        setUncertain({ ...uncertain, status: 'not-found' });
        if (mountedRef.current) {
          setNotice({
            text: 'Máy chủ chưa ghi nhận sản phẩm này (404). Yêu cầu trước vẫn có thể hoàn tất muộn; hệ thống khóa nội dung gốc để bạn kiểm tra lại trạng thái hoặc gửi lại an toàn bằng cùng UUID.',
          });
        }
        return;
      }
      if (classifyRequestError(error, 'detail') === 'forbidden') {
        markForbidden();
        return;
      }
      if (mountedRef.current) {
        setNotice({
          error: true,
          text: 'Chưa đối chiếu được trạng thái từ máy chủ. Kiểm tra kết nối rồi thử lại.',
        });
      }
    } finally {
      if (mountedRef.current && current(v)) setRechecking(false);
    }
  }

  function resetUuidAfterConflict() {
    setUncertain(null);
    setFieldErrors([]);
    setDraft((prev) => ({
      ...prev,
      productId: createClientUuid(),
      variants: prev.variants.map((v) => ({ ...v, id: createClientUuid() })),
      images: prev.images.map((img) => ({ ...img, id: createClientUuid() })),
    }));
    setNotice({ text: 'Đã cấp mã UUID mới. Bạn có thể xem lại, chỉnh sửa và gửi tạo sản phẩm.' });
  }

  if (forbidden) return <AdminForbidden />;
  const isLoading =
    optionsQuery.isPending || categoriesQuery.isPending || uploadConfigQuery.isPending;
  const loadError = optionsQuery.error ?? categoriesQuery.error;
  const uploadsEnabled = uploadConfigQuery.data?.enabled ?? false;
  const effectiveSlug = draft.slugTouched ? draft.slug : slugifyCategoryName(draft.name.trim());

  return (
    <div className={styles.page}>
      <Link className={styles.back} to="/admin/products">
        ← Về danh sách sản phẩm
      </Link>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Danh mục hàng hóa</p>
        <h1 className={styles.title}>Tạo sản phẩm mới</h1>
        <p className={styles.intro}>
          Sản phẩm mới mặc định lưu ở trạng thái ẩn (ngừng bán thủ công). Sau khi tạo, kiểm tra ảnh
          và biến thể trước khi công bố.
        </p>
      </header>

      <div ref={noticeRef} tabIndex={-1} className={styles.noticeSlot}>
        {notice && (
          <ActionFeedback
            noticeKey={notice.text}
            sessionScope={`${actor}:${epoch}`}
            tone={notice.error ? 'error' : 'success'}
            message={notice.text}
            onDismiss={() => setNotice(null)}
          />
        )}
      </div>

      {uncertain?.status === 'uncertain' && (
        <div className={styles.conflictAlert} role="alert">
          <p>
            Yêu cầu tạo sản phẩm ({uncertain.productId}) chưa rõ kết quả trên máy chủ. Không tự gửi
            lại trước khi đối chiếu.
          </p>
          <div className={styles.actionGroup}>
            <button
              type="button"
              className={styles.statusButton}
              disabled={rechecking}
              onClick={() => void handleRecheck()}
            >
              {rechecking ? 'Đang đối chiếu…' : 'Kiểm tra lại trạng thái'}
            </button>
          </div>
        </div>
      )}

      {uncertain?.status === 'not-found' && (
        <div className={styles.conflictAlert} role="alert">
          <p>
            Máy chủ chưa ghi nhận sản phẩm ({uncertain.productId}) sau đối chiếu (404). Yêu cầu
            trước vẫn có thể hoàn tất muộn nên nội dung và UUID gốc đang được khóa để bạn kiểm tra
            lại trạng thái hoặc gửi lại an toàn bằng cùng mã.
          </p>
          <div className={styles.actionGroup}>
            <button
              type="button"
              className={styles.statusButton}
              disabled={mutating || rechecking}
              onClick={retryFrozenSubmit}
            >
              {mutating ? 'Đang gửi lại…' : 'Gửi lại với cùng mã'}
            </button>
            <button
              type="button"
              className={styles.statusButton}
              disabled={mutating || rechecking}
              onClick={() => void handleRecheck()}
            >
              {rechecking ? 'Đang đối chiếu…' : 'Kiểm tra lại trạng thái'}
            </button>
          </div>
        </div>
      )}

      {uncertain?.status === 'uuid-conflict' && (
        <div className={styles.conflictAlert} role="alert">
          <p>UUID {uncertain.productId} đang gắn với sản phẩm khác trên máy chủ.</p>
          <div className={styles.actionGroup}>
            <Link
              className={styles.statusButton}
              to={`/admin/products/${encodeURIComponent(uncertain.productId)}`}
            >
              Xem sản phẩm hiện có
            </Link>
            <button type="button" className={styles.statusButton} onClick={resetUuidAfterConflict}>
              Tạo bằng UUID mới
            </button>
          </div>
        </div>
      )}

      {isLoading && <Loading label="Đang tải dữ liệu danh mục, màu và cỡ…" />}
      {loadError && (
        <ErrorNote
          label="Không tải được dữ liệu cấu hình tạo sản phẩm."
          onRetry={() => {
            void optionsQuery.refetch();
            void categoriesQuery.refetch();
          }}
        />
      )}

      {optionsQuery.data && categoriesQuery.data && (
        <form className={styles.createForm} onSubmit={handleSubmit} noValidate>
          {fieldErrors.length > 0 && (
            <ul className={styles.uploadErrorList} role="alert">
              {fieldErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}

          <fieldset className={styles.formFieldset} disabled={Boolean(uncertain) || mutating}>
            <section className={styles.panel} aria-labelledby="new-prod-basic">
              <h2 id="new-prod-basic" className={styles.panelTitle}>
                1. Thông tin cơ bản &amp; phân loại
              </h2>
              <div className={styles.fieldGrid}>
                <label className={`${styles.field} ${styles.fieldFull}`}>
                  <span>Tên sản phẩm *</span>
                  <input
                    required
                    maxLength={200}
                    value={draft.name}
                    onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Ví dụ: Áo sơ mi lụa tay dài"
                  />
                </label>

                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label htmlFor="new-prod-slug">Slug đường dẫn</label>
                  <div className={styles.slugRow}>
                    <input
                      id="new-prod-slug"
                      maxLength={120}
                      value={effectiveSlug}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          slug: e.target.value,
                          slugTouched: true,
                        }))
                      }
                      placeholder="ao-so-mi-lua-tay-dai"
                    />
                    {draft.slugTouched && (
                      <button
                        type="button"
                        className={styles.mediaSmallButton}
                        onClick={() =>
                          setDraft((prev) => ({ ...prev, slug: '', slugTouched: false }))
                        }
                      >
                        Đặt lại theo tên
                      </button>
                    )}
                  </div>
                </div>

                <label className={styles.field}>
                  <span>Danh mục lá *</span>
                  <select
                    required
                    value={draft.categoryId}
                    onChange={(e) => setDraft((prev) => ({ ...prev, categoryId: e.target.value }))}
                  >
                    <option value="">-- Chọn danh mục lá --</option>
                    {categoryChoices.map((c) => (
                      <option key={c.id} value={c.id} disabled={c.isParent}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.field}>
                  <span>Thương hiệu</span>
                  <select
                    value={draft.brandId}
                    onChange={(e) => setDraft((prev) => ({ ...prev, brandId: e.target.value }))}
                  >
                    <option value="">Không gắn thương hiệu</option>
                    {optionsQuery.data.brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.field}>
                  <span>Đối tượng</span>
                  <select
                    value={draft.audience}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        audience: e.target.value as CreateProductFormDraft['audience'],
                      }))
                    }
                  >
                    <option value="">Chưa xác định</option>
                    <option value="nam">Nam</option>
                    <option value="nu">Nữ</option>
                    <option value="unisex">Unisex</option>
                  </select>
                </label>

                <label className={styles.checkboxField}>
                  <input
                    type="checkbox"
                    checked={draft.isFeatured}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, isFeatured: e.target.checked }))
                    }
                  />
                  <span>Đánh dấu sản phẩm nổi bật</span>
                </label>

                <label className={styles.field}>
                  <span>Chất liệu</span>
                  <input
                    maxLength={500}
                    value={draft.material}
                    onChange={(e) => setDraft((prev) => ({ ...prev, material: e.target.value }))}
                  />
                </label>

                <label className={styles.field}>
                  <span>Hướng dẫn bảo quản</span>
                  <input
                    maxLength={5000}
                    value={draft.careInstructions}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, careInstructions: e.target.value }))
                    }
                  />
                </label>

                <label className={`${styles.field} ${styles.fieldFull}`}>
                  <span>Mô tả sản phẩm</span>
                  <textarea
                    rows={4}
                    maxLength={20000}
                    value={draft.description}
                    onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </label>
              </div>
            </section>

            <section className={styles.panel} aria-labelledby="new-prod-variants">
              <div className={styles.mediaHeader}>
                <h2 id="new-prod-variants" className={styles.panelTitle}>
                  2. Biến thể ban đầu ({draft.variants.length}) *
                </h2>
                <button
                  type="button"
                  className={styles.statusButton}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      variants: [...prev.variants, emptyVariantRow()],
                    }))
                  }
                >
                  + Thêm biến thể
                </button>
              </div>

              {draft.variants.map((variant, index) => (
                <div key={variant.id} className={styles.variantRowCard}>
                  <div className={styles.variantRowHeader}>
                    <strong>Biến thể #{index + 1}</strong>
                    <button
                      type="button"
                      className={styles.mediaSmallButton}
                      data-tone="danger"
                      disabled={draft.variants.length <= 1}
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          variants: prev.variants.filter((item) => item.id !== variant.id),
                        }))
                      }
                    >
                      Xóa dòng {index + 1}
                    </button>
                  </div>
                  <div className={styles.fieldGrid}>
                    <label className={styles.field}>
                      <span>Màu sắc *</span>
                      <select
                        value={variant.colorId}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            variants: prev.variants.map((item) =>
                              item.id === variant.id ? { ...item, colorId: e.target.value } : item,
                            ),
                          }))
                        }
                      >
                        <option value="">-- Chọn màu --</option>
                        {optionsQuery.data.colors.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.code})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.field}>
                      <span>Kích cỡ *</span>
                      <select
                        value={variant.sizeId}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            variants: prev.variants.map((item) =>
                              item.id === variant.id ? { ...item, sizeId: e.target.value } : item,
                            ),
                          }))
                        }
                      >
                        <option value="">-- Chọn cỡ --</option>
                        {optionsQuery.data.sizes.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.code}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.field}>
                      <span>Mã SKU *</span>
                      <input
                        maxLength={60}
                        value={variant.sku}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            variants: prev.variants.map((item) =>
                              item.id === variant.id ? { ...item, sku: e.target.value } : item,
                            ),
                          }))
                        }
                        placeholder="VD: AO-LUA-DEN-M"
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Giá niêm yết (đ) *</span>
                      <input
                        inputMode="decimal"
                        value={variant.listPrice}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            variants: prev.variants.map((item) =>
                              item.id === variant.id
                                ? { ...item, listPrice: e.target.value }
                                : item,
                            ),
                          }))
                        }
                        placeholder="450000"
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Giá giảm (đ, bỏ trống nếu không giảm)</span>
                      <input
                        inputMode="decimal"
                        value={variant.salePrice}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            variants: prev.variants.map((item) =>
                              item.id === variant.id
                                ? { ...item, salePrice: e.target.value }
                                : item,
                            ),
                          }))
                        }
                        placeholder="390000"
                      />
                    </label>

                    <label className={styles.checkboxField}>
                      <input
                        type="checkbox"
                        checked={variant.isActive}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            variants: prev.variants.map((item) =>
                              item.id === variant.id
                                ? { ...item, isActive: e.target.checked }
                                : item,
                            ),
                          }))
                        }
                      />
                      <span>Bật biến thể này (sản phẩm vẫn lưu ẩn mặc định)</span>
                    </label>
                  </div>
                </div>
              ))}
            </section>

            <section className={styles.panel} aria-labelledby="new-prod-images">
              <div className={styles.mediaHeader}>
                <h2 id="new-prod-images" className={styles.panelTitle}>
                  3. Hình ảnh ban đầu ({draft.images.length}/{MAX_INITIAL_IMAGES})
                </h2>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className={styles.fileInput}
                  aria-label="Chọn ảnh tải lên"
                  disabled={
                    !uploadsEnabled || uploading || draft.images.length >= MAX_INITIAL_IMAGES
                  }
                  onChange={(e) => void handleFilesChange(e)}
                />
                <button
                  type="button"
                  className={styles.statusButton}
                  disabled={
                    !uploadsEnabled || uploading || draft.images.length >= MAX_INITIAL_IMAGES
                  }
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? 'Đang tải ảnh…' : 'Chọn ảnh tải lên'}
                </button>
              </div>
              {!uploadsEnabled && (
                <p className={styles.storageNote}>
                  Kho ảnh chưa được cấu hình. Bạn vẫn có thể tạo sản phẩm không ảnh ở trạng thái ẩn
                  rồi bổ sung ảnh sau.
                </p>
              )}
              {uploadErrors.length > 0 && (
                <ul className={styles.uploadErrorList} role="alert">
                  {uploadErrors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              )}
              {draft.images.length > 0 && (
                <div className={styles.mediaGrid}>
                  {draft.images.map((img, idx) => (
                    <figure key={img.id} className={styles.mediaCard}>
                      <div className={styles.mediaPreviewWrap}>
                        <img
                          className={styles.mediaPreview}
                          src={img.url}
                          alt={img.alt || `Ảnh tải lên ${idx + 1}`}
                        />
                      </div>
                      <label className={styles.field}>
                        <span>Mô tả thay thế ảnh #{idx + 1}</span>
                        <input
                          maxLength={200}
                          value={img.alt}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              images: prev.images.map((item) =>
                                item.id === img.id ? { ...item, alt: e.target.value } : item,
                              ),
                            }))
                          }
                        />
                      </label>
                      <div className={styles.mediaActions}>
                        <button
                          type="button"
                          className={styles.mediaSmallButton}
                          data-tone="danger"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              images: prev.images.filter((item) => item.id !== img.id),
                            }))
                          }
                        >
                          Gỡ ảnh #{idx + 1}
                        </button>
                      </div>
                    </figure>
                  ))}
                </div>
              )}
            </section>
          </fieldset>

          <div className={styles.formActions}>
            <button
              type="submit"
              className={styles.primaryLink}
              disabled={
                mutating ||
                uploading ||
                uncertain?.status === 'uncertain' ||
                uncertain?.status === 'uuid-conflict'
              }
            >
              {mutating
                ? 'Đang lưu sản phẩm…'
                : uncertain?.status === 'not-found'
                  ? 'Gửi lại với cùng mã'
                  : 'Lưu sản phẩm (ẩn mặc định)'}
            </button>
            <Link className={styles.statusButton} to="/admin/products">
              Hủy
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
