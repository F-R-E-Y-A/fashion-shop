import {
  type QueryClient,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { type ChangeEvent, type DragEvent, useCallback, useEffect, useRef, useState } from 'react';

import {
  ApiError,
  apiGet,
  classifyRequestError,
  postExternalForm,
  shouldRetryRequest,
} from '@/core';
import {
  adminAccessGeneration,
  SessionChangedError,
  useAdminForbidden,
  useAuth,
} from '@/features/account';
import { ActionFeedback, Empty } from '@/ui';

import { productKeys } from '../api/index.js';
import {
  type AdminCatalogDetail,
  adminCatalogKeys,
  type AdminProductImagesResult,
  bumpDetailGeneration,
  type DraftProductImageItem,
  getDetailGeneration,
  imagesMutationErrorText,
  type UncertainImagesUpdate,
  type UpdateProductImagesPayload,
  type UploadConfigResponse,
  type UploadTicketResponse,
} from './admin-catalog.api.js';
import styles from './AdminCatalog.module.css';
import { PRODUCT_ACTION_TIMEOUT_MS } from './product-status-action.js';

export const MAX_PRODUCT_IMAGES = 8;

const PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const mediaLocks = new WeakMap<object, Set<string>>();

export interface AltConflict {
  serverAlt: string | null;
  urlChanged?: boolean;
}

export interface OrderConflict {
  serverOrderIds: string[];
  serverPrimaryLabel: string;
}

export interface RemovalConflict {
  id: string;
  url: string;
  serverAlt: string | null;
  color: DraftProductImageItem['color'];
  serverIndex: number;
  urlChanged: boolean;
}

export interface StoredImagesDraft {
  productId: string;
  baseVersion: number;
  expectedVersion: number;
  baseIds: string[];
  baseUrls: Record<string, string>;
  baseAlts: Record<string, string | null>;
  altConflicts: Record<string, AltConflict>;
  orderConflict: OrderConflict | null;
  removalConflicts: Record<string, RemovalConflict>;
  items: DraftProductImageItem[];
  dirty: boolean;
  conflictError: string | null;
}

export interface FileUploadError {
  id: string;
  fileName: string;
  message: string;
}

type MediaNotice = {
  key: string | number;
  text: string;
  error?: boolean;
  recheck?: boolean;
};

function normalizeAlt(alt: string | null | undefined): string | null {
  if (!alt) return null;
  const trimmed = alt.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDraftItems(product: AdminCatalogDetail): DraftProductImageItem[] {
  return [...product.images]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((img) => ({
      id: img.id,
      url: img.url,
      alt: img.alt ?? '',
      color: img.color,
    }));
}

function buildBaseAlts(product: AdminCatalogDetail): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  for (const img of product.images) {
    map[img.id] = normalizeAlt(img.alt);
  }
  return map;
}

function buildBaseIds(product: AdminCatalogDetail): string[] {
  return [...product.images].sort((a, b) => a.sortOrder - b.sortOrder).map((img) => img.id);
}

function buildBaseUrls(product: AdminCatalogDetail): Record<string, string> {
  const map: Record<string, string> = {};
  for (const img of product.images) {
    map[img.id] = img.url;
  }
  return map;
}

function sameIdOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, idx) => b[idx] === id);
}

function isSameAsServer(product: AdminCatalogDetail, items: DraftProductImageItem[]): boolean {
  const serverSorted = [...product.images].sort((a, b) => a.sortOrder - b.sortOrder);
  if (items.some((item) => Boolean(item.key))) return false;
  if (items.length !== serverSorted.length) return false;
  return items.every(
    (item, index) =>
      serverSorted[index]?.id === item.id &&
      normalizeAlt(serverSorted[index]?.alt) === normalizeAlt(item.alt),
  );
}

function matchesExpectedImages(
  fresh: AdminCatalogDetail,
  payload: UpdateProductImagesPayload,
): boolean {
  const serverSorted = [...fresh.images].sort((a, b) => a.sortOrder - b.sortOrder);
  if (serverSorted.length !== payload.items.length) return false;
  return payload.items.every((expected, idx) => {
    const actual = serverSorted[idx];
    if (!actual) return false;
    return actual.id === expected.id && normalizeAlt(actual.alt) === normalizeAlt(expected.alt);
  });
}

function hasNewerImages(
  client: QueryClient,
  actor: string,
  productId: string,
  version: number,
): boolean {
  return client
    .getQueriesData<AdminCatalogDetail>({
      queryKey: adminCatalogKeys.detail(actor, productId),
    })
    .some(([, data]) => data && (data.imagesVersion ?? 0) > version);
}

function validateUploadFile(file: File, config: UploadConfigResponse): string | null {
  const ext = PHOTO_TYPES[file.type];
  const allowed = config.formats.map((f) => f.toLowerCase());
  if (!ext || (!allowed.includes(ext) && !(ext === 'jpg' && allowed.includes('jpeg')))) {
    return 'Định dạng không hỗ trợ (chỉ nhận JPG, PNG hoặc WebP).';
  }
  if (file.size > config.maxBytes) {
    const maxMb = Math.round(config.maxBytes / 1024 / 1024);
    return `Dung lượng vượt quá giới hạn tối đa ${maxMb} MB.`;
  }
  return null;
}

function createPreviewUrl(file: File): string {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      return URL.createObjectURL(file);
    } catch {
      // Fallback in test environment
    }
  }
  return `blob:preview/${encodeURIComponent(file.name)}`;
}

