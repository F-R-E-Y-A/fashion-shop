import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { ApiError } from '@/core';
import {
  adminAccessGeneration,
  AdminForbidden,
  useAdminForbidden,
  useAuth,
} from '@/features/account';

import {
  type AdminPromotionItem,
  adminPromotionsKeys,
  type CreateAdminPromotionPayload,
  type DiscountType,
  doesPromotionMatchPayload,
  localDateTimeLocalToUtcIso,
  promotionErrorText,
  type PromotionStatus,
  sanitizeAdminReturnUrl,
  utcIsoToLocalDateTimeLocal,
} from './admin-promotions.api.js';
import styles from './AdminPromotions.module.css';
import { useUncertainMarker } from './use-admin-promotions.js';

export function AdminPromotionNewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = sanitizeAdminReturnUrl(searchParams.get('returnTo'), '/admin/promotions');
  const queryClient = useQueryClient();
  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actorId = user?.id ?? '';
  const { forbidden, markForbidden, guardQuery } = useAdminForbidden(actorId, getSessionEpoch);

  // Client-generated UUID cố định cho mỗi phiên soạn thảo form phục vụ idempotency
  const [localDraftId] = useState(() => crypto.randomUUID());

  const uncertainMarkerKey = adminPromotionsKeys.uncertainMarker(actorId, 'create', 'new');
  const uncertainMarker = useUncertainMarker<{ id: string; payload: CreateAdminPromotionPayload }>(
    uncertainMarkerKey,
  );

  const draftId = uncertainMarker?.id ?? localDraftId;
  const isUncertain = Boolean(uncertainMarker);

  // Trạng thái form
  const [name, setName] = useState(() => uncertainMarker?.payload.name ?? '');
  const [discountType, setDiscountType] = useState<DiscountType>(
    () => uncertainMarker?.payload.discountType ?? 'PERCENTAGE',
  );
  const [discountValue, setDiscountValue] = useState(
    () => uncertainMarker?.payload.discountValue ?? '',
  );
  const [maxDiscountAmount, setMaxDiscountAmount] = useState(
    () => uncertainMarker?.payload.maxDiscountAmount ?? '',
  );
  const [minOrderAmount, setMinOrderAmount] = useState(
    () => uncertainMarker?.payload.minOrderAmount ?? '',
  );
  const [startsAt, setStartsAt] = useState(() =>
    uncertainMarker?.payload.startsAt
      ? utcIsoToLocalDateTimeLocal(uncertainMarker.payload.startsAt)
      : '',
  );
  const [endsAt, setEndsAt] = useState(() =>
    uncertainMarker?.payload.endsAt
      ? utcIsoToLocalDateTimeLocal(uncertainMarker.payload.endsAt)
      : '',
  );
  const [status, setStatus] = useState<PromotionStatus>(
    () => uncertainMarker?.payload.status ?? 'INACTIVE',
  ); // Mặc định INACTIVE theo yêu cầu MVP

  // Trạng thái lỗi và gửi request
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = 'Vui lòng nhập tên chương trình';
    } else if (name.trim().length < 3) {
      errors.name = 'Tên chương trình tối thiểu 3 ký tự';
    } else if (name.trim().length > 100) {
      errors.name = 'Tên chương trình tối đa 100 ký tự';
    }

    const valNum = Number(discountValue);
    if (!discountValue || isNaN(valNum) || valNum <= 0) {
      errors.discountValue = 'Giá trị giảm phải là số lớn hơn 0';
    } else if (discountType === 'PERCENTAGE' && valNum > 100) {
      errors.discountValue = 'Mức giảm phần trăm không được vượt quá 100%';
    }

    if (maxDiscountAmount) {
      const maxNum = Number(maxDiscountAmount);
      if (isNaN(maxNum) || maxNum <= 0) {
        errors.maxDiscountAmount = 'Mức giảm tối đa phải là số lớn hơn 0';
      }
    }

    if (minOrderAmount) {
      const minNum = Number(minOrderAmount);
      if (isNaN(minNum) || minNum < 0) {
        errors.minOrderAmount = 'Giá trị đơn tối thiểu không được âm';
      }
    }

    if (startsAt && endsAt) {
      const startMs = new Date(startsAt).getTime();
      const endMs = new Date(endsAt).getTime();
      if (endMs <= startMs) {
        errors.endsAt = 'Thời gian kết thúc phải sau thời gian bắt đầu';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate() || isSubmitting || Boolean(uncertainMarker)) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const payload: CreateAdminPromotionPayload = {
      id: draftId,
      name: name.trim(),
      discountType,
      discountValue: discountValue.trim(),
      maxDiscountAmount: maxDiscountAmount.trim() || null,
      minOrderAmount: minOrderAmount.trim() || null,
      status,
      startsAt: startsAt ? localDateTimeLocalToUtcIso(startsAt) : null,
      endsAt: endsAt ? localDateTimeLocalToUtcIso(endsAt) : null,
      conditions: null,
    };

    const submitEpoch = getSessionEpoch();
    const access = adminAccessGeneration(queryClient, actorId);

    try {
      const created = await guardQuery(() =>
        request<AdminPromotionItem>('/admin/promotions', {
          method: 'POST',
          body: payload,
        }),
      );

      // Kiểm tra phiên sau await
      if (
        getSessionEpoch() !== submitEpoch ||
        adminAccessGeneration(queryClient, actorId) !== access
      ) {
        return;
      }

      await queryClient.cancelQueries({
        queryKey: adminPromotionsKeys.detail(actorId, created.id),
      });
      if (
        getSessionEpoch() !== submitEpoch ||
        adminAccessGeneration(queryClient, actorId) !== access
      ) {
        return;
      }

      // Xóa marker uncertain và cập nhật cache
      queryClient.setQueryData(uncertainMarkerKey, null);
      queryClient.setQueryData(adminPromotionsKeys.detail(actorId, created.id), created);
      void queryClient.invalidateQueries({ queryKey: adminPromotionsKeys.lists(actorId) });

      navigate(`/admin/promotions/${created.id}`);
    } catch (err) {
      if (
        getSessionEpoch() !== submitEpoch ||
        adminAccessGeneration(queryClient, actorId) !== access
      ) {
        return;
      }

      // Nếu lỗi 409 Conflict hoặc 400 Bad Request
      const statusCode = err instanceof ApiError ? err.body.statusCode : 0;
      if (statusCode === 403) {
        markForbidden();
        return;
      }
      if (statusCode > 0 && statusCode < 500) {
        setSubmitError(err instanceof Error ? err.message : promotionErrorText(err));
      } else {
        // Lỗi 5xx hoặc mất mạng/timeout -> lưu marker uncertain vào cache
        queryClient.setQueryData(uncertainMarkerKey, { id: draftId, payload });
        setSubmitError(
          'Kết quả chưa được xác nhận: Không nhận được phản hồi xác nhận từ máy chủ. Chiến dịch có thể đã được tạo hoặc đang chờ xử lý.',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Kiểm tra lại trạng thái bản ghi khi mất phản hồi */
  const handleRecheck = async () => {
    if (!uncertainMarker) return;
    setIsChecking(true);
    const checkEpoch = getSessionEpoch();
    const checkAccess = adminAccessGeneration(queryClient, actorId);

    try {
      const checkResult = await guardQuery(() =>
        request<AdminPromotionItem>(`/admin/promotions/${encodeURIComponent(uncertainMarker.id)}`),
      );

      if (
        getSessionEpoch() !== checkEpoch ||
        adminAccessGeneration(queryClient, actorId) !== checkAccess
      ) {
        return;
      }

      // Nếu máy chủ đã lưu và khớp payload -> hoàn tất
      if (
        doesPromotionMatchPayload(
          checkResult,
          uncertainMarker.payload as unknown as Record<string, unknown>,
        )
      ) {
        await queryClient.cancelQueries({
          queryKey: adminPromotionsKeys.detail(actorId, checkResult.id),
        });
        if (
          getSessionEpoch() !== checkEpoch ||
          adminAccessGeneration(queryClient, actorId) !== checkAccess
        ) {
          return;
        }

        queryClient.setQueryData(uncertainMarkerKey, null);
        queryClient.setQueryData(adminPromotionsKeys.detail(actorId, checkResult.id), checkResult);
        void queryClient.invalidateQueries({ queryKey: adminPromotionsKeys.lists(actorId) });
        navigate(`/admin/promotions/${checkResult.id}`);
      } else {
        setSubmitError(
          'Mã định danh đã tồn tại nhưng dữ liệu khác biệt. Vui lòng đối chiếu với danh sách.',
        );
      }
    } catch (err) {
      if (
        getSessionEpoch() !== checkEpoch ||
        adminAccessGeneration(queryClient, actorId) !== checkAccess
      ) {
        return;
      }

      const statusCode = err instanceof ApiError ? err.body.statusCode : 0;
      if (statusCode === 404) {
        // Máy chủ chưa lưu -> giữ marker để bảo toàn định danh và payload
        setSubmitError(
          'Máy chủ chưa nhận được yêu cầu trước. Yêu cầu có thể đang được xử lý hoặc đã thất bại. Nút lưu bị khóa để bảo toàn định danh.',
        );
      } else {
        setSubmitError('Vẫn chưa thể kết nối tới máy chủ để kiểm tra. Vui lòng thử lại sau.');
      }
    } finally {
      setIsChecking(false);
    }
  };

  if (forbidden) {
    return <AdminForbidden />;
  }

  return (
    <div className={styles.container}>
      <nav className={styles.breadcrumbs} aria-label="Đường dẫn">
        <Link to={returnTo} className={styles.breadcrumbLink}>
          Khuyến mãi
        </Link>
        <span className={styles.breadcrumbSeparator}>/</span>
        <span className={styles.breadcrumbCurrent}>Tạo chiến dịch mới</span>
      </nav>

      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>Tạo chiến dịch khuyến mãi mới</h1>
          <p className={styles.subtitle}>Thiết lập chương trình giảm giá đơn giản cho cửa hàng</p>
        </div>
      </header>

      {Boolean(uncertainMarker) && (
        <div role="alert" className={`${styles.banner} ${styles.bannerWarning}`}>
          <div className={styles.bannerTitle}>Kết quả chưa được xác nhận</div>
          <div>
            {submitError ??
              'Chưa rõ kết quả tạo chiến dịch do gián đoạn kết nối. Hệ thống đã tạm khóa để tránh gửi trùng lặp. Vui lòng nhấn kiểm tra lại.'}
          </div>
          <div className={styles.bannerActions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => void handleRecheck()}
              disabled={isChecking}
            >
              {isChecking ? 'Đang kiểm tra...' : 'Kiểm tra lại trạng thái'}
            </button>
          </div>
        </div>
      )}

      {submitError && !uncertainMarker && (
        <div role="alert" className={`${styles.banner} ${styles.bannerError}`}>
          <div className={styles.bannerTitle}>Lỗi tạo chiến dịch</div>
          <div>{submitError}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <section className={styles.formSection}>
          <div className={styles.formGrid}>
            <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
              <label htmlFor="promo-name" className={styles.label}>
                Tên chương trình khuyến mãi *
              </label>
              <input
                id="promo-name"
                type="text"
                className={styles.input}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: '' }));
                }}
                placeholder="Ví dụ: Khuyến mãi Khai trương mùa Thu"
                disabled={isSubmitting || isUncertain}
                required
              />
              {fieldErrors.name && <span className={styles.fieldError}>{fieldErrors.name}</span>}
              <span className={styles.hint}>
                Tên hiển thị nội bộ và trên các thông báo khuyến mãi (từ 3 đến 100 ký tự)
              </span>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="promo-type" className={styles.label}>
                Loại giảm giá *
              </label>
              <select
                id="promo-type"
                className={styles.select}
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                disabled={isSubmitting || isUncertain}
              >
                <option value="PERCENTAGE">Theo phần trăm (%)</option>
                <option value="FIXED_AMOUNT">Số tiền cố định (VNĐ)</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="promo-val" className={styles.label}>
                Giá trị giảm *
              </label>
              <input
                id="promo-val"
                type="number"
                step="any"
                min="0"
                className={styles.input}
                value={discountValue}
                onChange={(e) => {
                  setDiscountValue(e.target.value);
                  if (fieldErrors.discountValue)
                    setFieldErrors((prev) => ({ ...prev, discountValue: '' }));
                }}
                placeholder={discountType === 'PERCENTAGE' ? 'Ví dụ: 15 (cho 15%)' : 'Ví dụ: 50000'}
                disabled={isSubmitting || isUncertain}
                required
              />
              {fieldErrors.discountValue && (
                <span className={styles.fieldError}>{fieldErrors.discountValue}</span>
              )}
            </div>

            {discountType === 'PERCENTAGE' && (
              <div className={styles.formGroup}>
                <label htmlFor="promo-max-cap" className={styles.label}>
                  Mức giảm tối đa (VNĐ)
                </label>
                <input
                  id="promo-max-cap"
                  type="number"
                  step="any"
                  min="0"
                  className={styles.input}
                  value={maxDiscountAmount}
                  onChange={(e) => {
                    setMaxDiscountAmount(e.target.value);
                    if (fieldErrors.maxDiscountAmount)
                      setFieldErrors((prev) => ({ ...prev, maxDiscountAmount: '' }));
                  }}
                  placeholder="Ví dụ: 150000"
                  disabled={isSubmitting || isUncertain}
                />
                {fieldErrors.maxDiscountAmount && (
                  <span className={styles.fieldError}>{fieldErrors.maxDiscountAmount}</span>
                )}
                <span className={styles.hint}>
                  Giới hạn số tiền giảm tối đa khi áp dụng phần trăm (để trống nếu không giới hạn)
                </span>
              </div>
            )}

            <div className={styles.formGroup}>
              <label htmlFor="promo-min-order" className={styles.label}>
                Đơn hàng tối thiểu (VNĐ)
              </label>
              <input
                id="promo-min-order"
                type="number"
                step="any"
                min="0"
                className={styles.input}
                value={minOrderAmount}
                onChange={(e) => {
                  setMinOrderAmount(e.target.value);
                  if (fieldErrors.minOrderAmount)
                    setFieldErrors((prev) => ({ ...prev, minOrderAmount: '' }));
                }}
                placeholder="Ví dụ: 300000"
                disabled={isSubmitting || isUncertain}
              />
              {fieldErrors.minOrderAmount && (
                <span className={styles.fieldError}>{fieldErrors.minOrderAmount}</span>
              )}
              <span className={styles.hint}>
                Giá trị đơn hàng tối thiểu để được hưởng khuyến mãi (để trống nếu không yêu cầu)
              </span>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="promo-starts" className={styles.label}>
                Thời điểm bắt đầu hiệu lực
              </label>
              <input
                id="promo-starts"
                type="datetime-local"
                className={styles.input}
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                disabled={isSubmitting || isUncertain}
              />
              <span className={styles.hint}>Múi giờ địa phương (để trống nếu áp dụng ngay)</span>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="promo-ends" className={styles.label}>
                Thời điểm kết thúc hiệu lực
              </label>
              <input
                id="promo-ends"
                type="datetime-local"
                className={styles.input}
                value={endsAt}
                onChange={(e) => {
                  setEndsAt(e.target.value);
                  if (fieldErrors.endsAt) setFieldErrors((prev) => ({ ...prev, endsAt: '' }));
                }}
                disabled={isSubmitting || isUncertain}
              />
              {fieldErrors.endsAt && (
                <span className={styles.fieldError}>{fieldErrors.endsAt}</span>
              )}
              <span className={styles.hint}>Để trống nếu không giới hạn thời gian kết thúc</span>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="promo-status" className={styles.label}>
                Trạng thái ban đầu
              </label>
              <select
                id="promo-status"
                className={styles.select}
                value={status}
                onChange={(e) => setStatus(e.target.value as PromotionStatus)}
                disabled={isSubmitting || isUncertain}
              >
                <option value="INACTIVE">Ngưng hoạt động (Mặc định)</option>
                <option value="ACTIVE">Kích hoạt ngay</option>
              </select>
              <span className={styles.hint}>
                Khuyên dùng: Để ở trạng thái Ngưng hoạt động để kiểm tra kỹ trước khi kích hoạt
              </span>
            </div>
          </div>

          <div
            style={{
              marginTop: '1.5rem',
              display: 'flex',
              gap: '1rem',
              justifyContent: 'flex-end',
            }}
          >
            <Link
              to={returnTo}
              className={`${styles.btn} ${styles.btnSecondary}`}
              style={{ pointerEvents: isSubmitting || Boolean(uncertainMarker) ? 'none' : 'auto' }}
            >
              Hủy
            </Link>
            <button
              type="submit"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={isSubmitting || Boolean(uncertainMarker)}
            >
              {isSubmitting ? 'Đang lưu...' : 'Lưu chiến dịch'}
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
