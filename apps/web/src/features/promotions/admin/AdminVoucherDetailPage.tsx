import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { ApiError, classifyRequestError } from '@/core';
import {
  adminAccessGeneration,
  AdminForbidden,
  SessionChangedError,
  useAdminForbidden,
  useAuth,
} from '@/features/account';
import { ActionFeedback, ConfirmDialog } from '@/ui';

import {
  type AdminVoucher,
  adminVouchersKeys,
  areVoucherFieldValuesEqual,
  doesVoucherMatchPayload,
  localDateTimeLocalToUtcIso,
  sanitizeAdminReturnUrl,
  type UncertainActionMarker,
  type UpdateAdminVoucherInput,
  utcIsoToLocalDateTimeLocal,
  voucherErrorText,
  voucherStatusBadge,
} from './admin-vouchers.api.js';
import styles from './AdminVouchers.module.css';
import { useAdminVoucherDetail } from './use-admin-vouchers.js';
import { useVoucherStatusAction } from './voucher-status-action.js';

const MUTATION_TIMEOUT_MS = 10_000;

export function AdminVoucherDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const location = useLocation();
  const queryClient = useQueryClient();

  const returnUrl = sanitizeAdminReturnUrl(
    (location.state as { returnTo?: unknown } | null)?.returnTo,
  );

  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actor = user?.id ?? '';
  const epoch = getSessionEpoch();
  const { forbidden, markForbidden, guardQuery } = useAdminForbidden(actor, getSessionEpoch);

  const { result, data: voucher } = useAdminVoucherDetail(id);

  const {
    open: openStatusDialog,
    dialogProps,
    pending: isStatusPending,
  } = useVoucherStatusAction();

  // Form states
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('INACTIVE');
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED_AMOUNT'>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('');
  const [maxDiscountAmount, setMaxDiscountAmount] = useState('');
  const [minOrderAmount, setMinOrderAmount] = useState('');
  const [usageLimit, setUsageLimit] = useState('');
  const [perUserLimit, setPerUserLimit] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  // Dirty fields tracking and base snapshot to preserve draft and CAS token across refetch
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());
  const [initialSyncedVoucherId, setInitialSyncedVoucherId] = useState<string | null>(null);
  const [lastKnownVoucher, setLastKnownVoucher] = useState<AdminVoucher | null>(null);
  const [baseSnapshot, setBaseSnapshot] = useState<AdminVoucher | null>(null);
  const [expectedToken, setExpectedToken] = useState<string | null>(null);

  const sessionScope = `${actor}:${epoch}`;
  const [formNotice, setFormNoticeState] = useState<{
    key: number;
    scope: string;
    text: string;
    error?: boolean;
    recheck?: boolean;
  } | null>(null);
  const setFormNotice = useCallback(
    (next: { text: string; error?: boolean; recheck?: boolean } | null) => {
      if (!next) {
        setFormNoticeState(null);
        return;
      }
      setFormNoticeState((prev) => ({
        ...next,
        key: (prev?.key ?? 0) + 1,
        scope: sessionScope,
      }));
    },
    [sessionScope],
  );
  const clearFormNotice = useCallback(() => setFormNoticeState(null), []);
  const scopedFormNotice = formNotice?.scope === sessionScope ? formNotice : null;
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [hasConflict, setHasConflict] = useState(false);
  const [rechecking, setRechecking] = useState(false);

  const formNoticeRef = useRef<HTMLDivElement>(null);

  // Uncertain marker key
  const uncertainMarkerKey = adminVouchersKeys.uncertainMarker(actor, 'edit', id);
  const markerQuery = useQuery<UncertainActionMarker | null>({
    queryKey: uncertainMarkerKey,
    queryFn: () => null,
    enabled: false,
  });
  const uncertainMarker = markerQuery.data ?? null;

  const setUncertainMarker = (marker: UncertainActionMarker | null) => {
    queryClient.setQueryData(uncertainMarkerKey, marker);
  };

  const markDirty = (field: string) => {
    setDirtyFields((prev) => {
      const next = new Set(prev);
      next.add(field);
      return next;
    });
  };

  // Sync initial voucher data into form
  if (voucher && voucher.id !== initialSyncedVoucherId) {
    // Initial load or route changed
    setInitialSyncedVoucherId(voucher.id);
    setLastKnownVoucher(voucher);
    setBaseSnapshot(voucher);
    setExpectedToken(voucher.updatedAt);
    setDirtyFields(new Set());
    setCode(voucher.code);
    setStatus(voucher.status);
    setDiscountType(voucher.discountType);
    setDiscountValue(voucher.discountValue);
    setMaxDiscountAmount(voucher.maxDiscountAmount ?? '');
    setMinOrderAmount(voucher.minOrderAmount ?? '');
    setUsageLimit(voucher.usageLimit !== null ? String(voucher.usageLimit) : '');
    setPerUserLimit(voucher.perUserLimit !== null ? String(voucher.perUserLimit) : '');
    setStartsAt(utcIsoToLocalDateTimeLocal(voucher.startsAt));
    setEndsAt(utcIsoToLocalDateTimeLocal(voucher.endsAt));
    setHasConflict(false);
  } else if (voucher && voucher !== lastKnownVoucher) {
    // Background refetch / focus refetch while editing
    setLastKnownVoucher(voucher);
    const base = baseSnapshot ?? voucher;

    // Check if any field that user has dirtied was changed by server
    let dirtyConflict = false;
    for (const f of dirtyFields) {
      const baseVal = (base as unknown as Record<string, unknown>)[f];
      const freshVal = (voucher as unknown as Record<string, unknown>)[f];
      if (!areVoucherFieldValuesEqual(f, baseVal, freshVal)) {
        dirtyConflict = true;
        break;
      }
    }

    if (dirtyConflict) {
      // Server changed the same field user is editing:
      // Do NOT advance token! Keep base token so submitting fails with 409
      setHasConflict(true);
      setFormNotice({
        text: 'Máy chủ đã có cập nhật trên các trường bạn đang chỉnh sửa. Bản thảo được giữ lại; vui lòng đối chiếu hoặc tải lại dữ liệu máy chủ để giải quyết xung đột.',
        error: true,
      });
      // Merge only clean fields
      if (!dirtyFields.has('code')) setCode(voucher.code);
      if (!dirtyFields.has('status')) setStatus(voucher.status);
      if (!dirtyFields.has('discountType')) setDiscountType(voucher.discountType);
      if (!dirtyFields.has('discountValue')) setDiscountValue(voucher.discountValue);
      if (!dirtyFields.has('maxDiscountAmount'))
        setMaxDiscountAmount(voucher.maxDiscountAmount ?? '');
      if (!dirtyFields.has('minOrderAmount')) setMinOrderAmount(voucher.minOrderAmount ?? '');
      if (!dirtyFields.has('usageLimit')) {
        setUsageLimit(voucher.usageLimit !== null ? String(voucher.usageLimit) : '');
      }
      if (!dirtyFields.has('perUserLimit')) {
        setPerUserLimit(voucher.perUserLimit !== null ? String(voucher.perUserLimit) : '');
      }
      if (!dirtyFields.has('startsAt')) setStartsAt(utcIsoToLocalDateTimeLocal(voucher.startsAt));
      if (!dirtyFields.has('endsAt')) setEndsAt(utcIsoToLocalDateTimeLocal(voucher.endsAt));
    } else {
      // Server only changed clean fields: advance token to avoid blocking unnecessarily
      setBaseSnapshot(voucher);
      setExpectedToken(voucher.updatedAt);
      if (!dirtyFields.has('code')) setCode(voucher.code);
      if (!dirtyFields.has('status')) setStatus(voucher.status);
      if (!dirtyFields.has('discountType')) setDiscountType(voucher.discountType);
      if (!dirtyFields.has('discountValue')) setDiscountValue(voucher.discountValue);
      if (!dirtyFields.has('maxDiscountAmount'))
        setMaxDiscountAmount(voucher.maxDiscountAmount ?? '');
      if (!dirtyFields.has('minOrderAmount')) setMinOrderAmount(voucher.minOrderAmount ?? '');
      if (!dirtyFields.has('usageLimit')) {
        setUsageLimit(voucher.usageLimit !== null ? String(voucher.usageLimit) : '');
      }
      if (!dirtyFields.has('perUserLimit')) {
        setPerUserLimit(voucher.perUserLimit !== null ? String(voucher.perUserLimit) : '');
      }
      if (!dirtyFields.has('startsAt')) setStartsAt(utcIsoToLocalDateTimeLocal(voucher.startsAt));
      if (!dirtyFields.has('endsAt')) setEndsAt(utcIsoToLocalDateTimeLocal(voucher.endsAt));
    }
  }

  const updateMutation = useMutation({
    mutationFn: async ({
      input,
      startEpoch,
      startGeneration,
    }: {
      input: UpdateAdminVoucherInput;
      startEpoch: number;
      startGeneration: number;
    }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), MUTATION_TIMEOUT_MS);
      try {
        const res = await request<AdminVoucher>(`/admin/vouchers/${id}`, {
          method: 'PATCH',
          body: input,
          signal: controller.signal,
        });
        if (
          getSessionEpoch() !== startEpoch ||
          adminAccessGeneration(queryClient, actor) !== startGeneration
        ) {
          throw new SessionChangedError();
        }
        return res;
      } finally {
        clearTimeout(timer);
      }
    },
  });

  useEffect(() => {
    if (scopedFormNotice?.error) {
      formNoticeRef.current?.focus();
    }
  }, [scopedFormNotice]);

  if (forbidden) {
    return <AdminForbidden />;
  }

  if (result.isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <p>Đang tải chi tiết mã giảm giá…</p>
        </div>
      </div>
    );
  }

  if (result.isError || !voucher) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>Không tìm thấy mã giảm giá</p>
          <p>
            {result.error
              ? voucherErrorText(result.error, 'detail')
              : 'Mã không tồn tại hoặc đã bị xóa.'}
          </p>
          <Link to={returnUrl} className={styles.secondaryButton} style={{ marginTop: '1rem' }}>
            ← Quay lại danh sách
          </Link>
        </div>
      </div>
    );
  }

  const badge = voucherStatusBadge(voucher);
  const badgeClass =
    badge.variant === 'active'
      ? styles.badgeActive
      : badge.variant === 'scheduled'
        ? styles.badgeScheduled
        : badge.variant === 'expired'
          ? styles.badgeExpired
          : styles.badgeInactive;

  function validateClient(): boolean {
    const errs: Record<string, string> = {};
    const normCode = code.trim().toUpperCase();
    if (!normCode || normCode.length < 3 || normCode.length > 30) {
      errs.code = 'Mã giảm giá phải từ 3 đến 30 ký tự.';
    }
    const val = parseFloat(discountValue);
    if (isNaN(val) || val <= 0) {
      errs.discountValue = 'Giá trị giảm phải là số lớn hơn 0.';
    } else if (discountType === 'PERCENTAGE' && val > 100) {
      errs.discountValue = 'Phần trăm giảm không được vượt quá 100%.';
    }
    if (maxDiscountAmount) {
      const maxVal = parseFloat(maxDiscountAmount);
      if (isNaN(maxVal) || maxVal <= 0) {
        errs.maxDiscountAmount = 'Mức giảm tối đa phải lớn hơn 0.';
      }
    }
    if (minOrderAmount) {
      const minVal = parseFloat(minOrderAmount);
      if (isNaN(minVal) || minVal < 0) {
        errs.minOrderAmount = 'Giá trị đơn tối thiểu không được âm.';
      }
    }
    if (usageLimit) {
      const uVal = parseInt(usageLimit, 10);
      if (isNaN(uVal) || uVal < 1) {
        errs.usageLimit = 'Lượt dùng tối đa phải là số nguyên từ 1 trở lên.';
      }
    }
    if (perUserLimit) {
      const pVal = parseInt(perUserLimit, 10);
      if (isNaN(pVal) || pVal < 1) {
        errs.perUserLimit = 'Lượt dùng mỗi người phải là số nguyên từ 1 trở lên.';
      }
    }
    if (startsAt && endsAt) {
      if (new Date(endsAt) <= new Date(startsAt)) {
        errs.endsAt = 'Thời gian kết thúc phải sau thời gian bắt đầu.';
      }
    }
    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleRecheck() {
    if (rechecking || !uncertainMarker) return;
    setRechecking(true);
    const startEpoch = epoch;
    const startActor = actor;
    const startGeneration = adminAccessGeneration(queryClient, startActor);

    try {
      const fresh = await guardQuery(() => request<AdminVoucher>(`/admin/vouchers/${id}`));

      if (
        getSessionEpoch() !== startEpoch ||
        adminAccessGeneration(queryClient, startActor) !== startGeneration
      ) {
        return;
      }

      await queryClient.cancelQueries({ queryKey: adminVouchersKeys.detail(actor, fresh.id) });

      if (
        getSessionEpoch() !== startEpoch ||
        adminAccessGeneration(queryClient, startActor) !== startGeneration
      ) {
        return;
      }

      const matches = doesVoucherMatchPayload(
        fresh,
        uncertainMarker.payload as Record<string, unknown>,
      );

      if (matches) {
        queryClient.setQueryData(adminVouchersKeys.detail(actor, fresh.id), fresh);
        await queryClient.invalidateQueries({ queryKey: adminVouchersKeys.lists(actor) });

        if (
          getSessionEpoch() !== startEpoch ||
          adminAccessGeneration(queryClient, startActor) !== startGeneration
        ) {
          return;
        }

        setUncertainMarker(null);
        setHasConflict(false);
        setDirtyFields(new Set());
        setBaseSnapshot(fresh);
        setExpectedToken(fresh.updatedAt);
        setFormNotice({ text: 'Đã xác nhận: thay đổi đã được áp dụng trên máy chủ.' });
      } else {
        // Server does not reflect the submitted changes yet
        // Do NOT clear marker or dirty fields!
        setFormNotice({
          text: 'Dữ liệu trên máy chủ chưa phản ánh thay đổi hoặc yêu cầu trước đó vẫn đang được xử lý. Bản thảo được giữ lại; vui lòng kiểm tra lại sau giây lát.',
          error: true,
          recheck: true,
        });
      }
    } catch (err) {
      if (err instanceof SessionChangedError) return;

      if (err instanceof ApiError && err.body.statusCode === 403) {
        markForbidden();
        setUncertainMarker(null);
        setFormNotice({ text: 'Tài khoản không còn quyền quản trị.', error: true });
        return;
      }

      if (err instanceof ApiError && err.body.statusCode === 404) {
        setUncertainMarker(null);
        await queryClient.invalidateQueries({ queryKey: adminVouchersKeys.all(actor) });
        setFormNotice({ text: 'Mã giảm giá không còn tồn tại trên máy chủ.', error: true });
        return;
      }

      setFormNotice({
        text: 'Chưa đối chiếu được trạng thái trên máy chủ. Vui lòng bấm kiểm tra lại.',
        error: true,
        recheck: true,
      });
    } finally {
      setRechecking(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!voucher || !validateClient() || updateMutation.isPending || Boolean(uncertainMarker)) {
      return;
    }

    setFormNotice(null);

    // If startsAt was not modified by the user, keep the exact original ISO string (preserving ms precision)
    const submittedStartsAt = dirtyFields.has('startsAt')
      ? startsAt
        ? localDateTimeLocalToUtcIso(startsAt)
        : null
      : voucher.startsAt;

    const submittedEndsAt = dirtyFields.has('endsAt')
      ? endsAt
        ? localDateTimeLocalToUtcIso(endsAt)
        : null
      : voucher.endsAt;

    const payload: UpdateAdminVoucherInput = {
      code: code.trim().toUpperCase(),
      status,
      discountType,
      discountValue: discountValue.trim(),
      maxDiscountAmount: maxDiscountAmount.trim() ? maxDiscountAmount.trim() : null,
      minOrderAmount: minOrderAmount.trim() ? minOrderAmount.trim() : null,
      usageLimit: usageLimit.trim() ? parseInt(usageLimit.trim(), 10) : null,
      perUserLimit: perUserLimit.trim() ? parseInt(perUserLimit.trim(), 10) : null,
      startsAt: submittedStartsAt,
      endsAt: submittedEndsAt,
      expectedUpdatedAt: expectedToken ?? voucher.updatedAt,
    };

    const startEpoch = epoch;
    const startActor = actor;
    const startGeneration = adminAccessGeneration(queryClient, startActor);

    try {
      const updated = await updateMutation.mutateAsync({
        input: payload,
        startEpoch,
        startGeneration,
      });

      if (
        getSessionEpoch() !== startEpoch ||
        adminAccessGeneration(queryClient, startActor) !== startGeneration
      ) {
        return;
      }

      // Cancel stale in-flight GET queries before writing to cache
      await queryClient.cancelQueries({ queryKey: adminVouchersKeys.detail(actor, updated.id) });

      if (
        getSessionEpoch() !== startEpoch ||
        adminAccessGeneration(queryClient, startActor) !== startGeneration
      ) {
        return;
      }

      queryClient.setQueryData(adminVouchersKeys.detail(actor, updated.id), updated);
      await queryClient.invalidateQueries({ queryKey: adminVouchersKeys.lists(actor) });

      if (
        getSessionEpoch() !== startEpoch ||
        adminAccessGeneration(queryClient, startActor) !== startGeneration
      ) {
        return;
      }

      setDirtyFields(new Set());
      setHasConflict(false);
      setUncertainMarker(null);
      setBaseSnapshot(updated);
      setExpectedToken(updated.updatedAt);
      setFormNotice({ text: 'Đã cập nhật mã giảm giá thành công.' });
    } catch (err) {
      if (err instanceof SessionChangedError) return;

      if (err instanceof ApiError && err.body.statusCode === 403) {
        markForbidden();
        setFormNotice({ text: 'Tài khoản không còn quyền quản trị.', error: true });
        return;
      }

      if (err instanceof ApiError && err.body.statusCode === 409) {
        setHasConflict(true);
        setFormNotice({
          text: 'Mã giảm giá đã được cập nhật bởi quản trị viên khác. Dữ liệu mới nhất trên máy chủ đã thay đổi; bản thảo của bạn được giữ lại để đối chiếu.',
          error: true,
        });
        return;
      }

      const classification = classifyRequestError(err, 'mutation');
      if (classification === 'invalid') {
        setFormNotice({
          text: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại các trường.',
          error: true,
        });
        return;
      }

      // 5xx / Network / Timeout -> Uncertain status
      const marker: UncertainActionMarker = {
        type: 'edit',
        id,
        code: code.trim().toUpperCase(),
        payload: payload as unknown as Record<string, unknown>,
        timestamp: Date.now(),
      };
      setUncertainMarker(marker);
      setFormNotice({
        text: 'Chưa rõ kết quả cập nhật do gián đoạn kết nối. Hệ thống đã tạm khóa để tránh gửi trùng lặp. Vui lòng nhấn kiểm tra lại.',
        error: true,
        recheck: true,
      });
    }
  }

  function handleResetToServer() {
    if (!voucher) return;
    setBaseSnapshot(voucher);
    setExpectedToken(voucher.updatedAt);
    setCode(voucher.code);
    setStatus(voucher.status);
    setDiscountType(voucher.discountType);
    setDiscountValue(voucher.discountValue);
    setMaxDiscountAmount(voucher.maxDiscountAmount ?? '');
    setMinOrderAmount(voucher.minOrderAmount ?? '');
    setUsageLimit(voucher.usageLimit !== null ? String(voucher.usageLimit) : '');
    setPerUserLimit(voucher.perUserLimit !== null ? String(voucher.perUserLimit) : '');
    setStartsAt(utcIsoToLocalDateTimeLocal(voucher.startsAt));
    setEndsAt(utcIsoToLocalDateTimeLocal(voucher.endsAt));
    setDirtyFields(new Set());
    setHasConflict(false);
    setFormNotice({ text: 'Đã nạp lại dữ liệu mới nhất từ máy chủ.' });
  }

  const activeNotice =
    scopedFormNotice ??
    (uncertainMarker
      ? {
          key: `uncertain-${id}`,
          text: 'Chưa rõ kết quả cập nhật do gián đoạn kết nối. Hệ thống đã tạm khóa để tránh gửi trùng lặp. Vui lòng nhấn kiểm tra lại.',
          error: true,
          recheck: true,
        }
      : null);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <div style={{ marginBottom: '0.5rem' }}>
            <Link to={returnUrl} className={styles.secondaryButton}>
              ← Quay lại danh sách
            </Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h1 className={styles.title} style={{ margin: 0 }}>
              {voucher.code}
            </h1>
            <span className={`${styles.badge} ${badgeClass}`}>{badge.text}</span>
          </div>
          <p className={styles.description}>
            Cập nhật cấu hình ưu đãi, thời gian áp dụng và kiểm soát lượt dùng.
          </p>
        </div>

        <button
          type="button"
          className={`${styles.toggleButton} ${
            voucher.status === 'ACTIVE' ? styles.toggleDeactivate : styles.toggleActivate
          }`}
          disabled={isStatusPending || Boolean(uncertainMarker)}
          onClick={(e) =>
            openStatusDialog(
              {
                id: voucher.id,
                code: voucher.code,
                status: voucher.status,
                updatedAt: voucher.updatedAt,
              },
              e.currentTarget,
            )
          }
        >
          {voucher.status === 'ACTIVE' ? 'Ngừng hoạt động' : 'Kích hoạt mã'}
        </button>
      </header>

      {activeNotice && (
        <div ref={formNoticeRef} tabIndex={-1}>
          <ActionFeedback
            noticeKey={activeNotice.key}
            sessionScope={sessionScope}
            tone={activeNotice.recheck ? 'warning' : activeNotice.error ? 'error' : 'success'}
            message={activeNotice.text}
            onDismiss={clearFormNotice}
            action={
              activeNotice.recheck
                ? {
                    label: rechecking ? 'Đang kiểm tra…' : 'Kiểm tra lại',
                    onClick: handleRecheck,
                    disabled: rechecking,
                  }
                : undefined
            }
          />
        </div>
      )}

      {hasConflict && (
        <div className={`${styles.notice} ${styles.noticeError}`}>
          <span>
            Máy chủ đã có phiên bản mới hơn. Bản thảo của bạn vẫn đang được giữ lại trên màn hình.
          </span>
          <button type="button" className={styles.secondaryButton} onClick={handleResetToServer}>
            Tải lại dữ liệu máy chủ
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.formCard}>
        <h2 className={styles.formTitle}>Thông tin voucher</h2>

        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="voucher-code">
              Mã voucher *
            </label>
            <input
              id="voucher-code"
              type="text"
              className={styles.formInput}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                markDirty('code');
              }}
            />
            {validationErrors.code && (
              <span className={styles.fieldError}>{validationErrors.code}</span>
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="voucher-status">
              Trạng thái *
            </label>
            <select
              id="voucher-status"
              className={styles.formSelect}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as 'ACTIVE' | 'INACTIVE');
                markDirty('status');
              }}
            >
              <option value="INACTIVE">Ngừng hoạt động (INACTIVE)</option>
              <option value="ACTIVE">Kích hoạt (ACTIVE)</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="voucher-discount-type">
              Hình thức giảm giá *
            </label>
            <select
              id="voucher-discount-type"
              className={styles.formSelect}
              value={discountType}
              onChange={(e) => {
                setDiscountType(e.target.value as 'PERCENTAGE' | 'FIXED_AMOUNT');
                markDirty('discountType');
              }}
            >
              <option value="PERCENTAGE">Theo phần trăm (%)</option>
              <option value="FIXED_AMOUNT">Số tiền cố định (VNĐ)</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="voucher-discount-value">
              Giá trị giảm *
            </label>
            <input
              id="voucher-discount-value"
              type="text"
              className={styles.formInput}
              value={discountValue}
              onChange={(e) => {
                setDiscountValue(e.target.value);
                markDirty('discountValue');
              }}
            />
            {validationErrors.discountValue && (
              <span className={styles.fieldError}>{validationErrors.discountValue}</span>
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="voucher-max-discount">
              Mức giảm tối đa (VNĐ)
            </label>
            <input
              id="voucher-max-discount"
              type="text"
              className={styles.formInput}
              value={maxDiscountAmount}
              onChange={(e) => {
                setMaxDiscountAmount(e.target.value);
                markDirty('maxDiscountAmount');
              }}
              placeholder="Không giới hạn trần"
            />
            <span className={styles.formHint}>Chỉ áp dụng với hình thức giảm theo phần trăm</span>
            {validationErrors.maxDiscountAmount && (
              <span className={styles.fieldError}>{validationErrors.maxDiscountAmount}</span>
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="voucher-min-order">
              Giá trị đơn hàng tối thiểu (VNĐ)
            </label>
            <input
              id="voucher-min-order"
              type="text"
              className={styles.formInput}
              value={minOrderAmount}
              onChange={(e) => {
                setMinOrderAmount(e.target.value);
                markDirty('minOrderAmount');
              }}
              placeholder="Để trống nếu không yêu cầu"
            />
            <span className={styles.formHint}>Đơn hàng phải đạt giá trị này mới được áp dụng</span>
            {validationErrors.minOrderAmount && (
              <span className={styles.fieldError}>{validationErrors.minOrderAmount}</span>
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="voucher-usage-limit">
              Tổng lượt sử dụng tối đa
            </label>
            <input
              id="voucher-usage-limit"
              type="number"
              min="1"
              className={styles.formInput}
              value={usageLimit}
              onChange={(e) => {
                setUsageLimit(e.target.value);
                markDirty('usageLimit');
              }}
              placeholder="Không giới hạn"
            />
            <span className={styles.formHint}>Đã sử dụng: {voucher.usageCount} lượt</span>
            {validationErrors.usageLimit && (
              <span className={styles.fieldError}>{validationErrors.usageLimit}</span>
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="voucher-per-user-limit">
              Giới hạn mỗi khách hàng
            </label>
            <input
              id="voucher-per-user-limit"
              type="number"
              min="1"
              className={styles.formInput}
              value={perUserLimit}
              onChange={(e) => {
                setPerUserLimit(e.target.value);
                markDirty('perUserLimit');
              }}
              placeholder="Không giới hạn"
            />
            <span className={styles.formHint}>Số lần tối đa một tài khoản có thể dùng mã này</span>
            {validationErrors.perUserLimit && (
              <span className={styles.fieldError}>{validationErrors.perUserLimit}</span>
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="voucher-starts-at">
              Bắt đầu hiệu lực (Giờ địa phương)
            </label>
            <input
              id="voucher-starts-at"
              type="datetime-local"
              className={styles.formInput}
              value={startsAt}
              onChange={(e) => {
                setStartsAt(e.target.value);
                markDirty('startsAt');
              }}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="voucher-ends-at">
              Kết thúc hiệu lực (Giờ địa phương)
            </label>
            <input
              id="voucher-ends-at"
              type="datetime-local"
              className={styles.formInput}
              value={endsAt}
              onChange={(e) => {
                setEndsAt(e.target.value);
                markDirty('endsAt');
              }}
            />
            {validationErrors.endsAt && (
              <span className={styles.fieldError}>{validationErrors.endsAt}</span>
            )}
          </div>
        </div>

        <div className={styles.formActions}>
          <Link to={returnUrl} className={styles.secondaryButton}>
            Hủy bỏ
          </Link>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={updateMutation.isPending || Boolean(uncertainMarker)}
          >
            {updateMutation.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
          </button>
        </div>
      </form>

      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