export function useProductMediaAction(product: AdminCatalogDetail | undefined) {
  const client = useQueryClient();
  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actor = user?.id ?? '';
  const epoch = getSessionEpoch();
  const productId = product?.id ?? '';
  const { forbidden, markForbidden, guardQuery } = useAdminForbidden(actor, getSessionEpoch);

  const sessionScope = `${actor}:${epoch}`;
  const [notice, setNoticeState] = useState<(MediaNotice & { scope: string }) | null>(null);
  const noticeSeqRef = useRef(0);
  const noticeRef = useRef<HTMLDivElement>(null);

  const showNotice = useCallback(
    (next: Omit<MediaNotice, 'key'> & { key?: string | number }) => {
      noticeSeqRef.current += 1;
      setNoticeState({
        ...next,
        key: next.key ?? noticeSeqRef.current,
        scope: sessionScope,
      });
    },
    [sessionScope],
  );
  const clearNotice = useCallback(() => setNoticeState(null), []);
  const scopedNotice = notice?.scope === sessionScope ? notice : null;

  const [uploadErrors, setUploadErrors] = useState<FileUploadError[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [checking, setChecking] = useState(false);
  const [reloading, setReloading] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadingRef = useRef(false);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      uploadingRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!forbidden) return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort(new DOMException('Không đủ quyền truy cập', 'AbortError'));
      abortControllerRef.current = null;
    }
  }, [forbidden]);

  // Query config kho ảnh
  const uploadConfigQuery = useQuery<UploadConfigResponse>({
    queryKey: adminCatalogKeys.uploadConfig(actor),
    queryFn: ({ signal }) => apiGet<UploadConfigResponse>('/uploads/config', undefined, { signal }),
    enabled: Boolean(actor) && !forbidden,
    staleTime: 5 * 60_000,
    retry: shouldRetryRequest,
  });

  const uploadConfig: UploadConfigResponse = uploadConfigQuery.data ?? {
    enabled: true,
    maxBytes: 5 * 1024 * 1024,
    formats: ['jpg', 'png', 'webp'],
  };
  const uploadsEnabled = uploadConfigQuery.isError ? false : uploadConfig.enabled;

  const [, setCacheTick] = useState(0);
  useEffect(() => {
    if (!actor || !productId) return;
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' && event.type !== 'removed' && event.type !== 'added') {
        return;
      }
      const key = event?.query?.queryKey;
      if (!Array.isArray(key)) return;
      const isDraftQuery =
        key[0] === 'session' &&
        key[1] === 'admin' &&
        key[2] === 'products' &&
        key[3] === actor &&
        key[4] === 'images-draft' &&
        key[5] === epoch &&
        key[6] === productId;
      const isUncertainQuery =
        key[0] === 'uncertain' &&
        key[1] === 'admin' &&
        key[2] === 'products' &&
        key[3] === actor &&
        key[4] === 'images-update' &&
        key[5] === epoch &&
        key[6] === productId;
      if (isDraftQuery || isUncertainQuery) {
        setCacheTick((n) => n + 1);
      }
    });
    return unsubscribe;
  }, [actor, client, epoch, productId]);

  // Lưu draft trong QueryCache theo actor, epoch, productId để giữ qua điều hướng cùng phiên
  const draftKey = adminCatalogKeys.imagesDraft(actor, epoch, productId);
  const savedDraft =
    actor && productId ? (client.getQueryData<StoredImagesDraft | null>(draftKey) ?? null) : null;

  // Lưu uncertain marker trong QueryCache với prefix ['uncertain', 'admin', 'products', actor, ...]
  const uncertainKey = adminCatalogKeys.uncertainImagesUpdate(actor, epoch, productId);
  const uncertain =
    actor && productId
      ? (client.getQueryData<UncertainImagesUpdate | null>(uncertainKey) ?? null)
      : null;

  const setStoredDraft = (
    updater: (prev: StoredImagesDraft | null) => StoredImagesDraft | null,
  ) => {
    if (!actor || !productId) return;
    client.setQueryData<StoredImagesDraft | null>(
      adminCatalogKeys.imagesDraft(actor, epoch, productId),
      (prev) => updater(prev ?? null),
    );
  };

  // Đồng bộ draft với dữ liệu product từ server khi chưa dirty và không có uncertain/conflict
  const currentDraft: StoredImagesDraft | null = (() => {
    if (!product) return null;
    const saved = savedDraft;
    if (saved && saved.productId === product.id) {
      if (saved.dirty || saved.conflictError || uncertain) {
        return saved;
      }
      if (saved.expectedVersion === (product.imagesVersion ?? 0)) {
        return saved;
      }
    }
    return {
      productId: product.id,
      baseVersion: product.imagesVersion ?? 0,
      expectedVersion: product.imagesVersion ?? 0,
      baseIds: buildBaseIds(product),
      baseUrls: buildBaseUrls(product),
      baseAlts: buildBaseAlts(product),
      altConflicts: {},
      orderConflict: null,
      removalConflicts: {},
      items: toDraftItems(product),
      dirty: false,
      conflictError: null,
    };
  })();

  const items = currentDraft?.items ?? [];
  const expectedVersion = currentDraft?.expectedVersion ?? product?.imagesVersion ?? 0;
  const conflictError = currentDraft?.conflictError ?? null;
  const altConflicts = currentDraft?.altConflicts ?? {};
  const orderConflict = currentDraft?.orderConflict ?? null;
  const removalConflicts = currentDraft?.removalConflicts ?? {};
  const removalConflictList = Object.values(removalConflicts);
  const hasMediaConflicts =
    Object.keys(altConflicts).length > 0 ||
    Boolean(orderConflict) ||
    removalConflictList.length > 0;
  const isDirty = product ? !isSameAsServer(product, items) : false;

  const mutationKey = ['admin-product-images', actor, epoch, productId] as const;
  const isSaving = useIsMutating({ mutationKey }) > 0;
  const busy = isSaving || uploadingCount > 0 || checking || reloading;

  const updateDraftItems = (
    nextItems: DraftProductImageItem[],
    nextVersion = expectedVersion,
    nextConflict = conflictError,
    overrides?: {
      altConflicts?: Record<string, AltConflict>;
      orderConflict?: OrderConflict | null;
      removalConflicts?: Record<string, RemovalConflict>;
    },
  ) => {
    if (!product) return;
    const dirty = !isSameAsServer(product, nextItems);
    setStoredDraft((prev) => ({
      productId: product.id,
      baseVersion: prev?.baseVersion ?? product.imagesVersion ?? 0,
      expectedVersion: nextVersion,
      baseIds: prev?.baseIds ?? buildBaseIds(product),
      baseUrls: prev?.baseUrls ?? buildBaseUrls(product),
      baseAlts: prev?.baseAlts ?? buildBaseAlts(product),
      altConflicts: overrides?.altConflicts ?? prev?.altConflicts ?? {},
      orderConflict:
        overrides?.orderConflict !== undefined
          ? overrides.orderConflict
          : (prev?.orderConflict ?? null),
      removalConflicts: overrides?.removalConflicts ?? prev?.removalConflicts ?? {},
      items: nextItems,
      dirty,
      conflictError: nextConflict,
    }));
  };

  // Thao tác bộ ảnh: sửa alt, đưa lên đầu, chuyển lên, chuyển xuống, gỡ ảnh, khôi phục
  const setImageAlt = (id: string, alt: string) => {
    if (busy || uncertain) return;
    const { [id]: _resolved, ...remainingConflicts } = altConflicts;
    updateDraftItems(
      items.map((item) => (item.id === id ? { ...item, alt } : item)),
      expectedVersion,
      conflictError,
      { altConflicts: remainingConflicts },
    );
  };

  const resolveAltConflict = (id: string, choice: 'server' | 'draft') => {
    if (busy || uncertain) return;
    const conflict = altConflicts[id];
    if (!conflict) return;
    const { [id]: _resolved, ...remainingConflicts } = altConflicts;
    const nextItems =
      choice === 'server'
        ? items.map((item) => (item.id === id ? { ...item, alt: conflict.serverAlt ?? '' } : item))
        : items;
    updateDraftItems(nextItems, expectedVersion, conflictError, {
      altConflicts: remainingConflicts,
    });
  };

  const resolveOrderConflict = (choice: 'server' | 'draft') => {
    if (busy || uncertain || !orderConflict) return;
    if (choice === 'draft') {
      updateDraftItems(items, expectedVersion, conflictError, { orderConflict: null });
      return;
    }
    const byId = new Map(items.map((item) => [item.id, item]));
    const reordered: DraftProductImageItem[] = [];
    const placed = new Set<string>();
    for (const id of orderConflict.serverOrderIds) {
      const found = byId.get(id);
      if (found) {
        reordered.push(found);
        placed.add(id);
      }
    }
    for (const item of items) {
      if (!placed.has(item.id)) {
        reordered.push(item);
      }
    }
    updateDraftItems(reordered, expectedVersion, conflictError, { orderConflict: null });
  };

  const resolveRemovalConflict = (id: string, choice: 'remove' | 'restore') => {
    if (busy || uncertain) return;
    const conflict = removalConflicts[id];
    if (!conflict) return;
    const { [id]: _resolved, ...remainingRemoval } = removalConflicts;
    if (choice === 'remove') {
      const nextOrderConflict = orderConflict
        ? {
            ...orderConflict,
            serverOrderIds: orderConflict.serverOrderIds.filter((oid) => oid !== id),
          }
        : null;
      updateDraftItems(items, expectedVersion, conflictError, {
        removalConflicts: remainingRemoval,
        orderConflict: nextOrderConflict,
      });
      return;
    }
    const restoredItem: DraftProductImageItem = {
      id: conflict.id,
      url: conflict.url,
      alt: conflict.serverAlt ?? '',
      color: conflict.color,
    };
    const nextItems = items.some((i) => i.id === id) ? [...items] : [...items];
    if (!nextItems.some((i) => i.id === id)) {
      const insertAt = Math.min(Math.max(0, conflict.serverIndex), nextItems.length);
      nextItems.splice(insertAt, 0, restoredItem);
    }
    updateDraftItems(nextItems, expectedVersion, conflictError, {
      removalConflicts: remainingRemoval,
    });
  };

  const reorderImage = (fromIndex: number, toIndex: number) => {
    if (
      busy ||
      uncertain ||
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= items.length ||
      toIndex >= items.length
    ) {
      return;
    }
    const next = [...items];
    const [picked] = next.splice(fromIndex, 1);
    if (!picked) return;
    next.splice(toIndex, 0, picked);
    updateDraftItems(next, expectedVersion, conflictError, { orderConflict: null });
  };

  const moveImageUp = (index: number) => {
    if (index <= 0) return;
    reorderImage(index, index - 1);
  };

  const moveImageDown = (index: number) => {
    if (index >= items.length - 1) return;
    reorderImage(index, index + 1);
  };

  const promoteImageToFirst = (index: number) => {
    if (index <= 0) return;
    reorderImage(index, 0);
  };

  const removeImage = (id: string) => {
    if (busy || uncertain) return;
    const { [id]: _removed, ...remainingConflicts } = altConflicts;
    updateDraftItems(
      items.filter((item) => item.id !== id),
      expectedVersion,
      conflictError,
      { altConflicts: remainingConflicts },
    );
  };

  const resetDraft = () => {
    if (!product || busy || uncertain) return;
    setUploadErrors([]);
    setStoredDraft(() => null);
    clearNotice();
  };

  // Tải ảnh mới lên kho qua ticket product (dùng chung cho chọn tệp và kéo-thả tệp)
  const uploadFiles = async (files: readonly File[]) => {
    if (files.length === 0 || !product || busy || uncertain || uploadingRef.current) return;

    if (!uploadsEnabled) {
      showNotice({
        error: true,
        text: 'Máy chủ chưa cấu hình kho ảnh. Bạn vẫn có thể sửa mô tả, sắp xếp và gỡ ảnh hiện có.',
      });
      return;
    }

    const actorAtCall = actor;
    const epochAtCall = epoch;
    const accessAtCall = adminAccessGeneration(client, actorAtCall);
    const targetProductId = product.id;
    const isCurrent = () =>
      getSessionEpoch() === epochAtCall &&
      adminAccessGeneration(client, actorAtCall) === accessAtCall;

    const newErrors: FileUploadError[] = [];
    const validFiles: File[] = [];
    let projectedCount = items.length;

    for (const file of files) {
      if (projectedCount >= MAX_PRODUCT_IMAGES) {
        newErrors.push({
          id: crypto.randomUUID(),
          fileName: file.name,
          message: `Vượt quá giới hạn tối đa ${MAX_PRODUCT_IMAGES} ảnh cho mỗi sản phẩm.`,
        });
        continue;
      }
      const problem = validateUploadFile(file, uploadConfig);
      if (problem) {
        newErrors.push({
          id: crypto.randomUUID(),
          fileName: file.name,
          message: problem,
        });
        continue;
      }
      validFiles.push(file);
      projectedCount += 1;
    }

    setUploadErrors(newErrors);
    if (validFiles.length === 0) return;

    uploadingRef.current = true;
    setUploadingCount((c) => c + validFiles.length);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const uploadedItems: DraftProductImageItem[] = [];
    const runtimeErrors: FileUploadError[] = [...newErrors];

    try {
      for (const file of validFiles) {
        if (!isCurrent() || controller.signal.aborted) break;
        try {
          const ticket = await request<UploadTicketResponse>('/admin/products/upload-tickets', {
            method: 'POST',
            body: {},
            signal: controller.signal,
          });
          if (!isCurrent() || controller.signal.aborted) break;

          const form = new FormData();
          for (const [k, v] of Object.entries(ticket.fields)) {
            form.append(k, v);
          }
          form.append('file', file);
          await postExternalForm<unknown>(ticket.uploadUrl, form, controller.signal);
          if (!isCurrent() || controller.signal.aborted) break;

          uploadedItems.push({
            id: crypto.randomUUID(),
            key: ticket.key,
            url: createPreviewUrl(file),
            alt: '',
            color: null,
            isNew: true,
          });
        } catch (err) {
          if (!isCurrent()) return;
          if (err instanceof SessionChangedError) return;
          if (classifyRequestError(err, 'mutation') === 'forbidden') {
            markForbidden();
            return;
          }
          if (err instanceof DOMException && err.name === 'AbortError') return;
          runtimeErrors.push({
            id: crypto.randomUUID(),
            fileName: file.name,
            message:
              err instanceof ApiError && err.body.code === 'UPLOADS_DISABLED'
                ? 'Máy chủ chưa cấu hình kho ảnh.'
                : err instanceof ApiError && err.body.statusCode === 429
                  ? 'Bạn đã tải quá nhiều ảnh trong một giờ. Vui lòng thử lại sau.'
                  : 'Không tải được tệp lên kho ảnh. Kiểm tra kết nối và thử lại.',
          });
        }
      }

      if (!isCurrent()) return;
      if (mountedRef.current) {
        setUploadErrors(runtimeErrors);
      }

      if (uploadedItems.length > 0) {
        const draftKeyAtCall = adminCatalogKeys.imagesDraft(
          actorAtCall,
          epochAtCall,
          targetProductId,
        );
        client.setQueryData<StoredImagesDraft | null>(draftKeyAtCall, (prev) => {
          const baseItems = prev?.items ?? toDraftItems(product);
          const nextItems = [...baseItems, ...uploadedItems];
          return {
            productId: targetProductId,
            baseVersion: prev?.baseVersion ?? product.imagesVersion ?? 0,
            expectedVersion: prev?.expectedVersion ?? product.imagesVersion ?? 0,
            baseIds: prev?.baseIds ?? buildBaseIds(product),
            baseUrls: prev?.baseUrls ?? buildBaseUrls(product),
            baseAlts: prev?.baseAlts ?? buildBaseAlts(product),
            altConflicts: prev?.altConflicts ?? {},
            orderConflict: prev?.orderConflict ?? null,
            removalConflicts: prev?.removalConflicts ?? {},
            items: nextItems,
            dirty: true,
            conflictError: prev?.conflictError ?? null,
          };
        });
      }
    } finally {
      uploadingRef.current = false;
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      if (mountedRef.current) {
        setUploadingCount(0);
      }
    }
  };

  const handleFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    event.target.value = '';
    await uploadFiles(files);
  };

  const handleFilesDropped = async (fileList: FileList | null | undefined) => {
    if (!fileList || fileList.length === 0) return;
    await uploadFiles(Array.from(fileList));
  };

  // Lưu bộ ảnh (PUT /admin/products/:id/images)
  const saveMutation = useMutation({
    mutationKey,
    retry: 0,
    mutationFn: async ({
      targetProductId,
      payload,
      actorAtCall,
      epochAtCall,
      accessAtCall,
    }: {
      targetProductId: string;
      payload: UpdateProductImagesPayload;
      actorAtCall: string;
      epochAtCall: number;
      accessAtCall: number;
    }) => {
      if (
        getSessionEpoch() !== epochAtCall ||
        adminAccessGeneration(client, actorAtCall) !== accessAtCall
      ) {
        throw new SessionChangedError();
      }
      const lockKey = `${actorAtCall}:${epochAtCall}:${targetProductId}:images`;
      let locks = mediaLocks.get(client);
      if (!locks) {
        locks = new Set<string>();
        mediaLocks.set(client, locks);
      }
      if (locks.has(lockKey)) {
        throw new Error('Đang lưu bộ ảnh cho sản phẩm này.');
      }
      locks.add(lockKey);

      const controller = new AbortController();
      abortControllerRef.current = controller;
      const timer = setTimeout(() => {
        controller.abort(new DOMException('Hết thời gian chờ lưu bộ ảnh', 'TimeoutError'));
      }, PRODUCT_ACTION_TIMEOUT_MS);

      try {
        return await request<AdminProductImagesResult>(
          `/admin/products/${encodeURIComponent(targetProductId)}/images`,
          {
            method: 'PUT',
            body: payload,
            signal: controller.signal,
          },
        );
      } finally {
        clearTimeout(timer);
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        locks.delete(lockKey);
      }
    },
  });

  const handleSaveImages = async () => {
    if (!product || busy || uncertain || conflictError) return;

    // Validation tại client
    const hasNewPhotos = items.some((i) => Boolean(i.key));
    if (hasNewPhotos && items.length > MAX_PRODUCT_IMAGES) {
      showNotice({
        error: true,
        text: `Mỗi sản phẩm tối đa ${MAX_PRODUCT_IMAGES} ảnh khi tải thêm ảnh mới.`,
      });
      return;
    }
    if (items.length === 0 && product.isActive) {
      showNotice({
        error: true,
        text: 'Không thể gỡ ảnh cuối cùng khi sản phẩm đang mở bán. Vui lòng chuyển sản phẩm sang Ngừng bán trước.',
      });
      return;
    }
    if (items.some((i) => i.alt.trim().length > 200)) {
      showNotice({
        error: true,
        text: 'Mô tả thay thế (alt) của mỗi ảnh tối đa 200 ký tự.',
      });
      return;
    }

    const actorAtCall = actor;
    const epochAtCall = epoch;
    const accessAtCall = adminAccessGeneration(client, actorAtCall);
    const targetProductId = product.id;
    const targetProductSlug = product.slug;
    const isCurrent = () =>
      getSessionEpoch() === epochAtCall &&
      adminAccessGeneration(client, actorAtCall) === accessAtCall;

    const payload: UpdateProductImagesPayload = {
      expectedVersion,
      items: items.map((item) => ({
        id: item.id,
        ...(item.key ? { key: item.key } : {}),
        alt: normalizeAlt(item.alt),
      })),
    };
    const snapshotDraftItems = items.map((item) => ({ ...item }));
    const opId = Date.now();
    const uncertainKeyAtCall = adminCatalogKeys.uncertainImagesUpdate(
      actorAtCall,
      epochAtCall,
      targetProductId,
    );
    const draftKeyAtCall = adminCatalogKeys.imagesDraft(actorAtCall, epochAtCall, targetProductId);

    // Ghi giữ bản nháp trong cache trước khi gửi để điều hướng đi/về vẫn còn
    client.setQueryData<StoredImagesDraft | null>(draftKeyAtCall, (prev) => ({
      productId: targetProductId,
      baseVersion: prev?.baseVersion ?? currentDraft?.baseVersion ?? product.imagesVersion ?? 0,
      expectedVersion,
      baseIds: prev?.baseIds ?? currentDraft?.baseIds ?? buildBaseIds(product),
      baseUrls: prev?.baseUrls ?? currentDraft?.baseUrls ?? buildBaseUrls(product),
      baseAlts: prev?.baseAlts ?? currentDraft?.baseAlts ?? buildBaseAlts(product),
      altConflicts: prev?.altConflicts ?? currentDraft?.altConflicts ?? {},
      orderConflict: prev?.orderConflict ?? currentDraft?.orderConflict ?? null,
      removalConflicts: prev?.removalConflicts ?? currentDraft?.removalConflicts ?? {},
      items: snapshotDraftItems,
      dirty: true,
      conflictError: null,
    }));
    client.setQueryData<UncertainImagesUpdate | null>(uncertainKeyAtCall, () => ({
      operationId: opId,
      productId: targetProductId,
      payload,
      draftItems: snapshotDraftItems,
      status: 'pending',
    }));

    try {
      const updated = await saveMutation.mutateAsync({
        targetProductId,
        payload,
        actorAtCall,
        epochAtCall,
        accessAtCall,
      });

      if (!isCurrent()) return;

      client.setQueryData<UncertainImagesUpdate | null>(uncertainKeyAtCall, (prev) =>
        !prev || prev.operationId === opId ? null : prev,
      );

      const sawNewer = hasNewerImages(client, actorAtCall, targetProductId, updated.imagesVersion);
      await client.cancelQueries({ queryKey: adminCatalogKeys.all(actorAtCall) });
      if (!isCurrent()) return;

      bumpDetailGeneration(client, actorAtCall, targetProductId);
      client.setQueryData<AdminCatalogDetail>(
        adminCatalogKeys.detail(actorAtCall, targetProductId),
        (old) => {
          if (!old || (old.imagesVersion ?? 0) > updated.imagesVersion) return old;
          return {
            ...old,
            imageUrl: updated.imageUrl,
            imagesVersion: updated.imagesVersion,
            imagesManagedByAdmin: updated.imagesManagedByAdmin,
            images: updated.images,
          };
        },
      );
      client.setQueryData<StoredImagesDraft | null>(draftKeyAtCall, null);

      await Promise.all([
        client.resetQueries({ queryKey: adminCatalogKeys.lists(actorAtCall) }),
        client.invalidateQueries({
          queryKey: adminCatalogKeys.detail(actorAtCall, targetProductId),
        }),
        client.invalidateQueries({ queryKey: productKeys.all }),
        client.invalidateQueries({ queryKey: productKeys.detail(targetProductSlug) }),
      ]);
      if (!isCurrent()) return;

      if (mountedRef.current && productId === targetProductId) {
        setUploadErrors([]);
        showNotice({
          text:
            sawNewer || hasNewerImages(client, actorAtCall, targetProductId, updated.imagesVersion)
              ? 'Đã xử lý yêu cầu lưu ảnh, nhưng sản phẩm có phiên bản ảnh mới hơn. Vui lòng kiểm tra dữ liệu vừa tải lại.'
              : 'Đã lưu bộ ảnh sản phẩm. Toàn bộ thứ tự và thành phần ảnh được bảo vệ qua các lần nhập dữ liệu sau.',
        });
        noticeRef.current?.focus();
      }
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof SessionChangedError) return;
      const kind = classifyRequestError(error, 'mutation');
      if (kind === 'forbidden') {
        markForbidden();
        return;
      }

      const code = error instanceof ApiError ? error.body.code : undefined;
      if (kind === 'conflict' && code !== 'PRODUCT_IMAGE_CONFLICT') {
        client.setQueryData<UncertainImagesUpdate | null>(uncertainKeyAtCall, (prev) =>
          !prev || prev.operationId === opId ? null : prev,
        );
        await client.cancelQueries({ queryKey: adminCatalogKeys.all(actorAtCall) });
        if (!isCurrent()) return;
        const msg =
          'Bộ ảnh đã thay đổi trên máy chủ (409). Bản nháp của bạn được giữ lại; hãy tải dữ liệu mới nhất để đối chiếu trước khi lưu.';
        client.setQueryData<StoredImagesDraft | null>(draftKeyAtCall, (prev) => ({
          productId: targetProductId,
          baseVersion: prev?.baseVersion ?? expectedVersion,
          expectedVersion,
          baseIds: prev?.baseIds ?? currentDraft?.baseIds ?? buildBaseIds(product),
          baseUrls: prev?.baseUrls ?? currentDraft?.baseUrls ?? buildBaseUrls(product),
          baseAlts: prev?.baseAlts ?? currentDraft?.baseAlts ?? buildBaseAlts(product),
          altConflicts: prev?.altConflicts ?? currentDraft?.altConflicts ?? {},
          orderConflict: prev?.orderConflict ?? currentDraft?.orderConflict ?? null,
          removalConflicts: prev?.removalConflicts ?? currentDraft?.removalConflicts ?? {},
          items: prev?.items ?? snapshotDraftItems,
          dirty: true,
          conflictError: msg,
        }));
        if (mountedRef.current && productId === targetProductId) {
          showNotice({ error: true, text: msg });
          noticeRef.current?.focus();
        }
        return;
      }

      const status = error instanceof ApiError ? error.body.statusCode : 0;
      if (status >= 400 && status < 500) {
        client.setQueryData<UncertainImagesUpdate | null>(uncertainKeyAtCall, (prev) =>
          !prev || prev.operationId === opId ? null : prev,
        );
        if (mountedRef.current && productId === targetProductId) {
          showNotice({ error: true, text: imagesMutationErrorText(error) });
          noticeRef.current?.focus();
        }
        return;
      }

      // Timeout / mất kết nối / 5xx -> Giữ nguyên draft + expectedVersion + uncertain marker qua điều hướng
      client.setQueryData<UncertainImagesUpdate | null>(uncertainKeyAtCall, (prev) =>
        !prev || prev.operationId === opId
          ? {
              operationId: opId,
              productId: targetProductId,
              payload,
              draftItems: snapshotDraftItems,
              status: 'uncertain',
            }
          : prev,
      );
      if (mountedRef.current && productId === targetProductId) {
        showNotice({
          error: true,
          recheck: true,
          text: 'Chưa xác định kết quả lưu bộ ảnh từ máy chủ. Bản nháp đã gửi được giữ lại; hãy bấm Đối chiếu bộ ảnh để kiểm tra kết quả (không tự động gửi lại).',
        });
        noticeRef.current?.focus();
      }
    }
  };

  // Tải bản mới nhất khi gặp 409 Conflict (giữ nguyên draft để người dùng xem & lưu lại với version mới)
  const reloadAfterConflict = async () => {
    if (!product || reloading || checking) return;
    const actorAtCall = actor;
    const epochAtCall = epoch;
    const accessAtCall = adminAccessGeneration(client, actorAtCall);
    const targetProductId = product.id;
    const isCurrent = () =>
      getSessionEpoch() === epochAtCall &&
      adminAccessGeneration(client, actorAtCall) === accessAtCall;

    setReloading(true);
    try {
      await client.cancelQueries({
        queryKey: adminCatalogKeys.detail(actorAtCall, targetProductId),
      });
      if (!isCurrent()) return;

      const fresh = await client.fetchQuery({
        queryKey: adminCatalogKeys.detail(actorAtCall, targetProductId),
        queryFn: ({ signal }) =>
          guardQuery(() =>
            request<AdminCatalogDetail>(`/admin/products/${encodeURIComponent(targetProductId)}`, {
              signal,
            }),
          ),
        staleTime: 0,
        retry: false,
      });
      if (!isCurrent()) return;

      const draftKeyAtCall = adminCatalogKeys.imagesDraft(
        actorAtCall,
        epochAtCall,
        targetProductId,
      );
      const freshSorted = [...fresh.images].sort((a, b) => a.sortOrder - b.sortOrder);
      const serverIds = new Set(freshSorted.map((i) => i.id));
      const serverById = new Map(freshSorted.map((i) => [i.id, i]));
      const nextBaseIds = buildBaseIds(fresh);
      const nextBaseUrls = buildBaseUrls(fresh);
      const nextBaseAlts = buildBaseAlts(fresh);
      let altConflictCount = 0;
      let hasOrderConflict = false;
      let removalConflictCount = 0;

      client.setQueryData<StoredImagesDraft | null>(draftKeyAtCall, (prev) => {
        const currentItems = prev?.items ?? items;
        const prevBaseIds = prev?.baseIds ?? buildBaseIds(product);
        const prevBaseIdSet = new Set(prevBaseIds);
        const prevBaseUrls = prev?.baseUrls ?? buildBaseUrls(product);
        const prevBaseAlts = prev?.baseAlts ?? buildBaseAlts(product);
        const nextAltConflicts: Record<string, AltConflict> = {};
        const nextRemovalConflicts: Record<string, RemovalConflict> = {};

        // 1. Gộp từng ảnh giữ lại theo alt (baseline vs bản nháp vs máy chủ)
        const keptDraft = currentItems
          .filter((item) => Boolean(item.key) || serverIds.has(item.id))
          .map((item) => {
            if (item.key) return item;
            const srv = serverById.get(item.id);
            if (!srv) return item;

            const draftAlt = normalizeAlt(item.alt);
            const serverAlt = normalizeAlt(srv.alt);
            const hasBase = Object.hasOwn(prevBaseAlts, item.id);
            const baseAlt = hasBase ? (prevBaseAlts[item.id] ?? null) : draftAlt;
            const userChangedAlt = draftAlt !== baseAlt;
            const serverChangedAlt = serverAlt !== baseAlt;
            const baseUrl = prevBaseUrls[item.id];
            const serverReplacedUrl = baseUrl !== undefined && srv.url !== baseUrl;

            let mergedAlt = item.alt;
            if (!userChangedAlt) {
              mergedAlt = srv.alt ?? '';
            } else if ((serverChangedAlt || serverReplacedUrl) && draftAlt !== serverAlt) {
              nextAltConflicts[item.id] = { serverAlt, urlChanged: serverReplacedUrl };
            }

            return { ...item, url: srv.url, alt: mergedAlt, color: srv.color };
          });

        const draftKeptIdSet = new Set(keptDraft.map((i) => i.id));

        // 2. Phân biệt ảnh máy chủ mới thêm sau baseline vs ảnh admin hiện tại chủ động gỡ
        const cleanRemovedIds = new Set<string>();
        for (const baseId of prevBaseIds) {
          if (!serverIds.has(baseId) || draftKeptIdSet.has(baseId)) continue;
          const srv = serverById.get(baseId);
          if (!srv) continue;
          const serverAlt = normalizeAlt(srv.alt);
          const baseAlt = prevBaseAlts[baseId] ?? null;
          const serverEditedAlt = serverAlt !== baseAlt;
          const baseUrl = prevBaseUrls[baseId];
          const serverReplacedUrl = baseUrl !== undefined && srv.url !== baseUrl;
          const serverPromotedPrimary = freshSorted[0]?.id === baseId && prevBaseIds[0] !== baseId;
          if (serverEditedAlt || serverReplacedUrl || serverPromotedPrimary) {
            const srvIdx = freshSorted.findIndex((i) => i.id === baseId);
            nextRemovalConflicts[baseId] = {
              id: baseId,
              url: srv.url,
              serverAlt,
              color: srv.color,
              serverIndex: srvIdx >= 0 ? srvIdx : freshSorted.length,
              urlChanged: serverReplacedUrl,
            };
          } else {
            cleanRemovedIds.add(baseId);
          }
        }

        const addedOnServer = freshSorted
          .filter((srv) => !prevBaseIdSet.has(srv.id) && !draftKeptIdSet.has(srv.id))
          .map((srv) => ({
            id: srv.id,
            url: srv.url,
            alt: srv.alt ?? '',
            color: srv.color,
          }));

        // 3. Gộp thứ tự ba chiều (baseline vs bản nháp vs máy chủ)
        const baseSurvivingIds = prevBaseIds.filter(
          (id) =>
            serverIds.has(id) &&
            !cleanRemovedIds.has(id) &&
            !Object.hasOwn(nextRemovalConflicts, id),
        );
        const draftUploadedItems = keptDraft.filter((item) => Boolean(item.key));
        const draftUploadedIds = draftUploadedItems.map((i) => i.id);
        const addedOnServerIds = addedOnServer.map((i) => i.id);

        const keptDraftIds = keptDraft.map((i) => i.id);
        const freshActiveItems = freshSorted.filter(
          (srv) => !cleanRemovedIds.has(srv.id) && !Object.hasOwn(nextRemovalConflicts, srv.id),
        );
        const freshActiveIds = freshActiveItems.map((i) => i.id);

        const userChangedOrder = !sameIdOrder(keptDraftIds, [
          ...baseSurvivingIds,
          ...draftUploadedIds,
        ]);
        const serverChangedOrder = !sameIdOrder(freshActiveIds, [
          ...baseSurvivingIds,
          ...addedOnServerIds,
        ]);

        const mergedById = new Map<string, DraftProductImageItem>();
        for (const item of keptDraft) mergedById.set(item.id, item);
        for (const item of addedOnServer) mergedById.set(item.id, item);

        const draftFirstIds = [...keptDraftIds, ...addedOnServerIds];
        const serverFirstIds = [...freshActiveIds, ...draftUploadedIds];

        let chosenOrderIds: string[];
        let nextOrderConflict: OrderConflict | null = null;
        if (!userChangedOrder) {
          chosenOrderIds = serverFirstIds;
        } else if (!serverChangedOrder || sameIdOrder(draftFirstIds, serverFirstIds)) {
          chosenOrderIds = draftFirstIds;
        } else {
          chosenOrderIds = draftFirstIds;
          const serverFirst = serverFirstIds[0] ? mergedById.get(serverFirstIds[0]) : undefined;
          nextOrderConflict = {
            serverOrderIds: serverFirstIds,
            serverPrimaryLabel:
              serverFirst?.alt.trim() ||
              serverFirst?.color?.name ||
              'Ảnh đại diện mới trên máy chủ',
          };
        }

        const mergedItems = chosenOrderIds
          .map((id) => mergedById.get(id))
          .filter((item): item is DraftProductImageItem => Boolean(item));

        altConflictCount = Object.keys(nextAltConflicts).length;
        hasOrderConflict = Boolean(nextOrderConflict);
        removalConflictCount = Object.keys(nextRemovalConflicts).length;

        return {
          productId: targetProductId,
          baseVersion: fresh.imagesVersion ?? 0,
          expectedVersion: fresh.imagesVersion ?? 0,
          baseIds: nextBaseIds,
          baseUrls: nextBaseUrls,
          baseAlts: nextBaseAlts,
          altConflicts: nextAltConflicts,
          orderConflict: nextOrderConflict,
          removalConflicts: nextRemovalConflicts,
          items: mergedItems,
          dirty: !isSameAsServer(fresh, mergedItems) || removalConflictCount > 0,
          conflictError: null,
        };
      });

      if (mountedRef.current && productId === targetProductId) {
        const totalConflicts = altConflictCount + (hasOrderConflict ? 1 : 0) + removalConflictCount;
        showNotice(
          totalConflicts > 0
            ? {
                error: true,
                text: `Đã tải dữ liệu mới nhất (phiên bản ${fresh.imagesVersion ?? 0}). Còn ${totalConflicts} xung đột (mô tả alt / thứ tự / gỡ ảnh); hãy chọn phương án giữ lại trước khi lưu.`,
              }
            : {
                text: `Đã tải dữ liệu mới nhất (phiên bản ${fresh.imagesVersion ?? 0}). Kiểm tra lại bản nháp của bạn rồi bấm Lưu bộ ảnh hoặc Khôi phục theo máy chủ.`,
              },
        );
      }
    } catch (error) {
      if (!isCurrent()) return;
      if (classifyRequestError(error, 'detail') === 'forbidden') {
        markForbidden();
        return;
      }
      if (mountedRef.current && productId === targetProductId) {
        showNotice({
          error: true,
          text: 'Chưa tải được dữ liệu ảnh mới nhất từ máy chủ. Kiểm tra kết nối rồi thử lại.',
        });
      }
    } finally {
      if (mountedRef.current) {
        setReloading(false);
      }
    }
  };

  // Đối chiếu GET theo ảnh (id ổn định), thứ tự, alt và phiên bản sau khi lưu bị timeout / mất kết nối.
  // Tuyệt đối không tự động gửi lại PUT.
  const recheckUncertain = async () => {
    if (!uncertain || checking) return;
    const snapshot = uncertain;
    const actorAtCall = actor;
    const epochAtCall = epoch;
    const accessAtCall = adminAccessGeneration(client, actorAtCall);
    const targetProductId = snapshot.productId;
    const isCurrent = () =>
      getSessionEpoch() === epochAtCall &&
      adminAccessGeneration(client, actorAtCall) === accessAtCall;

    const uncertainKeyAtCall = adminCatalogKeys.uncertainImagesUpdate(
      actorAtCall,
      epochAtCall,
      targetProductId,
    );
    const draftKeyAtCall = adminCatalogKeys.imagesDraft(actorAtCall, epochAtCall, targetProductId);
    const detailKey = adminCatalogKeys.detail(actorAtCall, targetProductId);

    setChecking(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timer = setTimeout(() => {
      controller.abort(
        new DOMException('Hết thời gian chờ đối chiếu bộ ảnh từ máy chủ', 'TimeoutError'),
      );
    }, PRODUCT_ACTION_TIMEOUT_MS);

    try {
      const genAtStart = getDetailGeneration(client, actorAtCall, targetProductId);
      const updatedAtAtStart = client.getQueryState(detailKey)?.dataUpdatedAt ?? 0;
      void client.cancelQueries({ queryKey: detailKey });

      const fresh = await request<AdminCatalogDetail>(
        `/admin/products/${encodeURIComponent(targetProductId)}`,
        { signal: controller.signal },
      );
      if (!isCurrent()) return;

      const isCacheFresh =
        getDetailGeneration(client, actorAtCall, targetProductId) === genAtStart &&
        (client.getQueryState(detailKey)?.dataUpdatedAt ?? 0) === updatedAtAtStart;
      if (isCacheFresh) {
        client.setQueryData(detailKey, fresh);
      }

      const freshVersion = fresh.imagesVersion ?? 0;
      const matchesPayload = matchesExpectedImages(fresh, snapshot.payload);

      if (matchesPayload && freshVersion >= snapshot.payload.expectedVersion) {
        // Máy chủ đã ghi nhận đúng bộ ảnh, thứ tự và alt đã gửi!
        client.setQueryData<UncertainImagesUpdate | null>(uncertainKeyAtCall, (prev) =>
          !prev || prev.operationId === snapshot.operationId ? null : prev,
        );
        client.setQueryData<StoredImagesDraft | null>(draftKeyAtCall, null);
        await client.resetQueries({ queryKey: adminCatalogKeys.lists(actorAtCall) });
        if (!isCurrent()) return;

        if (mountedRef.current && productId === targetProductId) {
          showNotice({
            text: 'Đã đối chiếu: bộ ảnh bạn gửi đã được lưu thành công trên máy chủ.',
          });
          noticeRef.current?.focus();
        }
        return;
      }

      if (freshVersion === snapshot.payload.expectedVersion) {
        // Máy chủ vẫn ở expectedVersion cũ và chưa áp dụng thay đổi -> giải phóng marker chờ đối chiếu nhưng giữ nguyên bản nháp và phiên bản để người dùng chủ động bấm Lưu lại (không tự động gửi lại!)
        client.setQueryData<UncertainImagesUpdate | null>(uncertainKeyAtCall, (prev) =>
          !prev || prev.operationId === snapshot.operationId ? null : prev,
        );
        client.setQueryData<StoredImagesDraft | null>(draftKeyAtCall, (prev) => ({
          productId: targetProductId,
          baseVersion: freshVersion,
          expectedVersion: freshVersion,
          baseIds: buildBaseIds(fresh),
          baseUrls: buildBaseUrls(fresh),
          baseAlts: buildBaseAlts(fresh),
          altConflicts: prev?.altConflicts ?? {},
          orderConflict: prev?.orderConflict ?? null,
          removalConflicts: prev?.removalConflicts ?? {},
          items: snapshot.draftItems,
          dirty: true,
          conflictError: null,
        }));
        if (mountedRef.current && productId === targetProductId) {
          showNotice({
            text: 'Đã đối chiếu: máy chủ chưa ghi nhận thay đổi vừa gửi. Bản nháp của bạn vẫn được giữ nguyên; bạn có thể kiểm tra và bấm Lưu bộ ảnh khi sẵn sàng.',
          });
          noticeRef.current?.focus();
        }
        return;
      }

      // Máy chủ đã sang phiên bản mới hơn với bộ ảnh khác -> chuyển sang trạng thái xung đột giữ draft
      client.setQueryData<UncertainImagesUpdate | null>(uncertainKeyAtCall, (prev) =>
        !prev || prev.operationId === snapshot.operationId ? null : prev,
      );
      const conflictMsg =
        'Máy chủ đã có phiên bản bộ ảnh mới hơn từ thao tác khác. Bản nháp của bạn được giữ lại; hãy bấm Tải dữ liệu mới nhất để đối chiếu trước khi lưu.';
      client.setQueryData<StoredImagesDraft | null>(draftKeyAtCall, (prev) => ({
        productId: targetProductId,
        baseVersion: prev?.baseVersion ?? snapshot.payload.expectedVersion,
        expectedVersion: snapshot.payload.expectedVersion,
        baseIds: prev?.baseIds ?? buildBaseIds(fresh),
        baseUrls: prev?.baseUrls ?? buildBaseUrls(fresh),
        baseAlts: prev?.baseAlts ?? buildBaseAlts(fresh),
        altConflicts: prev?.altConflicts ?? {},
        orderConflict: prev?.orderConflict ?? null,
        removalConflicts: prev?.removalConflicts ?? {},
        items: snapshot.draftItems,
        dirty: true,
        conflictError: conflictMsg,
      }));
      if (mountedRef.current && productId === targetProductId) {
        showNotice({
          error: true,
          text: conflictMsg,
        });
        noticeRef.current?.focus();
      }
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof SessionChangedError) return;
      if (classifyRequestError(error, 'detail') === 'forbidden') {
        markForbidden();
        return;
      }
      if (error instanceof DOMException && error.name === 'AbortError') return;
      // Khi GET đối chiếu thất bại, tiếp tục giữ bản nháp và uncertain marker
      if (mountedRef.current && productId === targetProductId) {
        showNotice({
          error: true,
          recheck: true,
          text: 'Chưa đối chiếu được trạng thái bộ ảnh từ máy chủ. Bản nháp vẫn được giữ lại; vui lòng thử đối chiếu lại.',
        });
      }
    } finally {
      clearTimeout(timer);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      if (mountedRef.current) {
        setChecking(false);
      }
    }
  };

  const activeNotice: MediaNotice | null =
    uncertain && !scopedNotice?.recheck
      ? {
          key: `uncertain-images-${uncertain.operationId}`,
          error: true,
          recheck: true,
          text: 'Có thao tác lưu bộ ảnh chưa xác định kết quả từ máy chủ. Bản nháp của bạn vẫn được giữ lại; hãy đối chiếu trạng thái trước khi thao tác tiếp.',
        }
      : scopedNotice;

  return {
    items,
    expectedVersion,
    isDirty,
    busy,
    isSaving,
    uploadingCount,
    checking,
    reloading,
    conflictError,
    altConflicts,
    orderConflict,
    removalConflictList,
    hasMediaConflicts,
    uncertain,
    uploadsEnabled,
    uploadConfig,
    uploadErrors,
    dismissUploadErrors: () => setUploadErrors([]),
    notice: activeNotice,
    noticeRef,
    sessionScope,
    clearNotice,
    setImageAlt,
    resolveAltConflict,
    resolveOrderConflict,
    resolveRemovalConflict,
    reorderImage,
    moveImageUp,
    moveImageDown,
    promoteImageToFirst,
    removeImage,
    resetDraft,
    handleFilesSelected,
    handleFilesDropped,
    handleSaveImages,
    reloadAfterConflict,
    recheckUncertain,
  };
}

