import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { ApiError, classifyRequestError } from '@/core';
import {
  adminAccessGeneration,
  AdminForbidden,
  SessionChangedError,
  useAdminForbidden,
  useAuth,
} from '@/features/account';

import {
  type AdminVoucher,
  type AdminVoucherListResponse,
  adminVouchersKeys,
  type CreateAdminVoucherInput,
  doesVoucherMatchPayload,
  localDateTimeLocalToUtcIso,
  sanitizeAdminReturnUrl,
  type UncertainActionMarker,
} from './admin-vouchers.api.js';
import styles from './AdminVouchers.module.css';

const MUTATION_TIMEOUT_MS = 10_000;

export function AdminVoucherNewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const returnUrl = sanitizeAdminReturnUrl(
    (location.state as { returnTo?: unknown } | null)?.returnTo,
  );

  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actor = user?.id ?? '';
  const epoch = getSessionEpoch();
  const { forbidden, markForbidden, guardQuery } = useAdminForbidden(actor, getSessionEpoch);

  // Form states - Mặc định status là INACTIVE theo yêu cầu UX quản trị
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

  const [formNotice, setFormNotice] = useState<{
    text: string;
    error?: boolean;
    recheck?: boolean;
  } | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [rechecking, setRechecking] = useState(false);

  const formNoticeRef = useRef<HTMLDivElement>(null);

  const normCode = code.trim().toUpperCase();
  const uncertainMarkerKey = adminVouchersKeys.uncertainMarker(actor, 'create', 'new');
  const markerQuery = useQuery<UncertainActionMarker | null>({
    queryKey: uncertainMarkerKey,
    queryFn: () => null,
    enabled: false,
  });
  const uncertainMarker = markerQuery.data ?? null;

  const setUncertainMarker = (marker: UncertainActionMarker | null) => {
    queryClient.setQueryData(uncertainMarkerKey, marker);
  };

  const createMutation = useMutation({
    mutationFn: async ({
      input,
      startEpoch,
      startGeneration,
    }: {
      input: CreateAdminVoucherInput;
      startEpoch: number;
      startGeneration: number;
    }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), MUTATION_TIMEOUT_MS);
      try {
        const res = await request<AdminVoucher>('/admin/vouchers', {
          method: 'POST',
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
    if (formNotice) {
      formNoticeRef.current?.focus();
    }
  }, [formNotice]);

  if (forbidden) {
    return <AdminForbidden />;
  }

  function validateClient(): boolean {
    const errs: Record<string, string> = {};
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
      const res = await guardQuery(() =>
        request<AdminVoucherListResponse>(
          `/admin/vouchers?search=${encodeURIComponent(uncertainMarker.code)}&pageSize=10`,
        ),
      );

      if (
        getSessionEpoch() !== startEpoch ||
        adminAccessGeneration(queryClient, startActor) !== startGeneration
      ) {
        return;
      }

      const found = res.items.find((v) => v.code === uncertainMarker.code);
      if (found && doesVoucherMatchPayload(found, uncertainMarker.payload)) {
        await queryClient.cancelQueries({ queryKey: adminVouchersKeys.detail(actor, found.id) });
        if (
          getSessionEpoch() !== startEpoch ||
          adminAccessGeneration(queryClient, startActor) !== startGeneration
        ) {
          return;
        }

        queryClient.setQueryData(adminVouchersKeys.detail(actor, found.id), found);
        await queryClient.invalidateQueries({ queryKey: adminVouchersKeys.lists(actor) });

        if (
          getSessionEpoch() !== startEpoch ||
          adminAccessGeneration(queryClient, startActor) !== startGeneration
        ) {
          return;
        }

        setUncertainMarker(null);
        navigate(`/admin/vouchers/${found.id}`);
        return;
      }

      // Not found or not matching payload yet -> keep uncertain marker to protect against double submit
      setFormNotice({
        text: 'Chưa đối chiếu được mã giảm giá đã gửi trên máy chủ (yêu cầu có thể vẫn đang được xử lý). Vui lòng nhấn kiểm tra lại sau giây lát.',
        error: true,
        recheck: true,
      });
    } catch (err) {
      if (err instanceof SessionChangedError) return;

      if (err instanceof ApiError && err.body.statusCode === 403) {
        markForbidden();
        setUncertainMarker(null);
        setFormNotice({ text: 'Tài khoản không còn quyền quản trị.', error: true });
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
    if (!validateClient() || createMutation.isPending || Boolean(uncertainMarker)) return;

    setFormNotice(null);

    const payload: CreateAdminVoucherInput = {
      code: normCode,
      status,
      discountType,
      discountValue: discountValue.trim(),
      maxDiscountAmount: maxDiscountAmount.trim() ? maxDiscountAmount.trim() : null,
      minOrderAmount: minOrderAmount.trim() ? minOrderAmount.trim() : null,
      usageLimit: usageLimit.trim() ? parseInt(usageLimit.trim(), 10) : null,
      perUserLimit: perUserLimit.trim() ? parseInt(perUserLimit.trim(), 10) : null,
      startsAt: startsAt ? localDateTimeLocalToUtcIso(startsAt) : null,
      endsAt: endsAt ? localDateTimeLocalToUtcIso(endsAt) : null,
    };

    const startEpoch = epoch;
    const startActor = actor;
    const startGeneration = adminAccessGeneration(queryClient, startActor);

    try {
      const created = await createMutation.mutateAsync({
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

      await queryClient.cancelQueries({ queryKey: adminVouchersKeys.detail(actor, created.id) });

      if (
        getSessionEpoch() !== startEpoch ||
        adminAccessGeneration(queryClient, startActor) !== startGeneration
      ) {
        return;
      }

      queryClient.setQueryData(adminVouchersKeys.detail(actor, created.id), created);
      await queryClient.invalidateQueries({ queryKey: adminVouchersKeys.lists(actor) });

      if (
        getSessionEpoch() !== startEpoch ||
        adminAccessGeneration(queryClient, startActor) !== startGeneration
      ) {
        return;
      }

      setUncertainMarker(null);
      navigate(`/admin/vouchers/${created.id}`);
    } catch (err) {
      if (err instanceof SessionChangedError) return;

      if (err instanceof ApiError && err.body.statusCode === 403) {
        markForbidden();
        setFormNotice({ text: 'Tài khoản không còn quyền quản trị.', error: true });
        return;
      }

      if (err instanceof ApiError && err.body.statusCode === 409) {
        setFormNotice({
          text: `Mã giảm giá "${normCode}" đã tồn tại trên hệ thống. Vui lòng chọn mã khác.`,
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
        type: 'create',
        code: normCode,
        payload: payload as unknown as Record<string, unknown>,
        timestamp: Date.now(),
      };
      setUncertainMarker(marker);
      setFormNotice({
        text: 'Chưa rõ kết quả tạo mã do gián đoạn kết nối. Hệ thống đã tạm khóa để tránh tạo trùng lặp. Vui lòng nhấn kiểm tra lại.',
        error: true,
        recheck: true,
      });
    }
  }

  const activeNotice =
    formNotice ??
    (uncertainMarker
      ? {
          text: `Chưa rõ kết quả tạo mã ${uncertainMarker.code} do gián đoạn kết nối. Hệ thống đã tạm khóa để tránh gửi trùng lặp. Vui lòng nhấn kiểm tra lại.`,
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
          <h1 className={styles.title}>Tạo mã giảm giá mới</h1>
          <p className={styles.description}>
            Thiết lập mã khuyến mãi, hình thức giảm giá và các điều kiện ràng buộc.
          </p>
        </div>
      </header>

      {activeNotice && (
        <div
          ref={formNoticeRef}
          tabIndex={-1}
          className={`${styles.notice} ${activeNotice.error ? styles.noticeError : styles.noticeSuccess}`}
          role="status"
        >
          <span>{activeNotice.text}</span>
          {activeNotice.recheck && (
            <button
              type="button"
              className={styles.recheckButton}
              onClick={handleRecheck}
              disabled={rechecking}
            >
              {rechecking ? 'Đang kiểm tra…' : 'Kiểm tra lại'}
            </button>
          )}
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
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="VD: FREYA2026"
            />
            <span className={styles.formHint}>Từ 3-30 ký tự, tự động viết hoa</span>
            {validationErrors.code && (
              <span className={styles.fieldError}>{validationErrors.code}</span>
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="voucher-status">
              Trạng thái ban đầu *
            </label>
            <select
              id="voucher-status"
              className={styles.formSelect}
              value={status}
              onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
            >
              <option value="INACTIVE">Ngừng hoạt động (INACTIVE - An toàn)</option>
              <option value="ACTIVE">Kích hoạt ngay (ACTIVE)</option>
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
              onChange={(e) => setDiscountType(e.target.value as 'PERCENTAGE' | 'FIXED_AMOUNT')}
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
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder={discountType === 'PERCENTAGE' ? 'VD: 15 (tức 15%)' : 'VD: 50000'}
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
              onChange={(e) => setMaxDiscountAmount(e.target.value)}
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
              onChange={(e) => setMinOrderAmount(e.target.value)}
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
              onChange={(e) => setUsageLimit(e.target.value)}
              placeholder="Không giới hạn"
            />
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
              onChange={(e) => setPerUserLimit(e.target.value)}
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
              onChange={(e) => setStartsAt(e.target.value)}
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
              onChange={(e) => setEndsAt(e.target.value)}
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
            disabled={createMutation.isPending || Boolean(uncertainMarker)}
          >
            {createMutation.isPending ? 'Đang tạo…' : 'Tạo mã giảm giá'}
          </button>
        </div>
      </form>
    </div>
  );
}
