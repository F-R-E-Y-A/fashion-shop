import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { ApiError, classifyRequestError, sessionQueryKeys } from '@/core';
import {
  adminAccessGeneration,
  SessionChangedError,
  useAdminForbidden,
  useAuth,
} from '@/features/account';
import { ActionFeedback, ConfirmDialog } from '@/ui';

import {
  type AdminCatalogDetail,
  adminCatalogKeys,
  type AdminProductVariantItem,
  type AdminVariantOptionsResponse,
  bumpDetailGeneration,
  type CreateProductVariantPayload,
  getDetailGeneration,
  type UncertainVariantCreate,
  type UncertainVariantUpdate,
  type UpdateProductVariantPayload,
  variantMutationErrorText,
} from './admin-catalog.api.js';
import styles from './AdminCatalog.module.css';
import { PRODUCT_ACTION_TIMEOUT_MS } from './product-status-action.js';

const variantLocks = new WeakMap<object, Set<string>>();
const MONEY_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

function isValidMoneyInput(raw: string): boolean {
  const trimmed = raw.trim();
  if (!MONEY_PATTERN.test(trimmed)) return false;
  const num = Number(trimmed);
  return Number.isFinite(num) && num > 0;
}

function normalizeMoney(val: string | null | undefined): string | null {
  if (val === null || val === undefined) return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return trimmed;
  return num.toFixed(2);
}

function normalizedExpectedSale(
  listPrice: string,
  salePrice: string | null | undefined,
): string | null {
  const normSale = normalizeMoney(salePrice);
  const normList = normalizeMoney(listPrice);
  if (normSale !== null && normList !== null && normSale === normList) {
    return null;
  }
  return normSale;
}

export interface VariantCreateDraft {
  id: string;
  colorId: string;
  sizeId: string;
  sku: string;
  listPrice: string;
  salePrice: string;
  isActive: boolean;
}

export interface VariantEditDraft {
  listPrice: string;
  salePrice: string;
  isActive: boolean;
  expectedUpdatedAt: string;
}

type VariantNoticeInput = { text: string; error?: boolean; recheck?: boolean };
type VariantNotice = VariantNoticeInput & { key: string | number };