export type ProductMediaAction = ReturnType<typeof useProductMediaAction>;

export function ProductMediaFeedback({ action }: { action: ProductMediaAction }) {
  const { notice, noticeRef, sessionScope, clearNotice, checking, recheckUncertain, uncertain } =
    action;
  const tone = notice?.recheck ? 'warning' : notice?.error ? 'error' : 'success';
  return (
    <div ref={noticeRef} tabIndex={-1} className={styles.noticeSlot}>
      {notice && (
        <ActionFeedback
          noticeKey={notice.key}
          sessionScope={sessionScope}
          tone={tone}
          message={notice.text}
          onDismiss={clearNotice}
          action={
            notice.recheck || uncertain
              ? {
                  label: checking ? 'Đang đối chiếu…' : 'Đối chiếu bộ ảnh',
                  onClick: () => void recheckUncertain(),
                  disabled: checking,
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

export function ProductMediaSection({
  product,
  action,
}: {
  product: AdminCatalogDetail;
  action: ProductMediaAction;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);

  const {
    items,
    expectedVersion,
    isDirty,
    busy,
    isSaving,
    uploadingCount,
    reloading,
    conflictError,
    altConflicts,
    orderConflict,
    removalConflictList,
    hasMediaConflicts,
    uncertain,
    uploadsEnabled,
    uploadErrors,
    setImageAlt,
    resolveAltConflict,
    resolveOrderConflict,
    resolveRemovalConflict,
    reorderImage,
    moveImageUp,
    moveImageDown,
    promoteImageToFirst,
    removeImage,
    resetDraft,
    handleFilesSelected,
    handleFilesDropped,
    handleSaveImages,
    reloadAfterConflict,
  } = action;

  const controlsLocked = busy || Boolean(uncertain);
  const canAddMore = uploadsEnabled && items.length < MAX_PRODUCT_IMAGES && !controlsLocked;
  const canReorderDrag = !controlsLocked;

  const hasFilesTransfer = (e: DragEvent<HTMLElement>): boolean =>
    Array.from(e.dataTransfer?.types ?? []).includes('Files');

  const beginDrag = (e: DragEvent<HTMLElement>, index: number) => {
    if (!canReorderDrag) {
      e.preventDefault();
      return;
    }
    setDragIndex(index);
    setDropIndex(index);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    }
  };

  const hoverItemDrag = (e: DragEvent<HTMLElement>, targetIndex: number) => {
    if (hasFilesTransfer(e)) {
      if (canAddMore) {
        e.preventDefault();
        setFileDragOver(true);
      }
      return;
    }
    if (!canReorderDrag) return;
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    if (dropIndex !== targetIndex) {
      setDropIndex(targetIndex);
    }
  };

  const leaveItemDrag = (e: DragEvent<HTMLElement>, targetIndex: number) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setFileDragOver(false);
      setDropIndex((prev) => (prev === targetIndex ? null : prev));
    }
  };

  const dropOnItem = (e: DragEvent<HTMLElement>, targetIndex: number) => {
    const droppedFiles = e.dataTransfer?.files;
    if (droppedFiles && droppedFiles.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      setFileDragOver(false);
      setDragIndex(null);
      setDropIndex(null);
      if (canAddMore) {
        void handleFilesDropped(droppedFiles);
      }
      return;
    }
    if (!canReorderDrag) return;
    e.preventDefault();
    e.stopPropagation();
    const raw = e.dataTransfer?.getData('text/plain') ?? '';
    const sourceIndex = dragIndex ?? (raw ? Number.parseInt(raw, 10) : Number.NaN);
    setDragIndex(null);
    setDropIndex(null);
    if (Number.isInteger(sourceIndex)) {
      reorderImage(sourceIndex, targetIndex);
    }
  };

  const endDrag = () => {
    setDragIndex(null);
    setDropIndex(null);
    setFileDragOver(false);
  };

  const jumpToCard = (id: string) => {
    const input = document.getElementById(`media-alt-${id}`) as HTMLInputElement | null;
    if (input) {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input.focus();
    }
  };

  return (
    <section aria-labelledby="catalog-images" className={styles.section}>
      <div className={styles.mediaHeader}>
        <div>
          <h2 id="catalog-images" className={styles.panelTitle}>
            Hình ảnh ({items.length})
          </h2>
          <p className={styles.hint}>
            Ảnh đầu tiên là ảnh đại diện trên cửa hàng · Phiên bản bộ ảnh: {expectedVersion} ·{' '}
            {product.imagesManagedByAdmin
              ? 'Đang do quản trị viên quản lý (bảo vệ qua import)'
              : 'Đang theo dữ liệu nguồn'}
            {items.length > MAX_PRODUCT_IMAGES &&
              ` · Bộ ảnh cũ (${items.length} ảnh) vượt giới hạn ${MAX_PRODUCT_IMAGES} ảnh: vẫn sửa mô tả, đổi thứ tự và gỡ được`}
          </p>
        </div>

        <div className={styles.mediaToolbar}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className={styles.fileInput}
            aria-label="Chọn tệp ảnh sản phẩm để tải lên"
            disabled={!canAddMore}
            onChange={(e) => void handleFilesSelected(e)}
          />
          <button
            type="button"
            className={styles.statusButton}
            disabled={!canAddMore}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadingCount > 0 ? `Đang tải ảnh (${uploadingCount})…` : '+ Tải ảnh lên'}
          </button>
          {isDirty && (
            <button
              type="button"
              className={styles.statusButton}
              disabled={controlsLocked}
              onClick={resetDraft}
            >
              Khôi phục bộ ảnh
            </button>
          )}
          <button
            type="button"
            className={styles.statusButton}
            data-primary={
              isDirty && !controlsLocked && !conflictError && !hasMediaConflicts
                ? 'true'
                : undefined
            }
            disabled={!isDirty || controlsLocked || Boolean(conflictError) || hasMediaConflicts}
            onClick={() => void handleSaveImages()}
          >
            {isSaving ? 'Đang lưu bộ ảnh…' : 'Lưu bộ ảnh'}
          </button>
        </div>
      </div>

      {!uploadsEnabled && (
        <p role="status" className={styles.storageNote}>
          Kho ảnh chưa được cấu hình trên máy chủ. Bạn vẫn có thể sửa mô tả thay thế, đổi thứ tự,
          đưa ảnh lên đầu và gỡ các ảnh hiện có.
        </p>
      )}

      {conflictError && (
        <div role="alert" className={styles.conflictAlert}>
          <p>{conflictError}</p>
          <div className={styles.actionGroup}>
            <button
              type="button"
              className={styles.statusButton}
              disabled={reloading}
              onClick={() => void reloadAfterConflict()}
            >
              {reloading ? 'Đang tải…' : 'Tải dữ liệu mới nhất'}
            </button>
            <button
              type="button"
              className={styles.statusButton}
              disabled={reloading}
              onClick={resetDraft}
            >
              Bỏ bản nháp, dùng bản máy chủ
            </button>
          </div>
        </div>
      )}

      {orderConflict && (
        <div role="alert" className={styles.conflictAlert}>
          <p>
            Thứ tự bộ ảnh vừa thay đổi đồng thời trên máy chủ (ảnh đại diện #1 trên máy chủ:{' '}
            <strong>{orderConflict.serverPrimaryLabel}</strong>). Vui lòng chọn thứ tự muốn giữ
            trước khi lưu:
          </p>
          <div className={styles.actionGroup}>
            <button
              type="button"
              className={styles.statusButton}
              disabled={controlsLocked}
              onClick={() => resolveOrderConflict('server')}
            >
              Dùng thứ tự máy chủ
            </button>
            <button
              type="button"
              className={styles.statusButton}
              disabled={controlsLocked}
              onClick={() => resolveOrderConflict('draft')}
            >
              Giữ thứ tự đang soạn
            </button>
          </div>
        </div>
      )}

      {removalConflictList.map((conflict) => (
        <div key={conflict.id} role="alert" className={styles.conflictAlert}>
          <p>
            {conflict.urlChanged
              ? 'Ảnh bạn đã gỡ vừa được máy chủ thay bằng tệp ảnh mới (giữ nguyên ID; mô tả hiện tại: '
              : 'Ảnh bạn đã gỡ vừa được chỉnh sửa trên máy chủ (mô tả hiện tại: '}
            <strong>{conflict.serverAlt ?? '(trống)'}</strong>):
          </p>
          <div className={styles.actionGroup}>
            <button
              type="button"
              className={styles.statusButton}
              disabled={controlsLocked}
              onClick={() => resolveRemovalConflict(conflict.id, 'remove')}
            >
              Vẫn gỡ ảnh này
            </button>
            <button
              type="button"
              className={styles.statusButton}
              disabled={controlsLocked}
              onClick={() => resolveRemovalConflict(conflict.id, 'restore')}
            >
              Giữ lại ảnh từ máy chủ
            </button>
          </div>
        </div>
      ))}

      {uploadErrors.length > 0 && (
        <ul role="alert" aria-label="Lỗi tải ảnh lên" className={styles.uploadErrorList}>
          {uploadErrors.map((err) => (
            <li key={err.id}>
              <strong>{err.fileName}:</strong> {err.message}
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 ? (
        <div
          className={styles.mediaDropEmpty}
          data-drop-active={fileDragOver ? 'true' : undefined}
          onDragOver={(e) => {
            if (canAddMore && hasFilesTransfer(e)) {
              e.preventDefault();
              setFileDragOver(true);
            }
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setFileDragOver(false);
            }
          }}
          onDrop={(e) => {
            if (e.dataTransfer?.files?.length) {
              e.preventDefault();
              e.stopPropagation();
              setFileDragOver(false);
              if (canAddMore) void handleFilesDropped(e.dataTransfer.files);
            }
          }}
        >
          <Empty label="Chưa có ảnh." />
          {canAddMore && (
            <button
              type="button"
              className={styles.statusButton}
              onClick={() => fileInputRef.current?.click()}
            >
              Kéo thả ảnh vào đây hoặc bấm để chọn tệp
            </button>
          )}
        </div>
      ) : (
        <>
          <div
            className={styles.mediaQuickBar}
            data-drop-active={fileDragOver ? 'true' : undefined}
            onDragOver={(e) => {
              if (canAddMore && hasFilesTransfer(e)) {
                e.preventDefault();
                setFileDragOver(true);
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setFileDragOver(false);
              }
            }}
            onDrop={(e) => {
              if (e.dataTransfer?.files?.length) {
                e.preventDefault();
                e.stopPropagation();
                setFileDragOver(false);
                if (canAddMore) void handleFilesDropped(e.dataTransfer.files);
              }
            }}
          >
            <div className={styles.mediaQuickHead}>
              <span className={styles.mediaQuickTitle}>Sắp xếp nhanh</span>
              <span className={styles.hint}>
                Kéo thả ảnh trực tiếp để đổi thứ tự hoặc đưa lên vị trí #1 · Bấm vào ô để tới phần
                mô tả
              </span>
            </div>
            <div className={styles.mediaQuickStrip}>
              {items.map((img, index) => {
                const position = index + 1;
                const isPrimary = index === 0;
                return (
                  <button
                    key={img.id}
                    type="button"
                    className={styles.mediaQuickTile}
                    data-primary={isPrimary ? 'true' : undefined}
                    data-dragging={dragIndex === index ? 'true' : undefined}
                    data-drop-target={
                      dropIndex === index && dragIndex !== null && dragIndex !== index
                        ? 'true'
                        : undefined
                    }
                    draggable={canReorderDrag}
                    aria-label={`Chọn ảnh vị trí ${position}${isPrimary ? ' (Ảnh đại diện)' : ''}`}
                    title="Kéo để đổi vị trí hoặc bấm để sửa mô tả"
                    onClick={() => jumpToCard(img.id)}
                    onDragStart={(e) => beginDrag(e, index)}
                    onDragOver={(e) => hoverItemDrag(e, index)}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        setDropIndex((prev) => (prev === index ? null : prev));
                      }
                    }}
                    onDrop={(e) => dropOnItem(e, index)}
                    onDragEnd={endDrag}
                  >
                    <img src={img.url} alt="" aria-hidden="true" loading="lazy" />
                    <span
                      className={styles.mediaQuickNum}
                      data-primary={isPrimary ? 'true' : undefined}
                    >
                      {isPrimary ? '#1 Đại diện' : `#${position}`}
                    </span>
                  </button>
                );
              })}
              {canAddMore && (
                <button
                  type="button"
                  className={styles.mediaQuickAdd}
                  onClick={() => fileInputRef.current?.click()}
                  title="Kéo thả ảnh vào đây hoặc bấm để tải ảnh lên"
                >
                  <span>+ Thêm</span>
                </button>
              )}
            </div>
          </div>

          <div
            className={styles.mediaGrid}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setFileDragOver(false);
              }
            }}
          >
            {items.map((img, index) => {
              const position = index + 1;
              const isPrimary = index === 0;
              const isLastRemainingOnActiveProduct = items.length === 1 && product.isActive;
              return (
                <figure
                  id={`media-card-${img.id}`}
                  className={styles.mediaCard}
                  data-primary={isPrimary ? 'true' : undefined}
                  data-dragging={dragIndex === index ? 'true' : undefined}
                  data-drop-target={
                    dropIndex === index && dragIndex !== null && dragIndex !== index
                      ? 'true'
                      : undefined
                  }
                  draggable={canReorderDrag}
                  onDragStart={(e) => {
                    if (
                      e.target instanceof HTMLElement &&
                      e.target.closest('input, textarea, button')
                    ) {
                      e.preventDefault();
                      return;
                    }
                    beginDrag(e, index);
                  }}
                  onDragOver={(e) => hoverItemDrag(e, index)}
                  onDragLeave={(e) => leaveItemDrag(e, index)}
                  onDrop={(e) => dropOnItem(e, index)}
                  onDragEnd={endDrag}
                  key={img.id}
                >
                  <div className={styles.mediaCardLayout}>
                    <div className={styles.mediaPreviewWrap}>
                      <img
                        className={styles.mediaPreview}
                        src={img.url}
                        alt={img.alt.trim() || product.name}
                        loading="lazy"
                      />
                      <span
                        className={styles.mediaPreviewOrder}
                        data-primary={isPrimary ? 'true' : undefined}
                        aria-hidden="true"
                      >
                        #{position}
                      </span>
                    </div>

                    <div className={styles.mediaCardContent}>
                      <div className={styles.mediaCardTop}>
                        <figcaption className={styles.mediaBadgeRow}>
                          <span
                            className={styles.mediaDragCue}
                            aria-hidden="true"
                            title="Kéo để đổi chỗ"
                          >
                            ⋮⋮
                          </span>
                          <span className={styles.badge} data-tone={isPrimary ? 'accent' : 'muted'}>
                            {isPrimary ? 'Ảnh đại diện (#1)' : `Vị trí #${position}`}
                          </span>
                          <span className={styles.badge} data-tone="muted">
                            {img.color?.name ? `Màu: ${img.color.name}` : 'Ảnh chung'}
                          </span>
                          {img.key && (
                            <span className={styles.badge} data-tone="accent">
                              Mới tải lên
                            </span>
                          )}
                        </figcaption>

                        <div className={styles.mediaCardTools}>
                          {!isPrimary && (
                            <button
                              type="button"
                              className={styles.mediaGhostButton}
                              disabled={controlsLocked}
                              aria-label={`Đưa ảnh vị trí ${position} lên đầu làm ảnh đại diện`}
                              title="Đưa lên đầu (#1)"
                              onClick={() => promoteImageToFirst(index)}
                            >
                              ↑ #1
                            </button>
                          )}
                          <button
                            type="button"
                            className={styles.mediaGhostIcon}
                            disabled={controlsLocked || index === 0}
                            aria-label={`Chuyển ảnh vị trí ${position} lên`}
                            title="Di chuyển lên"
                            onClick={() => moveImageUp(index)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className={styles.mediaGhostIcon}
                            disabled={controlsLocked || index === items.length - 1}
                            aria-label={`Chuyển ảnh vị trí ${position} xuống`}
                            title="Di chuyển xuống"
                            onClick={() => moveImageDown(index)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className={styles.mediaGhostDanger}
                            disabled={controlsLocked || isLastRemainingOnActiveProduct}
                            aria-label={`Gỡ ảnh vị trí ${position}`}
                            title={
                              isLastRemainingOnActiveProduct
                                ? 'Không thể gỡ ảnh cuối cùng khi sản phẩm đang mở bán'
                                : 'Gỡ ảnh'
                            }
                            onClick={() => removeImage(img.id)}
                          >
                            ×
                          </button>
                        </div>
                      </div>

                      <div className={styles.mediaBody}>
                        <label className={styles.field}>
                          <span className={styles.mediaAltLabel}>Mô tả thay thế (alt)</span>
                          <input
                            id={`media-alt-${img.id}`}
                            type="text"
                            draggable={false}
                            value={img.alt}
                            maxLength={200}
                            placeholder={product.name}
                            disabled={controlsLocked}
                            aria-label={`Mô tả thay thế ảnh vị trí ${position}`}
                            onChange={(e) => setImageAlt(img.id, e.target.value)}
                          />
                        </label>

                        {altConflicts[img.id] && (
                          <div role="alert" className={styles.conflictAlert}>
                            <p>
                              {altConflicts[img.id]?.urlChanged
                                ? 'Máy chủ vừa thay ảnh mới tại vị trí này (mô tả hiện tại: '
                                : 'Máy chủ vừa đổi mô tả thành: '}
                              <strong>{altConflicts[img.id]?.serverAlt ?? '(trống)'}</strong>
                              {altConflicts[img.id]?.urlChanged ? ')' : ''}
                            </p>
                            <div className={styles.actionGroup}>
                              <button
                                type="button"
                                className={styles.mediaSmallButton}
                                disabled={controlsLocked}
                                aria-label={`Dùng mô tả máy chủ cho ảnh vị trí ${position}`}
                                onClick={() => resolveAltConflict(img.id, 'server')}
                              >
                                Dùng mô tả máy chủ
                              </button>
                              <button
                                type="button"
                                className={styles.mediaSmallButton}
                                disabled={controlsLocked}
                                aria-label={`Giữ mô tả đang soạn cho ảnh vị trí ${position}`}
                                onClick={() => resolveAltConflict(img.id, 'draft')}
                              >
                                Giữ mô tả đang soạn
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </figure>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
