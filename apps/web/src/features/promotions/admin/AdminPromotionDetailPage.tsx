import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useCallback, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { ApiError } from '@/core';
import {
  adminAccessGeneration,
  AdminForbidden,
  useAdminForbidden,
  useAuth,
} from '@/features/account';
import { ActionFeedback, Loading } from '@/ui';

import {
  type AdminPromotionDetail,
  type AdminPromotionItem,
  adminPromotionsKeys,
  arePromotionFieldValuesEqual,
  type DiscountType,
  doesPromotionMatchPayload,
  isComplexPromotion,
  localDateTimeLocalToUtcIso,
  promotionErrorText,
  sanitizeAdminReturnUrl,
  type UpdateAdminPromotionPayload,
  utcIsoToLocalDateTimeLocal,
} from './admin-promotions.api.js';
import styles from './AdminPromotions.module.css';
import { usePromotionStatusAction } from './promotion-status-action.js';
import { useAdminPromotion, useUncertainMarker } from './use-admin-promotions.js';

export function AdminPromotionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const returnTo = sanitizeAdminReturnUrl(searchParams.get('returnTo'), '/admin/promotions');
  const queryClient = useQueryClient();
  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actorId = user?.id ?? '';
  const { forbidden, markForbidden, guardQuery } = useAdminForbidden(actorId, getSessionEpoch);

  const { data, forbidden: queryForbidden, isLoading, error, refetch } = useAdminPromotion(id);

  const uncertainMarkerKey = adminPromotionsKeys.uncertainMarker(actorId, 'edit', id ?? '');
  const uncertainMarker = useUncertainMarker<{ id: string; payload: UpdateAdminPromotionPayload }>(
    uncertainMarkerKey,
  );

  // Trạng thái form
  const [name, setName] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('');
  const [maxDiscountAmount, setMaxDiscountAmount] = useState('');
  const [minOrderAmount, setMinOrderAmount] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  // Theo dõi dirty fields và base snapshot token
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());
  const markDirty = (field: string) => {
    setDirtyFields((prev) => {
      const next = new Set(prev);
      next.add(field);
      return next;
    });
  };

  const [casToken, setCasToken] = useState<string>('');
  const [baseSnapshot, setBaseSnapshot] = useState<AdminPromotionDetail | null>(null);
  const [lastKnownData, setLastKnownData] = useState<AdminPromotionDetail | null>(null);
  const [initialSyncedId, setInitialSyncedId] = useState<string | null>(null);

  // Trạng thái thông báo và submitting
  const sessionEpoch = getSessionEpoch();
  const sessionScope = `${actorId}:${sessionEpoch}`;
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNoticeState] = useState<{
    key: number;
    scope: string;
    text: string;
    error?: boolean;
  } | null>(null);
  const setNotice = useCallback(
    (next: { text: string; error?: boolean } | null) => {
      if (!next) {
        setNoticeState(null);
        return;
      }
      setNoticeState((prev) => ({
        ...next,
        key: (prev?.key ?? 0) + 1,
        scope: sessionScope,
      }));
    },
    [sessionScope],
  );
  const clearNotice = useCallback(() => setNoticeState(null), []);
  const scopedNotice = notice?.scope === sessionScope ? notice : null;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  // Đồng bộ dữ liệu máy chủ vào form (bảo toàn dirty draft khi refetch)
  if (data && data.id !== initialSyncedId) {
    setInitialSyncedId(data.id);
    setLastKnownData(data);
    setBaseSnapshot(data);
    setName(data.name);
    setDiscountType(data.discountType);
    setDiscountValue(data.discountValue);
    setMaxDiscountAmount(data.maxDiscountAmount ?? '');
    setMinOrderAmount(data.minOrderAmount ?? '');
    setStartsAt(utcIsoToLocalDateTimeLocal(data.startsAt));
    setEndsAt(utcIsoToLocalDateTimeLocal(data.endsAt));
    setCasToken(data.updatedAt);
  } else if (data && data !== lastKnownData) {
    setLastKnownData(data);
    const base = baseSnapshot ?? data;
    const dirty = dirtyFields;

    let dirtyConflict = false;
    for (const f of dirty) {
      const baseVal = (base as unknown as Record<string, unknown>)[f];
      const freshVal = (data as unknown as Record<string, unknown>)[f];
      if (!arePromotionFieldValuesEqual(f, baseVal, freshVal)) {
        dirtyConflict = true;
        break;
      }
    }

    if (dirtyConflict) {
      setNotice({
        text: 'Một số trường bạn đang chỉnh sửa vừa bị thay đổi bởi người khác trên máy chủ. Bản thảo đang gõ của bạn được giữ nguyên.',
        error: true,
      });
      // Không cập nhật baseSnapshot hay casToken khi xung đột
      if (!dirty.has('name')) setName(data.name);
      if (!dirty.has('discountType')) setDiscountType(data.discountType);
      if (!dirty.has('discountValue')) setDiscountValue(data.discountValue);
      if (!dirty.has('maxDiscountAmount')) setMaxDiscountAmount(data.maxDiscountAmount ?? '');
      if (!dirty.has('minOrderAmount')) setMinOrderAmount(data.minOrderAmount ?? '');
      if (!dirty.has('startsAt')) setStartsAt(utcIsoToLocalDateTimeLocal(data.startsAt));
      if (!dirty.has('endsAt')) setEndsAt(utcIsoToLocalDateTimeLocal(data.endsAt));
    } else {
      // Chỉ đổi trường sạch: nâng baseSnapshot và casToken
      setBaseSnapshot(data);
      setCasToken(data.updatedAt);
      if (!dirty.has('name')) setName(data.name);
      if (!dirty.has('discountType')) setDiscountType(data.discountType);
      if (!dirty.has('discountValue')) setDiscountValue(data.discountValue);
      if (!dirty.has('maxDiscountAmount')) setMaxDiscountAmount(data.maxDiscountAmount ?? '');
      if (!dirty.has('minOrderAmount')) setMinOrderAmount(data.minOrderAmount ?? '');
      if (!dirty.has('startsAt')) setStartsAt(utcIsoToLocalDateTimeLocal(data.startsAt));
      if (!dirty.has('endsAt')) setEndsAt(utcIsoToLocalDateTimeLocal(data.endsAt));
    }
  }

  const statusAction = usePromotionStatusAction(() => {
    void refetch();
  });

  const complex = data ? isComplexPromotion(data) : false;

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

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!data || complex || !validate() || isSubmitting) return;

    setIsSubmitting(true);
    setNotice(null);

    const dirty = dirtyFields;
    if (dirty.size === 0) {
      setNotice({ text: 'Không có thay đổi nào cần lưu.', error: false });
      setIsSubmitting(false);
      return;
    }

    const payload: UpdateAdminPromotionPayload = {
      expectedUpdatedAt: casToken,
    };

    if (dirty.has('name')) payload.name = name.trim();
    if (dirty.has('discountType')) payload.discountType = discountType;
    if (dirty.has('discountValue')) payload.discountValue = discountValue.trim();
    if (dirty.has('maxDiscountAmount'))
      payload.maxDiscountAmount = maxDiscountAmount.trim() || null;
    if (dirty.has('minOrderAmount')) payload.minOrderAmount = minOrderAmount.trim() || null;
    if (dirty.has('startsAt'))
      payload.startsAt = startsAt ? localDateTimeLocalToUtcIso(startsAt) : null;
    if (dirty.has('endsAt')) payload.endsAt = endsAt ? localDateTimeLocalToUtcIso(endsAt) : null;

    const submitEpoch = getSessionEpoch();
    const access = adminAccessGeneration(queryClient, actorId);

    try {
      const updated = await guardQuery(() =>
        request<AdminPromotionItem>(`/admin/promotions/${encodeURIComponent(data.id)}`, {
          method: 'PATCH',
          body: payload,
        }),
      );

      if (
        getSessionEpoch() !== submitEpoch ||
        adminAccessGeneration(queryClient, actorId) !== access
      ) {
        return;
      }

      await queryClient.cancelQueries({
        queryKey: adminPromotionsKeys.detail(actorId, updated.id),
      });
      if (
        getSessionEpoch() !== submitEpoch ||
        adminAccessGeneration(queryClient, actorId) !== access
      ) {
        return;
      }

      setDirtyFields(new Set());
      setCasToken(updated.updatedAt);
      setBaseSnapshot(updated);
      setLastKnownData(updated);

      queryClient.setQueryData(uncertainMarkerKey, null);
      queryClient.setQueryData(adminPromotionsKeys.detail(actorId, updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: adminPromotionsKeys.lists(actorId) });

      setNotice({ text: 'Đã cập nhật chiến dịch thành công.', error: false });
    } catch (err) {
      if (
        getSessionEpoch() !== submitEpoch ||
        adminAccessGeneration(queryClient, actorId) !== access
      ) {
        return;
      }

      const statusCode = err instanceof ApiError ? err.body.statusCode : 0;
      if (statusCode === 403) {
        markForbidden();
        return;
      }
      if (statusCode === 409) {
        setNotice({
          text: 'Dữ liệu trên máy chủ đã thay đổi bởi phiên khác. Bản thảo đang gõ được giữ nguyên. Vui lòng bấm "Tải lại dữ liệu" để xem nội dung mới nhất.',
          error: true,
        });
      } else if (statusCode > 0 && statusCode < 500) {
        setNotice({
          text: err instanceof Error ? err.message : promotionErrorText(err),
          error: true,
        });
      } else {
        // Lỗi 5xx hoặc mất mạng/timeout -> lưu marker uncertain vào cache và khóa form
        queryClient.setQueryData(uncertainMarkerKey, { id: data.id, payload });
        setNotice({
          text: err instanceof Error ? err.message : 'Không nhận được phản hồi từ máy chủ.',
          error: true,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecheck = async () => {
    if (!id || !uncertainMarker) return;
    setIsChecking(true);
    const checkEpoch = getSessionEpoch();
    const checkAccess = adminAccessGeneration(queryClient, actorId);
    try {
      const fresh = await guardQuery(() =>
        request<AdminPromotionItem>(`/admin/promotions/${encodeURIComponent(id)}`),
      );
      if (
        getSessionEpoch() !== checkEpoch ||
        adminAccessGeneration(queryClient, actorId) !== checkAccess
      ) {
        return;
      }

      if (doesPromotionMatchPayload(fresh, uncertainMarker.payload as Record<string, unknown>)) {
        await queryClient.cancelQueries({ queryKey: adminPromotionsKeys.detail(actorId, id) });
        if (
          getSessionEpoch() !== checkEpoch ||
          adminAccessGeneration(queryClient, actorId) !== checkAccess
        ) {
          return;
        }

        setDirtyFields(new Set());
        setCasToken(fresh.updatedAt);
        setBaseSnapshot(fresh);
        setLastKnownData(fresh);
        queryClient.setQueryData(uncertainMarkerKey, null);
        queryClient.setQueryData(adminPromotionsKeys.detail(actorId, fresh.id), fresh);
        void queryClient.invalidateQueries({ queryKey: adminPromotionsKeys.lists(actorId) });
        setNotice({
          text: 'Đã đối chiếu thành công: Thay đổi đã được lưu trên máy chủ.',
          error: false,
        });
      } else {
        setNotice({
          text: 'Máy chủ chưa ghi nhận thay đổi của bạn (vẫn đang xử lý hoặc chưa nhận được). Thao tác tiếp tục bị khóa để bảo toàn định danh.',
          error: true,
        });
      }
    } catch {
      setNotice({ text: 'Vẫn chưa thể kết nối tới máy chủ để kiểm tra.', error: true });
    } finally {
      setIsChecking(false);
    }
  };

  const handleReload = () => {
    setDirtyFields(new Set());
    setInitialSyncedId(null);
    setLastKnownData(null);
    setBaseSnapshot(null);
    setNotice(null);
    queryClient.setQueryData(uncertainMarkerKey, null);
    void refetch();
  };

  if (forbidden || queryForbidden) {
    return <AdminForbidden />;
  }

  return (
    <div className={styles.container}>
      <nav className={styles.breadcrumbs} aria-label="Đường dẫn">
        <Link to={returnTo} className={styles.breadcrumbLink}>
          Khuyến mãi
        </Link>
        <span className={styles.breadcrumbSeparator}>/</span>
        <span className={styles.breadcrumbCurrent}>{data ? data.name : 'Chi tiết chiến dịch'}</span>
      </nav>

      {isLoading && (
        <div className={styles.emptyState}>
          <Loading />
          <p>Đang tải chi tiết chiến dịch...</p>
        </div>
      )}

      {Boolean(error) && !isLoading && (
        <div role="alert" className={`${styles.banner} ${styles.bannerError}`}>
          <div className={styles.bannerTitle}>Không tìm thấy chiến dịch</div>
          <div>{promotionErrorText(error)}</div>
          <div className={styles.bannerActions}>
            <Link to={returnTo} className={`${styles.btn} ${styles.btnSecondary}`}>
              Về danh sách
            </Link>
          </div>
        </div>
      )}

      {data && (
        <>
          <header className={styles.header}>
            <div className={styles.titleGroup}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}
              >
                <h1 className={styles.title}>{data.name}</h1>
                <span
                  className={`${styles.badge} ${data.status === 'ACTIVE' ? styles.badgeActive : styles.badgeInactive}`}
                >
                  {data.status === 'ACTIVE' ? 'Đang hoạt động' : 'Ngưng hoạt động'}
                </span>
                {complex && (
                  <span className={`${styles.badge} ${styles.badgeComplex}`}>
                    Cấu hình nâng cao (Chỉ xem)
                  </span>
                )}
              </div>
              <p className={styles.subtitle}>ID: {data.id}</p>
            </div>

            {!complex && (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={(e) => statusAction.openDialog(data, e.currentTarget)}
                disabled={Boolean(uncertainMarker)}
              >
                {data.status === 'ACTIVE' ? 'Ngưng chiến dịch' : 'Kích hoạt chiến dịch'}
              </button>
            )}
          </header>

          {complex && (
            <div role="alert" className={`${styles.banner} ${styles.bannerWarning}`}>
              <div className={styles.bannerTitle}>Chế độ Chỉ xem (Read-only)</div>
              <div>
                Chiến dịch này có cấu hình điều kiện nâng cao (JsonB). Hiện tại giao diện quản trị
                chỉ hỗ trợ xem thông tin, không cho phép chỉnh sửa hoặc chuyển đổi trạng thái để bảo
                vệ tính toàn vẹn của động cơ khuyến mãi.
              </div>
            </div>
          )}

          {Boolean(uncertainMarker) && (
            <div role="alert" className={`${styles.banner} ${styles.bannerWarning}`}>
              <div className={styles.bannerTitle}>Kết quả chưa được xác nhận</div>
              <div>
                {scopedNotice?.text ??
                  'Chưa rõ kết quả cập nhật do gián đoạn kết nối. Hệ thống đã tạm khóa để tránh gửi trùng lặp.'}
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

          {scopedNotice && !uncertainMarker && (
            <ActionFeedback
              noticeKey={scopedNotice.key}
              sessionScope={sessionScope}
              tone={scopedNotice.error ? 'error' : 'success'}
              message={scopedNotice.text}
              onDismiss={clearNotice}
              action={
                scopedNotice.error
                  ? { label: 'Tải lại dữ liệu mới nhất', onClick: handleReload }
                  : undefined
              }
            />
          )}

          {statusAction.notice && (
            <ActionFeedback
              noticeKey={statusAction.notice.key}
              sessionScope={statusAction.sessionScope}
              tone={statusAction.notice.error ? 'error' : 'success'}
              message={statusAction.notice.text}
              onDismiss={statusAction.clearNotice}
            />
          )}

          <form onSubmit={handleSave} noValidate>
            <section className={styles.formSection}>
              <div className={styles.formGrid}>
                <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                  <label htmlFor="detail-name" className={styles.label}>
                    Tên chương trình khuyến mãi *
                  </label>
                  <input
                    id="detail-name"
                    type="text"
                    className={styles.input}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      markDirty('name');
                      if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: '' }));
                    }}
                    disabled={complex || isSubmitting}
                    required
                  />
                  {fieldErrors.name && (
                    <span className={styles.fieldError}>{fieldErrors.name}</span>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="detail-type" className={styles.label}>
                    Loại giảm giá *
                  </label>
                  <select
                    id="detail-type"
                    className={styles.select}
                    value={discountType}
                    onChange={(e) => {
                      setDiscountType(e.target.value as DiscountType);
                      markDirty('discountType');
                    }}
                    disabled={complex || isSubmitting}
                  >
                    <option value="PERCENTAGE">Theo phần trăm (%)</option>
                    <option value="FIXED_AMOUNT">Số tiền cố định (VNĐ)</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="detail-val" className={styles.label}>
                    Giá trị giảm *
                  </label>
                  <input
                    id="detail-val"
                    type="number"
                    step="any"
                    min="0"
                    className={styles.input}
                    value={discountValue}
                    onChange={(e) => {
                      setDiscountValue(e.target.value);
                      markDirty('discountValue');
                      if (fieldErrors.discountValue)
                        setFieldErrors((p) => ({ ...p, discountValue: '' }));
                    }}
                    disabled={complex || isSubmitting}
                    required
                  />
                  {fieldErrors.discountValue && (
                    <span className={styles.fieldError}>{fieldErrors.discountValue}</span>
                  )}
                </div>

                {discountType === 'PERCENTAGE' && (
                  <div className={styles.formGroup}>
                    <label htmlFor="detail-max-cap" className={styles.label}>
                      Mức giảm tối đa (VNĐ)
                    </label>
                    <input
                      id="detail-max-cap"
                      type="number"
                      step="any"
                      min="0"
                      className={styles.input}
                      value={maxDiscountAmount}
                      onChange={(e) => {
                        setMaxDiscountAmount(e.target.value);
                        markDirty('maxDiscountAmount');
                        if (fieldErrors.maxDiscountAmount)
                          setFieldErrors((p) => ({ ...p, maxDiscountAmount: '' }));
                      }}
                      placeholder="Không giới hạn"
                      disabled={complex || isSubmitting}
                    />
                    {fieldErrors.maxDiscountAmount && (
                      <span className={styles.fieldError}>{fieldErrors.maxDiscountAmount}</span>
                    )}
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label htmlFor="detail-min-order" className={styles.label}>
                    Đơn hàng tối thiểu (VNĐ)
                  </label>
                  <input
                    id="detail-min-order"
                    type="number"
                    step="any"
                    min="0"
                    className={styles.input}
                    value={minOrderAmount}
                    onChange={(e) => {
                      setMinOrderAmount(e.target.value);
                      markDirty('minOrderAmount');
                      if (fieldErrors.minOrderAmount)
                        setFieldErrors((p) => ({ ...p, minOrderAmount: '' }));
                    }}
                    placeholder="Không yêu cầu"
                    disabled={complex || isSubmitting}
                  />
                  {fieldErrors.minOrderAmount && (
                    <span className={styles.fieldError}>{fieldErrors.minOrderAmount}</span>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="detail-starts" className={styles.label}>
                    Thời điểm bắt đầu hiệu lực
                  </label>
                  <input
                    id="detail-starts"
                    type="datetime-local"
                    className={styles.input}
                    value={startsAt}
                    onChange={(e) => {
                      setStartsAt(e.target.value);
                      markDirty('startsAt');
                    }}
                    disabled={complex || isSubmitting}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="detail-ends" className={styles.label}>
                    Thời điểm kết thúc hiệu lực
                  </label>
                  <input
                    id="detail-ends"
                    type="datetime-local"
                    className={styles.input}
                    value={endsAt}
                    onChange={(e) => {
                      setEndsAt(e.target.value);
                      markDirty('endsAt');
                      if (fieldErrors.endsAt) setFieldErrors((p) => ({ ...p, endsAt: '' }));
                    }}
                    disabled={complex || isSubmitting}
                  />
                  {fieldErrors.endsAt && (
                    <span className={styles.fieldError}>{fieldErrors.endsAt}</span>
                  )}
                </div>
              </div>

              {complex && (
                <div style={{ marginTop: '1.5rem' }}>
                  <label
                    className={styles.label}
                    style={{ marginBottom: '0.5rem', display: 'block' }}
                  >
                    Nội dung cấu hình điều kiện nâng cao (JsonB):
                  </label>
                  <pre className={styles.jsonViewer}>
                    <code>{JSON.stringify(data.conditions, null, 2)}</code>
                  </pre>
                </div>
              )}

              <div
                style={{
                  marginTop: '1.5rem',
                  display: 'flex',
                  gap: '1rem',
                  justifyContent: 'flex-end',
                }}
              >
                <Link to={returnTo} className={`${styles.btn} ${styles.btnSecondary}`}>
                  Quay lại
                </Link>
                {!complex && (
                  <button
                    type="submit"
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    disabled={isSubmitting || dirtyFields.size === 0 || Boolean(uncertainMarker)}
                  >
                    {isSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </button>
                )}
              </div>
            </section>
          </form>

          {statusAction.DialogComponent()}
        </>
      )}
    </div>
  );
}