export function useProductVariantAction(productId?: string) {
  const client = useQueryClient();
  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actor = user?.id ?? '';
  const epoch = getSessionEpoch();
  const { forbidden, markForbidden, guardQuery } = useAdminForbidden(actor, getSessionEpoch);

  // Options query (colors & sizes)
  const optionsQuery = useQuery({
    queryKey: adminCatalogKeys.variantOptions(actor),
    queryFn: ({ signal }) =>
      guardQuery(() =>
        request<AdminVariantOptionsResponse>('/admin/products/variant-options', { signal }),
      ),
    enabled: Boolean(actor),
  });

  // Create modal state
  const [createProduct, setCreateProduct] = useState<AdminCatalogDetail | null>(null);
  const [createDraft, setCreateDraft] = useState<VariantCreateDraft | null>(null);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});

  // Edit modal state
  const [editProduct, setEditProduct] = useState<AdminCatalogDetail | null>(null);
  const [editVariant, setEditVariant] = useState<AdminProductVariantItem | null>(null);
  const [editDraft, setEditDraft] = useState<VariantEditDraft | null>(null);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const [notice, setNoticeState] = useState<VariantNotice | null>(null);
  const noticeKeyRef = useRef(0);
  const setNotice = (next: VariantNoticeInput | null) => {
    setNoticeState(next ? { ...next, key: ++noticeKeyRef.current } : null);
  };
  const clearNotice = () => setNoticeState(null);
  const [checking, setChecking] = useState(false);
  const [conflictStale, setConflictStale] = useState(false);
  const [, setUncertainCacheTick] = useState(0);
  const noticeRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const createOpenProductRef = useRef<string | null>(null);
  const editOpenVariantRef = useRef<string | null>(null);

  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const viewActive = () => mountedRef.current;

  // Active productId for uncertain tracking
  const activeProductId = productId ?? createProduct?.id ?? editProduct?.id ?? '';

  useEffect(() => {
    if (!forbidden) return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort(new DOMException('Không đủ quyền truy cập', 'AbortError'));
      abortControllerRef.current = null;
    }
    if (actor && activeProductId) {
      void client.cancelQueries({ queryKey: adminCatalogKeys.detail(actor, activeProductId) });
      client.removeQueries({ queryKey: adminCatalogKeys.detail(actor, activeProductId) });
    }
  }, [forbidden, client, actor, activeProductId]);

  useEffect(() => {
    if (!actor || !activeProductId) return;
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (
        event.type !== 'removed' &&
        !(event.type === 'updated' && event.action.type === 'success')
      ) {
        return;
      }
      const key = event?.query?.queryKey;
      if (
        Array.isArray(key) &&
        key[0] === 'uncertain' &&
        key[1] === 'admin-catalog' &&
        key[2] === 'variant-update' &&
        key[3] === actor &&
        key[4] === epoch &&
        key[5] === activeProductId
      ) {
        setUncertainCacheTick((n) => n + 1);
      }
    });
    return unsubscribe;
  }, [client, actor, epoch, activeProductId]);

  const uncertainCreateKey = adminCatalogKeys.uncertainVariantCreate(actor, epoch, activeProductId);
  const uncertainCreateQuery = useQuery<UncertainVariantCreate | null>({
    queryKey: uncertainCreateKey,
    queryFn: () => null,
    enabled: false,
  });
  const uncertainCreate = uncertainCreateQuery.data ?? null;

  // Scan QueryCache for any uncertain updates for this product (handles remount / closed modal)
  const getDiscoveredUncertainUpdate = (): UncertainVariantUpdate | null => {
    if (!actor || !activeProductId) return null;
    const prefix = ['uncertain', 'admin-catalog', 'variant-update', actor, epoch, activeProductId];
    const queries = client.getQueryCache().findAll({ queryKey: prefix, exact: false });
    for (const q of queries) {
      const data = q.state.data as UncertainVariantUpdate | null;
      if (data && data.status === 'uncertain') {
        return data;
      }
    }
    return null;
  };
  const discoveredUncertainUpdate = getDiscoveredUncertainUpdate();

  const activeVariantId = editVariant?.id ?? discoveredUncertainUpdate?.variantId ?? '';
  const uncertainUpdateKey = adminCatalogKeys.uncertainVariantUpdate(
    actor,
    epoch,
    activeProductId,
    activeVariantId,
  );
  const uncertainUpdateQuery = useQuery<UncertainVariantUpdate | null>({
    queryKey: uncertainUpdateKey,
    queryFn: () => null,
    enabled: false,
  });
  const uncertainUpdate = uncertainUpdateQuery.data ?? discoveredUncertainUpdate;

  const uncertainVariantIds = new Set<string>();
  if (actor && activeProductId) {
    const prefix = ['uncertain', 'admin-catalog', 'variant-update', actor, epoch, activeProductId];
    for (const q of client.getQueryCache().findAll({ queryKey: prefix, exact: false })) {
      const data = q.state.data as UncertainVariantUpdate | null;
      if (data && (data.status === 'uncertain' || data.status === 'pending')) {
        uncertainVariantIds.add(data.variantId);
      }
    }
  }
  if (uncertainUpdate?.variantId) {
    uncertainVariantIds.add(uncertainUpdate.variantId);
  }
  const isVariantUncertain = (variantId: string) => uncertainVariantIds.has(variantId);

  const mutatingCount = useIsMutating({
    predicate: (m) => {
      const key = m.options.mutationKey;
      return (
        Array.isArray(key) &&
        key[0] === 'admin-variant' &&
        key[1] === actor &&
        key[2] === epoch &&
        key[3] === activeProductId
      );
    },
  });
  const busy = mutatingCount > 0;

  // Mutate create
  const createMutation = useMutation({
    mutationKey: ['admin-variant', actor, epoch, activeProductId, 'new'],
    mutationFn: async ({
      product,
      draft,
    }: {
      product: AdminCatalogDetail;
      draft: VariantCreateDraft;
    }) => {
      const lockKey = `${actor}:${epoch}:${product.id}:new`;
      let currentLocks = variantLocks.get(client);
      if (!currentLocks) {
        currentLocks = new Set<string>();
        variantLocks.set(client, currentLocks);
      }
      if (currentLocks.has(lockKey)) {
        throw new Error('Đang thực hiện tạo biến thể khác cho sản phẩm này.');
      }
      currentLocks.add(lockKey);

      const controller = new AbortController();
      abortControllerRef.current = controller;
      const timer = setTimeout(() => {
        controller.abort(
          new DOMException('Hết thời gian chờ phản hồi tạo biến thể', 'TimeoutError'),
        );
      }, PRODUCT_ACTION_TIMEOUT_MS);

      const payload: CreateProductVariantPayload = {
        id: draft.id,
        colorId: draft.colorId,
        sizeId: draft.sizeId,
        sku: draft.sku.trim(),
        listPrice: draft.listPrice.trim(),
        salePrice: normalizedExpectedSale(draft.listPrice, draft.salePrice)
          ? draft.salePrice.trim()
          : null,
        isActive: draft.isActive,
      };

      try {
        return await request<AdminProductVariantItem>(
          `/admin/products/${encodeURIComponent(product.id)}/variants`,
          {
            method: 'POST',
            body: payload,
            signal: controller.signal,
          },
        );
      } finally {
        clearTimeout(timer);
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        currentLocks.delete(lockKey);
      }
    },
  });

  // Mutate update
  const updateMutation = useMutation({
    mutationKey: ['admin-variant', actor, epoch, activeProductId, activeVariantId],
    mutationFn: async ({
      product,
      variant,
      draft,
    }: {
      product: AdminCatalogDetail;
      variant: AdminProductVariantItem;
      draft: VariantEditDraft;
    }) => {
      const lockKey = `${actor}:${epoch}:${product.id}:${variant.id}`;
      let currentLocks = variantLocks.get(client);
      if (!currentLocks) {
        currentLocks = new Set<string>();
        variantLocks.set(client, currentLocks);
      }
      if (currentLocks.has(lockKey)) {
        throw new Error('Đang thực hiện thao tác khác trên biến thể này.');
      }
      currentLocks.add(lockKey);

      const controller = new AbortController();
      abortControllerRef.current = controller;
      const timer = setTimeout(() => {
        controller.abort(
          new DOMException('Hết thời gian chờ phản hồi sửa biến thể', 'TimeoutError'),
        );
      }, PRODUCT_ACTION_TIMEOUT_MS);

      const payload: UpdateProductVariantPayload = {
        listPrice: draft.listPrice.trim(),
        salePrice: normalizedExpectedSale(draft.listPrice, draft.salePrice)
          ? draft.salePrice.trim()
          : null,
        isActive: draft.isActive,
        expectedUpdatedAt: draft.expectedUpdatedAt,
      };

      try {
        return await request<AdminProductVariantItem>(
          `/admin/products/${encodeURIComponent(product.id)}/variants/${encodeURIComponent(variant.id)}`,
          {
            method: 'PATCH',
            body: payload,
            signal: controller.signal,
          },
        );
      } finally {
        clearTimeout(timer);
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        currentLocks.delete(lockKey);
      }
    },
  });

  const openCreate = (product: AdminCatalogDetail, triggerEl?: HTMLElement) => {
    if (busy || uncertainCreate) return;
    openerRef.current = triggerEl ?? null;
    createOpenProductRef.current = product.id;
    setCreateProduct(product);
    setCreateDraft({
      id: crypto.randomUUID(),
      colorId: '',
      sizeId: '',
      sku: '',
      listPrice: '',
      salePrice: '',
      isActive: true,
    });
    setCreateErrors({});
    setNotice(null);
  };

  const closeCreate = () => {
    createOpenProductRef.current = null;
    setCreateProduct(null);
    setCreateDraft(null);
    setCreateErrors({});
  };

  const openEdit = (
    product: AdminCatalogDetail,
    variant: AdminProductVariantItem,
    triggerEl?: HTMLElement,
  ) => {
    if (busy || isVariantUncertain(variant.id)) return;
    openerRef.current = triggerEl ?? null;
    editOpenVariantRef.current = variant.id;
    setEditProduct(product);
    setEditVariant(variant);
    setEditDraft({
      listPrice: variant.listPrice,
      salePrice: variant.salePrice ?? '',
      isActive: variant.isActive,
      expectedUpdatedAt: variant.updatedAt,
    });
    setEditErrors({});
    setConflictStale(false);
    setNotice(null);
  };

  const closeEdit = () => {
    editOpenVariantRef.current = null;
    setEditProduct(null);
    setEditVariant(null);
    setEditDraft(null);
    setEditErrors({});
  };

  // Submit Create
  const handleConfirmCreate = async () => {
    if (!createProduct || !createDraft || busy || uncertainCreate) return;

    const errors: Record<string, string> = {};
    if (!createDraft.colorId) errors.colorId = 'Vui lòng chọn màu sắc.';
    if (!createDraft.sizeId) errors.sizeId = 'Vui lòng chọn kích cỡ.';
    const trimmedSku = createDraft.sku.trim();
    if (!trimmedSku || !/^[a-zA-Z0-9_-]+$/.test(trimmedSku) || trimmedSku.length > 64) {
      errors.sku = 'Mã SKU chỉ gồm chữ, số, gạch ngang, gạch dưới (tối đa 64 ký tự).';
    }
    const parsedList = Number(createDraft.listPrice);
    if (!isValidMoneyInput(createDraft.listPrice)) {
      errors.listPrice = 'Giá niêm yết phải là số dương (tối đa 2 chữ số thập phân).';
    }
    if (createDraft.salePrice.trim()) {
      const parsedSale = Number(createDraft.salePrice);
      if (!isValidMoneyInput(createDraft.salePrice)) {
        errors.salePrice = 'Giá giảm phải là số dương (tối đa 2 chữ số thập phân).';
      } else if (parsedSale > parsedList) {
        errors.salePrice = 'Giá giảm không được lớn hơn giá niêm yết.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setCreateErrors(errors);
      return;
    }

    const actorAtCall = actor;
    const epochAtCall = epoch;
    const accessAtCall = adminAccessGeneration(client, actorAtCall);
    const isCurrent = () =>
      getSessionEpoch() === epochAtCall &&
      adminAccessGeneration(client, actorAtCall) === accessAtCall;

    const opId = Date.now();
    const targetProduct = createProduct;
    const normalizedSale = normalizedExpectedSale(createDraft.listPrice, createDraft.salePrice)
      ? createDraft.salePrice.trim()
      : null;
    const draftPayload: CreateProductVariantPayload = {
      id: createDraft.id,
      colorId: createDraft.colorId,
      sizeId: createDraft.sizeId,
      sku: trimmedSku,
      listPrice: createDraft.listPrice.trim(),
      salePrice: normalizedSale,
      isActive: createDraft.isActive,
    };

    client.setQueryData<UncertainVariantCreate | null>(
      adminCatalogKeys.uncertainVariantCreate(actorAtCall, epochAtCall, targetProduct.id),
      () => ({
        operationId: opId,
        productId: targetProduct.id,
        id: createDraft.id,
        payload: draftPayload,
        status: 'pending',
      }),
    );

    try {
      const created = await createMutation.mutateAsync({
        product: targetProduct,
        draft: createDraft,
      });

      if (!isCurrent()) return;

      client.setQueryData<UncertainVariantCreate | null>(
        adminCatalogKeys.uncertainVariantCreate(actorAtCall, epochAtCall, targetProduct.id),
        (prev) => (!prev || prev.operationId === opId ? null : prev),
      );

      // Invalidate / update caches
      bumpDetailGeneration(client, actorAtCall, targetProduct.id);
      await client.invalidateQueries({
        queryKey: adminCatalogKeys.detail(actorAtCall, targetProduct.id),
      });
      await client.invalidateQueries({
        queryKey: adminCatalogKeys.lists(actorAtCall),
      });

      if (viewActive()) {
        closeCreate();
        setNotice({ text: `Đã thêm biến thể mới (SKU: ${created.sku}).` });
        noticeRef.current?.focus();
      }
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof SessionChangedError) return;
      if (classifyRequestError(error, 'detail') === 'forbidden') {
        markForbidden();
        return;
      }

      const status = error instanceof ApiError ? error.body.statusCode : 0;
      if (status === 409) {
        setConflictStale(true);
      }
      if (status >= 400 && status < 500) {
        client.setQueryData<UncertainVariantCreate | null>(
          adminCatalogKeys.uncertainVariantCreate(actorAtCall, epochAtCall, targetProduct.id),
          (prev) => (!prev || prev.operationId === opId ? null : prev),
        );
        if (viewActive()) {
          setNotice({ error: true, text: variantMutationErrorText(error) });
          noticeRef.current?.focus();
        }
      } else {
        // Network / timeout
        client.setQueryData<UncertainVariantCreate | null>(
          adminCatalogKeys.uncertainVariantCreate(actorAtCall, epochAtCall, targetProduct.id),
          (prev) =>
            !prev || prev.operationId === opId
              ? {
                  operationId: opId,
                  productId: targetProduct.id,
                  id: createDraft.id,
                  payload: draftPayload,
                  status: 'uncertain',
                }
              : prev,
        );
        if (viewActive()) {
          setNotice({
            error: true,
            recheck: true,
            text: 'Không thể xác nhận kết quả tạo biến thể từ máy chủ. Vui lòng đối chiếu trạng thái trước khi thao tác tiếp.',
          });
          noticeRef.current?.focus();
        }
      }
    }
  };

  // Submit Edit
  const handleConfirmEdit = async () => {
    if (!editProduct || !editVariant || !editDraft || busy || isVariantUncertain(editVariant.id)) {
      return;
    }

    const errors: Record<string, string> = {};
    const parsedList = Number(editDraft.listPrice);
    if (!isValidMoneyInput(editDraft.listPrice)) {
      errors.listPrice = 'Giá niêm yết phải là số dương (tối đa 2 chữ số thập phân).';
    }
    if (editDraft.salePrice.trim()) {
      const parsedSale = Number(editDraft.salePrice);
      if (!isValidMoneyInput(editDraft.salePrice)) {
        errors.salePrice = 'Giá giảm phải là số dương (tối đa 2 chữ số thập phân).';
      } else if (parsedSale > parsedList) {
        errors.salePrice = 'Giá giảm không được lớn hơn giá niêm yết.';
      }
    }

    // Protection: blocking last active variant disable
    if (editVariant.isActive && !editDraft.isActive && editProduct.isActive) {
      const activeCount = editProduct.variants.filter((v) => v.isActive).length;
      if (activeCount <= 1) {
        errors.isActive =
          'Không thể tắt biến thể hoạt động cuối cùng khi sản phẩm đang mở bán. Vui lòng ngừng bán sản phẩm trước.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }

    const actorAtCall = actor;
    const epochAtCall = epoch;
    const accessAtCall = adminAccessGeneration(client, actorAtCall);
    const isCurrent = () =>
      getSessionEpoch() === epochAtCall &&
      adminAccessGeneration(client, actorAtCall) === accessAtCall;

    const opId = Date.now();
    const targetProduct = editProduct;
    const targetVariant = editVariant;
    const normalizedSale = normalizedExpectedSale(editDraft.listPrice, editDraft.salePrice)
      ? editDraft.salePrice.trim()
      : null;
    const draftPayload: UpdateProductVariantPayload = {
      listPrice: editDraft.listPrice.trim(),
      salePrice: normalizedSale,
      isActive: editDraft.isActive,
      expectedUpdatedAt: editDraft.expectedUpdatedAt,
    };

    client.setQueryData<UncertainVariantUpdate | null>(
      adminCatalogKeys.uncertainVariantUpdate(
        actorAtCall,
        epochAtCall,
        targetProduct.id,
        targetVariant.id,
      ),
      () => ({
        operationId: opId,
        productId: targetProduct.id,
        variantId: targetVariant.id,
        payload: draftPayload,
        status: 'pending',
      }),
    );

    try {
      const updated = await updateMutation.mutateAsync({
        product: targetProduct,
        variant: targetVariant,
        draft: editDraft,
      });

      if (!isCurrent()) return;

      client.setQueryData<UncertainVariantUpdate | null>(
        adminCatalogKeys.uncertainVariantUpdate(
          actorAtCall,
          epochAtCall,
          targetProduct.id,
          targetVariant.id,
        ),
        (prev) => (!prev || prev.operationId === opId ? null : prev),
      );

      // Invalidate / update caches
      bumpDetailGeneration(client, actorAtCall, targetProduct.id);
      await client.invalidateQueries({
        queryKey: adminCatalogKeys.detail(actorAtCall, targetProduct.id),
      });
      await client.invalidateQueries({
        queryKey: adminCatalogKeys.lists(actorAtCall),
      });

      if (viewActive()) {
        closeEdit();
        setNotice({ text: `Đã cập nhật biến thể (SKU: ${updated.sku}).` });
        noticeRef.current?.focus();
      }
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof SessionChangedError) return;
      if (classifyRequestError(error, 'detail') === 'forbidden') {
        markForbidden();
        return;
      }

      const status = error instanceof ApiError ? error.body.statusCode : 0;
      if (status === 409) {
        setConflictStale(true);
      }
      if (status >= 400 && status < 500) {
        client.setQueryData<UncertainVariantUpdate | null>(
          adminCatalogKeys.uncertainVariantUpdate(
            actorAtCall,
            epochAtCall,
            targetProduct.id,
            targetVariant.id,
          ),
          (prev) => (!prev || prev.operationId === opId ? null : prev),
        );
        if (viewActive()) {
          setNotice({ error: true, text: variantMutationErrorText(error) });
          noticeRef.current?.focus();
        }
      } else {
        // Network / timeout
        client.setQueryData<UncertainVariantUpdate | null>(
          adminCatalogKeys.uncertainVariantUpdate(
            actorAtCall,
            epochAtCall,
            targetProduct.id,
            targetVariant.id,
          ),
          (prev) =>
            !prev || prev.operationId === opId
              ? {
                  operationId: opId,
                  productId: targetProduct.id,
                  variantId: targetVariant.id,
                  payload: draftPayload,
                  status: 'uncertain',
                }
              : prev,
        );
        if (viewActive()) {
          setNotice({
            error: true,
            recheck: true,
            text: 'Không thể xác nhận kết quả sửa biến thể từ máy chủ. Vui lòng đối chiếu trạng thái trước khi thao tác tiếp.',
          });
          noticeRef.current?.focus();
        }
      }
    }
  };

  const runRecheckRequest = async <T,>(
    path: string,
    method: 'POST' | 'PATCH',
    body: unknown,
  ): Promise<{ data: T; signal: AbortSignal }> => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timer = setTimeout(() => {
      controller.abort(new DOMException('Hết thời gian chờ phản hồi từ máy chủ', 'TimeoutError'));
    }, PRODUCT_ACTION_TIMEOUT_MS);
    try {
      const data = await request<T>(path, {
        method,
        body,
        signal: controller.signal,
      });
      return { data, signal: controller.signal };
    } finally {
      clearTimeout(timer);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  const fetchRecheckDetail = async (
    actorAtCall: string,
    targetProductId: string,
    isCurrent: () => boolean,
  ): Promise<AdminCatalogDetail> => {
    const detailKey = adminCatalogKeys.detail(actorAtCall, targetProductId);
    const genAtStart = getDetailGeneration(client, actorAtCall, targetProductId);
    const updatedAtAtStart = client.getQueryState(detailKey)?.dataUpdatedAt ?? 0;
    void client.cancelQueries({ queryKey: detailKey });
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let onAbort: (() => void) | undefined;
    const abortPromise = new Promise<never>((_resolve, reject) => {
      onAbort = () => {
        reject(
          controller.signal.reason instanceof Error
            ? controller.signal.reason
            : new DOMException('Thao tác đối chiếu đã bị hủy', 'AbortError'),
        );
      };
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const timer = setTimeout(() => {
      controller.abort(
        new DOMException('Hết thời gian chờ đối chiếu trạng thái từ máy chủ', 'TimeoutError'),
      );
    }, PRODUCT_ACTION_TIMEOUT_MS);
    try {
      const fresh = await Promise.race([
        request<AdminCatalogDetail>(`/admin/products/${encodeURIComponent(targetProductId)}`, {
          signal: controller.signal,
        }),
        abortPromise,
      ]);
      const isCacheFresh =
        getDetailGeneration(client, actorAtCall, targetProductId) === genAtStart &&
        (client.getQueryState(detailKey)?.dataUpdatedAt ?? 0) === updatedAtAtStart;
      if (isCurrent() && isCacheFresh) {
        client.setQueryData(detailKey, fresh);
      }
      return fresh;
    } finally {
      clearTimeout(timer);
      if (onAbort) {
        controller.signal.removeEventListener('abort', onAbort);
      }
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  // Recheck uncertain create
  const recheckCreate = async () => {
    if (!uncertainCreate || checking) return;
    const snapshot = uncertainCreate;
    const actorAtCall = actor;
    const epochAtCall = epoch;
    const accessAtCall = adminAccessGeneration(client, actorAtCall);
    const isCurrent = () =>
      getSessionEpoch() === epochAtCall &&
      adminAccessGeneration(client, actorAtCall) === accessAtCall;

    const clearCreateMarker = () => {
      client.setQueryData<UncertainVariantCreate | null>(
        adminCatalogKeys.uncertainVariantCreate(actorAtCall, epochAtCall, snapshot.productId),
        (prev) => (!prev || prev.operationId === snapshot.operationId ? null : prev),
      );
    };

    const handleForbidden = () => {
      void client.cancelQueries({
        queryKey: adminCatalogKeys.detail(actorAtCall, snapshot.productId),
      });
      markForbidden();
      client.removeQueries({
        queryKey: adminCatalogKeys.detail(actorAtCall, snapshot.productId),
      });
      client.removeQueries({
        queryKey: sessionQueryKeys.adminResource('products'),
      });
    };

    setChecking(true);
    try {
      let fresh: AdminCatalogDetail;
      try {
        fresh = await fetchRecheckDetail(actorAtCall, snapshot.productId, isCurrent);
        if (!isCurrent()) return;
      } catch (getError) {
        if (!isCurrent()) return;
        if (getError instanceof SessionChangedError) return;
        if (classifyRequestError(getError, 'detail') === 'forbidden') {
          handleForbidden();
          return;
        }
        if (getError instanceof DOMException && getError.name === 'AbortError') {
          return;
        }
        // GET error (including 429, 404, TimeoutError, network) must NOT clear uncertain marker
        if (viewActive()) {
          setNotice({
            error: true,
            recheck: true,
            text:
              getError instanceof DOMException && getError.name === 'TimeoutError'
                ? 'Hết thời gian chờ đối chiếu trạng thái từ máy chủ. Vui lòng thử lại sau.'
                : 'Chưa thể đối chiếu trạng thái từ máy chủ. Vui lòng thử lại sau.',
          });
        }
        return;
      }
      const existingById = fresh.variants.find((v) => v.id === snapshot.id);
      if (existingById) {
        const optColors = optionsQuery.data?.colors ?? [];
        const optSizes = optionsQuery.data?.sizes ?? [];
        const colorOption = optColors.find((c) => c.id === snapshot.payload.colorId);
        const sizeOption = optSizes.find((s) => s.id === snapshot.payload.sizeId);
        const colorMatches =
          existingById.colorId !== undefined
            ? existingById.colorId === snapshot.payload.colorId
            : Boolean(colorOption && existingById.color.code === colorOption.code);
        const sizeMatches =
          existingById.sizeId !== undefined
            ? existingById.sizeId === snapshot.payload.sizeId
            : Boolean(sizeOption && existingById.sizeCode === sizeOption.code);

        const fullPayloadMatches =
          existingById.sku === snapshot.payload.sku &&
          normalizeMoney(existingById.listPrice) === normalizeMoney(snapshot.payload.listPrice) &&
          normalizedExpectedSale(existingById.listPrice, existingById.salePrice) ===
            normalizedExpectedSale(snapshot.payload.listPrice, snapshot.payload.salePrice) &&
          existingById.isActive === (snapshot.payload.isActive ?? true) &&
          colorMatches &&
          sizeMatches;

        if (fullPayloadMatches) {
          clearCreateMarker();
          if (viewActive()) {
            if (createOpenProductRef.current === snapshot.productId) {
              closeCreate();
            }
            setNotice({
              text: `Biến thể "${existingById.sku}" đã được tạo thành công trên máy chủ.`,
            });
          }
        } else if (viewActive()) {
          setNotice({
            error: true,
            recheck: true,
            text: 'Không thể xác nhận đầy đủ thông tin biến thể từ máy chủ. Vui lòng thử đối chiếu lại.',
          });
        }
        return;
      }

      if (viewActive()) {
        setNotice({
          error: true,
          recheck: true,
          text: 'Máy chủ chưa ghi nhận biến thể này. Đang gửi lại yêu cầu…',
        });
      }

      const { data: retried } = await runRecheckRequest<AdminProductVariantItem>(
        `/admin/products/${encodeURIComponent(snapshot.productId)}/variants`,
        'POST',
        snapshot.payload,
      );
      if (!isCurrent()) return;

      clearCreateMarker();
      bumpDetailGeneration(client, actorAtCall, snapshot.productId);
      await client.invalidateQueries({
        queryKey: adminCatalogKeys.detail(actorAtCall, snapshot.productId),
      });
      await client.invalidateQueries({
        queryKey: adminCatalogKeys.lists(actorAtCall),
      });
      if (viewActive()) {
        if (createOpenProductRef.current === snapshot.productId) {
          closeCreate();
        }
        setNotice({ text: `Đã thêm biến thể mới (SKU: ${retried.sku}).` });
        noticeRef.current?.focus();
      }
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof SessionChangedError) return;
      if (classifyRequestError(error, 'detail') === 'forbidden') {
        handleForbidden();
        return;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      const status = error instanceof ApiError ? error.body.statusCode : 0;
      if (status >= 400 && status < 500) {
        if (status === 409) {
          setConflictStale(true);
        }
        clearCreateMarker();
        if (viewActive()) {
          setNotice({ error: true, text: variantMutationErrorText(error) });
          noticeRef.current?.focus();
        }
        return;
      }
      if (viewActive()) {
        setNotice({
          error: true,
          recheck: true,
          text: 'Chưa thể kết nối tới máy chủ để đối chiếu trạng thái. Vui lòng thử lại sau.',
        });
      }
    } finally {
      if (viewActive()) setChecking(false);
    }
  };

  // Recheck uncertain update
  const recheckUpdate = async () => {
    if (!uncertainUpdate || checking) return;
    const snapshot = uncertainUpdate;
    const actorAtCall = actor;
    const epochAtCall = epoch;
    const accessAtCall = adminAccessGeneration(client, actorAtCall);
    const isCurrent = () =>
      getSessionEpoch() === epochAtCall &&
      adminAccessGeneration(client, actorAtCall) === accessAtCall;

    const clearUpdateMarker = () => {
      client.setQueryData<UncertainVariantUpdate | null>(
        adminCatalogKeys.uncertainVariantUpdate(
          actorAtCall,
          epochAtCall,
          snapshot.productId,
          snapshot.variantId,
        ),
        (prev) => (!prev || prev.operationId === snapshot.operationId ? null : prev),
      );
    };

    const handleForbidden = () => {
      void client.cancelQueries({
        queryKey: adminCatalogKeys.detail(actorAtCall, snapshot.productId),
      });
      markForbidden();
      client.removeQueries({
        queryKey: adminCatalogKeys.detail(actorAtCall, snapshot.productId),
      });
      client.removeQueries({
        queryKey: sessionQueryKeys.adminResource('products'),
      });
    };

    setChecking(true);
    try {
      let fresh: AdminCatalogDetail;
      try {
        fresh = await fetchRecheckDetail(actorAtCall, snapshot.productId, isCurrent);
        if (!isCurrent()) return;
      } catch (getError) {
        if (!isCurrent()) return;
        if (getError instanceof SessionChangedError) return;
        if (classifyRequestError(getError, 'detail') === 'forbidden') {
          handleForbidden();
          return;
        }
        if (getError instanceof DOMException && getError.name === 'AbortError') {
          return;
        }
        // GET error (including 429, 404, TimeoutError, network) must NOT clear uncertain marker
        if (viewActive()) {
          setNotice({
            error: true,
            recheck: true,
            text:
              getError instanceof DOMException && getError.name === 'TimeoutError'
                ? 'Hết thời gian chờ đối chiếu trạng thái từ máy chủ. Vui lòng thử lại sau.'
                : 'Chưa thể đối chiếu trạng thái từ máy chủ. Vui lòng thử lại sau.',
          });
        }
        return;
      }
      const matched = fresh.variants.find((v) => v.id === snapshot.variantId);
      const isUpdated =
        matched &&
        matched.updatedAt > snapshot.payload.expectedUpdatedAt &&
        normalizeMoney(matched.listPrice) === normalizeMoney(snapshot.payload.listPrice) &&
        normalizedExpectedSale(matched.listPrice, matched.salePrice) ===
          normalizedExpectedSale(
            snapshot.payload.listPrice ?? matched.listPrice,
            snapshot.payload.salePrice,
          ) &&
        matched.isActive === snapshot.payload.isActive;

      if (isUpdated) {
        clearUpdateMarker();
        if (viewActive()) {
          if (editOpenVariantRef.current === snapshot.variantId) {
            closeEdit();
          }
          setNotice({
            text: `Biến thể "${matched.sku}" đã được lưu cập nhật thành công trên máy chủ.`,
          });
        }
        return;
      }

      if (matched && matched.updatedAt === snapshot.payload.expectedUpdatedAt) {
        if (viewActive()) {
          setNotice({
            error: true,
            recheck: true,
            text: 'Máy chủ chưa cập nhật biến thể này. Đang gửi lại yêu cầu…',
          });
        }

        const { data: retried } = await runRecheckRequest<AdminProductVariantItem>(
          `/admin/products/${encodeURIComponent(snapshot.productId)}/variants/${encodeURIComponent(snapshot.variantId)}`,
          'PATCH',
          snapshot.payload,
        );
        if (!isCurrent()) return;

        clearUpdateMarker();
        bumpDetailGeneration(client, actorAtCall, snapshot.productId);
        await client.invalidateQueries({
          queryKey: adminCatalogKeys.detail(actorAtCall, snapshot.productId),
        });
        await client.invalidateQueries({
          queryKey: adminCatalogKeys.lists(actorAtCall),
        });
        if (viewActive()) {
          if (editOpenVariantRef.current === snapshot.variantId) {
            closeEdit();
          }
          setNotice({ text: `Đã cập nhật biến thể (SKU: ${retried.sku}).` });
          noticeRef.current?.focus();
        }
        return;
      }

      // Server moved to a different updatedAt with different payload, or variant disappeared
      clearUpdateMarker();
      if (
        editOpenVariantRef.current === snapshot.variantId ||
        editOpenVariantRef.current === null
      ) {
        setConflictStale(true);
      }
      if (viewActive()) {
        setNotice({
          error: true,
          text: 'Máy chủ chưa cập nhật biến thể theo dữ liệu bạn gửi vì đã có phiên bản mới hơn. Vui lòng tải lại dữ liệu.',
        });
      }
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof SessionChangedError) return;
      if (classifyRequestError(error, 'detail') === 'forbidden') {
        handleForbidden();
        return;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      const status = error instanceof ApiError ? error.body.statusCode : 0;
      if (status >= 400 && status < 500) {
        if (
          status === 409 &&
          (editOpenVariantRef.current === snapshot.variantId || editOpenVariantRef.current === null)
        ) {
          setConflictStale(true);
        }
        clearUpdateMarker();
        if (viewActive()) {
          setNotice({ error: true, text: variantMutationErrorText(error) });
          noticeRef.current?.focus();
        }
        return;
      }
      if (viewActive()) {
        setNotice({
          error: true,
          recheck: true,
          text: 'Chưa thể kết nối tới máy chủ để đối chiếu trạng thái. Vui lòng thử lại sau.',
        });
      }
    } finally {
      if (viewActive()) setChecking(false);
    }
  };

  return {
    options: optionsQuery.data ?? { colors: [], sizes: [] },
    openCreate,
    closeCreate,
    createProduct,
    createDraft,
    setCreateDraft,
    createErrors,
    handleConfirmCreate,

    openEdit,
    closeEdit,
    editProduct,
    editVariant,
    editDraft,
    setEditDraft,
    editErrors,
    handleConfirmEdit,

    busy,
    sessionScope: `${actor}:${epoch}`,
    clearNotice,
    notice:
      (uncertainCreate || uncertainUpdate) && !notice?.recheck
        ? {
            key: `uncertain:${uncertainCreate?.operationId ?? ''}:${uncertainUpdate?.operationId ?? ''}`,
            error: true,
            recheck: true,
            text: 'Không thể xác nhận kết quả thao tác biến thể từ máy chủ. Vui lòng đối chiếu trạng thái.',
          }
        : notice,
    setNotice,
    noticeRef,
    openerRef,
    checking,

    uncertainCreate,
    recheckCreate,
    uncertainUpdate,
    recheckUpdate,
    isVariantUncertain,
    conflictStale,
  };
}

export type ProductVariantAction = ReturnType<typeof useProductVariantAction>;

export function ProductVariantFeedback({ action }: { action: ProductVariantAction }) {
  const {
    options,
    closeCreate,
    createProduct,
    createDraft,
    setCreateDraft,
    createErrors,
    handleConfirmCreate,

    closeEdit,
    editProduct,
    editVariant,
    editDraft,
    setEditDraft,
    editErrors,
    handleConfirmEdit,

    busy,
    sessionScope,
    clearNotice,
    notice,
    noticeRef,
    checking,
    uncertainCreate,
    recheckCreate,
    uncertainUpdate,
    recheckUpdate,
    conflictStale,
  } = action;

  const tone = notice?.recheck ? 'warning' : notice?.error ? 'error' : 'success';
  const primaryAction = uncertainCreate
    ? {
        label: checking ? 'Đang kiểm tra…' : 'Đối chiếu máy chủ (Tạo)',
        onClick: () => void recheckCreate(),
        disabled: checking,
      }
    : uncertainUpdate
      ? {
          label: checking ? 'Đang kiểm tra…' : 'Đối chiếu máy chủ (Sửa)',
          onClick: () => void recheckUpdate(),
          disabled: checking,
        }
      : undefined;

  return (
    <>
      <div ref={noticeRef} tabIndex={-1} className={styles.noticeSlot}>
        {notice && (
          <ActionFeedback
            noticeKey={notice.key}
            sessionScope={sessionScope}
            tone={tone}
            message={notice.text}
            onDismiss={clearNotice}
            action={primaryAction}
          />
        )}
        {uncertainCreate && uncertainUpdate && (
          <ActionFeedback
            noticeKey={`uncertain-update:${uncertainUpdate.operationId}`}
            sessionScope={sessionScope}
            tone="warning"
            message="Còn thao tác sửa biến thể chưa xác nhận kết quả từ máy chủ."
            action={{
              label: checking ? 'Đang kiểm tra…' : 'Đối chiếu máy chủ (Sửa)',
              onClick: () => void recheckUpdate(),
              disabled: checking,
            }}
          />
        )}
      </div>

      {/* Modal Thêm Biến Thể */}
      <ConfirmDialog
        open={Boolean(createProduct && createDraft)}
        title="Thêm biến thể mới"
        subject={createProduct ? `Sản phẩm: ${createProduct.name}` : ''}
        impacts={[
          'Biến thể mới sẽ được gán cờ tự tạo (isCustom) và bảo vệ giá/trạng thái qua các lần nạp từ nguồn.',
          'Giá thấp nhất (priceFrom) của sản phẩm sẽ được tự động tính lại.',
        ]}
        confirmLabel="Tạo biến thể"
        pendingLabel="Đang tạo…"
        tone="primary"
        pending={busy}
        confirmDisabled={Boolean(uncertainCreate)}
        onClose={closeCreate}
        onConfirm={handleConfirmCreate}
      >
        {createDraft && (
          <div className={styles.contentForm}>
            <label className={styles.field}>
              <span>Màu sắc *</span>
              <select
                value={createDraft.colorId}
                aria-label="Màu sắc"
                onChange={(e) => setCreateDraft({ ...createDraft, colorId: e.target.value })}
              >
                <option value="">-- Chọn màu sắc --</option>
                {options.colors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
              {createErrors.colorId && (
                <span role="alert" className={styles.fieldError}>
                  {createErrors.colorId}
                </span>
              )}
            </label>

            <label className={styles.field}>
              <span>Kích cỡ *</span>
              <select
                value={createDraft.sizeId}
                aria-label="Kích cỡ"
                onChange={(e) => setCreateDraft({ ...createDraft, sizeId: e.target.value })}
              >
                <option value="">-- Chọn kích cỡ --</option>
                {options.sizes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code}
                  </option>
                ))}
              </select>
              {createErrors.sizeId && (
                <span role="alert" className={styles.fieldError}>
                  {createErrors.sizeId}
                </span>
              )}
            </label>

            <label className={styles.field}>
              <span>Mã SKU *</span>
              <input
                type="text"
                value={createDraft.sku}
                placeholder="VD: FREYA-AO-DEN-S"
                maxLength={64}
                aria-label="Mã SKU"
                onChange={(e) => setCreateDraft({ ...createDraft, sku: e.target.value })}
              />
              {createErrors.sku && (
                <span role="alert" className={styles.fieldError}>
                  {createErrors.sku}
                </span>
              )}
            </label>

            <label className={styles.field}>
              <span>Giá niêm yết (VNĐ) *</span>
              <input
                type="text"
                inputMode="numeric"
                value={createDraft.listPrice}
                placeholder="VD: 299000"
                aria-label="Giá niêm yết"
                onChange={(e) => setCreateDraft({ ...createDraft, listPrice: e.target.value })}
              />
              {createErrors.listPrice && (
                <span role="alert" className={styles.fieldError}>
                  {createErrors.listPrice}
                </span>
              )}
            </label>

            <label className={styles.field}>
              <span>Giá giảm (VNĐ - tùy chọn)</span>
              <input
                type="text"
                inputMode="numeric"
                value={createDraft.salePrice}
                placeholder="VD: 199000 (để trống nếu không giảm)"
                aria-label="Giá giảm"
                onChange={(e) => setCreateDraft({ ...createDraft, salePrice: e.target.value })}
              />
              {createErrors.salePrice && (
                <span role="alert" className={styles.fieldError}>
                  {createErrors.salePrice}
                </span>
              )}
            </label>

            <label className={styles.field}>
              <span>Trạng thái mở bán ban đầu</span>
              <select
                value={createDraft.isActive ? 'true' : 'false'}
                aria-label="Trạng thái mở bán"
                onChange={(e) =>
                  setCreateDraft({ ...createDraft, isActive: e.target.value === 'true' })
                }
              >
                <option value="true">Bật bán (Active)</option>
                <option value="false">Tạm ngừng bán (Inactive)</option>
              </select>
            </label>
          </div>
        )}
      </ConfirmDialog>

      {/* Modal Sửa Giá & Trạng Thái Biến Thể */}
      <ConfirmDialog
        open={Boolean(editProduct && editVariant && editDraft)}
        title="Sửa giá & trạng thái biến thể"
        subject={
          editVariant
            ? `SKU: ${editVariant.sku} (${editVariant.color.name} / ${editVariant.sizeCode})`
            : ''
        }
        impacts={[
          'Các trường sửa đổi sẽ được ghi nhận vào danh sách bảo vệ của quản trị viên (adminManagedFields).',
          'Giá thấp nhất (priceFrom) của sản phẩm sẽ được tính lại tự động nếu có thay đổi.',
        ]}
        confirmLabel="Lưu thay đổi"
        pendingLabel="Đang lưu…"
        tone="primary"
        pending={busy}
        confirmDisabled={
          conflictStale || Boolean(editVariant && action.isVariantUncertain(editVariant.id))
        }
        onClose={closeEdit}
        onConfirm={handleConfirmEdit}
      >
        {editDraft && (
          <div className={styles.contentForm}>
            <label className={styles.field}>
              <span>Giá niêm yết (VNĐ) *</span>
              <input
                type="text"
                inputMode="numeric"
                value={editDraft.listPrice}
                aria-label="Giá niêm yết"
                onChange={(e) => setEditDraft({ ...editDraft, listPrice: e.target.value })}
              />
              {editErrors.listPrice && (
                <span role="alert" className={styles.fieldError}>
                  {editErrors.listPrice}
                </span>
              )}
            </label>

            <label className={styles.field}>
              <span>Giá giảm (VNĐ - tùy chọn)</span>
              <input
                type="text"
                inputMode="numeric"
                value={editDraft.salePrice}
                placeholder="Để trống nếu không có giá giảm"
                aria-label="Giá giảm"
                onChange={(e) => setEditDraft({ ...editDraft, salePrice: e.target.value })}
              />
              {editErrors.salePrice && (
                <span role="alert" className={styles.fieldError}>
                  {editErrors.salePrice}
                </span>
              )}
            </label>

            <label className={styles.field}>
              <span>Trạng thái mở bán</span>
              <select
                value={editDraft.isActive ? 'true' : 'false'}
                aria-label="Trạng thái mở bán"
                onChange={(e) =>
                  setEditDraft({ ...editDraft, isActive: e.target.value === 'true' })
                }
              >
                <option value="true">Đang bật (Active)</option>
                <option value="false">Ngừng bán (Inactive)</option>
              </select>
              {editErrors.isActive && (
                <span role="alert" className={styles.fieldError}>
                  {editErrors.isActive}
                </span>
              )}
            </label>
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}

export function AddVariantButton({
  product,
  action,
}: {
  product: AdminCatalogDetail;
  action: ProductVariantAction;
}) {
  const { openCreate, busy, uncertainCreate } = action;
  return (
    <button
      type="button"
      className={styles.statusButton}
      disabled={busy || Boolean(uncertainCreate)}
      onClick={(e) => openCreate(product, e.currentTarget)}
    >
      + Thêm biến thể
    </button>
  );
}

export function EditVariantButton({
  product,
  variant,
  action,
}: {
  product: AdminCatalogDetail;
  variant: AdminProductVariantItem;
  action: ProductVariantAction;
}) {
  const { openEdit, busy, isVariantUncertain } = action;
  return (
    <button
      type="button"
      className={styles.statusButton}
      disabled={busy || isVariantUncertain(variant.id)}
      onClick={(e) => openEdit(product, variant, e.currentTarget)}
    >
      Sửa giá & trạng thái
    </button>
  );
}
