import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState, useSyncExternalStore } from 'react';

import { ApiError, formatDateTime } from '@/core';
import { useAuth } from '@/features/account';

import { submitReview } from '../api/reviews.api.js';
import {
  clearInDoubtSubmission,
  getInDoubtSubmission,
  hasActiveRequest,
  registerActiveRequest,
  setInDoubtSubmission,
  subscribeInDoubtStore,
  unregisterActiveRequest,
} from '../lib/review-in-doubt-store.js';
import type { OrderReviewItemContext } from '../types.js';
import styles from './OrderReviewItem.module.css';

interface OrderReviewItemProps {
  orderId: string;
  itemContext?: OrderReviewItemContext;
  loading?: boolean;
  contextError?: Error | null;
  onRetryContext?: () => void;
  onReviewSubmitted: () => void;
}

interface ReviewMutationVariables {
  requestId: string;
  actorId: string;
  orderItemId: string;
  rating: number;
  content: string | null;
  epoch: number;
  submittedAt: number;
  abortController?: AbortController;
}

export function OrderReviewItem({
  itemContext,
  loading,
  contextError,
  onRetryContext,
  onReviewSubmitted,
}: OrderReviewItemProps) {
  const { user, authenticatedRequest, getSessionEpoch } = useAuth();
  const actorId = user?.id;
  const orderItemId = itemContext?.orderItemId;

  const inDoubt = useSyncExternalStore(
    subscribeInDoubtStore,
    () => (actorId && orderItemId ? getInDoubtSubmission(actorId, orderItemId) : undefined),
    () => undefined,
  );

  // Neu server da co review hoac xac nhan khong du dieu kien: giai toa marker
  useEffect(() => {
    if (actorId && orderItemId) {
      if (itemContext?.review || (itemContext && !itemContext.eligible)) {
        clearInDoubtSubmission(actorId, orderItemId);
      }
    }
  }, [actorId, orderItemId, itemContext]);

  const [isOpen, setIsOpen] = useState(() => Boolean(inDoubt));
  const [rating, setRating] = useState<number>(() => inDoubt?.rating ?? 0);
  const [content, setContent] = useState(() => inDoubt?.content ?? '');
  const [errorMessage, setErrorMessage] = useState<string | null>(() => inDoubt?.error ?? null);

  // Reset local form state khi component duoc tai su dung cho dong hang khac
  const [prevOrderItemId, setPrevOrderItemId] = useState(orderItemId);
  if (orderItemId !== prevOrderItemId) {
    setPrevOrderItemId(orderItemId);
    setIsOpen(Boolean(inDoubt));
    setRating(inDoubt?.rating ?? 0);
    setContent(inDoubt?.content ?? '');
    setErrorMessage(inDoubt?.error ?? null);
  }

  const mutation = useMutation({
    mutationFn: (variables: ReviewMutationVariables) =>
      submitReview(
        authenticatedRequest,
        {
          orderItemId: variables.orderItemId,
          rating: variables.rating,
          content: variables.content,
        },
        variables.abortController?.signal,
      ),
    onSuccess: (_data, variables) => {
      const currentEpoch = getSessionEpoch?.() ?? 0;

      // Neu response den tu phien cu (variables.epoch < currentEpoch):
      // Bo qua, khong duoc xoa marker hay tac dong UI phien moi
      if (variables.epoch < currentEpoch) {
        unregisterActiveRequest(variables.actorId, variables.orderItemId, variables.requestId);
        return;
      }

      // Luon giai toa marker va active request theo dung identity goc da gui
      clearInDoubtSubmission(variables.actorId, variables.orderItemId, {
        sessionEpoch: variables.epoch,
        requestId: variables.requestId,
      });
      unregisterActiveRequest(variables.actorId, variables.orderItemId, variables.requestId);

      // Fencing: Chi cap nhat UI va refetch neu component van dang hien thi dung actor/dong hang/epoch
      const isCurrentView =
        actorId === variables.actorId &&
        orderItemId === variables.orderItemId &&
        currentEpoch === variables.epoch;

      if (isCurrentView) {
        setIsOpen(false);
        setRating(0);
        setContent('');
        setErrorMessage(null);
        onReviewSubmitted();
      }
    },
    onError: (err: Error, variables) => {
      const currentEpoch = getSessionEpoch?.() ?? 0;
      const isAbortedOrSessionChanged =
        err.name === 'AbortError' ||
        err.message === 'SessionChangedError' ||
        err.message?.includes('aborted');

      // Neu request thuoc phien cu (variables.epoch < currentEpoch) hoac bi abort do doi phien:
      // Bo qua, khong ghi de marker hay UI cua phien moi
      if (
        variables.epoch < currentEpoch ||
        (isAbortedOrSessionChanged && variables.epoch !== currentEpoch)
      ) {
        unregisterActiveRequest(variables.actorId, variables.orderItemId, variables.requestId);
        return;
      }

      const statusCode = err instanceof ApiError ? err.body.statusCode : undefined;

      // Luon cap nhat marker va unregister theo dung identity goc da gui
      if (statusCode === 409) {
        setInDoubtSubmission({
          actorId: variables.actorId,
          orderItemId: variables.orderItemId,
          rating: variables.rating,
          content: variables.content,
          sessionEpoch: variables.epoch,
          submittedAt: variables.submittedAt,
          status: 'conflict',
          error: err.message || 'Đánh giá cho sản phẩm này đã được ghi nhận.',
          requestId: variables.requestId,
        });
      } else if (statusCode && statusCode >= 400 && statusCode < 500) {
        clearInDoubtSubmission(variables.actorId, variables.orderItemId, {
          sessionEpoch: variables.epoch,
          requestId: variables.requestId,
        });
      } else {
        // Timeout, Network Error, 5xx: ket qua chua ro -> freeze payload va marker
        setInDoubtSubmission({
          actorId: variables.actorId,
          orderItemId: variables.orderItemId,
          rating: variables.rating,
          content: variables.content,
          sessionEpoch: variables.epoch,
          submittedAt: variables.submittedAt,
          status: 'unknown_error',
          error: err.message || 'Lỗi mạng hoặc máy chủ. Kết quả gửi chưa rõ.',
          requestId: variables.requestId,
        });
      }

      // Fencing: Chi cap nhat UI va refetch neu component van dang hien thi dung actor/dong hang/epoch
      const isCurrentView =
        actorId === variables.actorId &&
        orderItemId === variables.orderItemId &&
        currentEpoch === variables.epoch;

      if (isCurrentView) {
        setErrorMessage(
          err.message ||
            (statusCode === 409
              ? 'Đánh giá cho sản phẩm này đã được ghi nhận.'
              : statusCode && statusCode >= 400 && statusCode < 500
                ? 'Yêu cầu không hợp lệ.'
                : 'Lỗi mạng hoặc máy chủ. Kết quả gửi chưa rõ.'),
        );
        if (statusCode === 409) {
          onReviewSubmitted();
        }
      }
    },
    onSettled: (_data, _err, variables) => {
      if (variables) {
        unregisterActiveRequest(variables.actorId, variables.orderItemId, variables.requestId);
      }
    },
  });

  const isMutationPendingForThisItem =
    mutation.isPending &&
    mutation.variables?.actorId === actorId &&
    mutation.variables?.orderItemId === orderItemId;

  const isRequestLive = Boolean(actorId && orderItemId && hasActiveRequest(actorId, orderItemId));
  const isPending =
    isMutationPendingForThisItem || (inDoubt?.status === 'in_flight' && isRequestLive);
  const isFrozen = Boolean(inDoubt && (inDoubt.status !== 'in_flight' || !isRequestLive));
  const isFormOpen = isOpen || isFrozen || Boolean(inDoubt);
  const activeRating = inDoubt ? inDoubt.rating : rating;
  const activeContent = inDoubt ? (inDoubt.content ?? '') : content;
  const activeErrorMessage = errorMessage ?? inDoubt?.error ?? null;
  const isInputsDisabled = isPending || isFrozen;

  // 1. Truong hop dang tai context
  if (loading && !itemContext) {
    return (
      <div className={styles.container} role="status" aria-live="polite">
        <p className={styles.loadingText}>Đang kiểm tra điều kiện đánh giá…</p>
      </div>
    );
  }

  // 2. Truong hop loi tai context hoac khong co du lieu context
  if (contextError || !itemContext) {
    return (
      <div className={styles.container} data-testid="order-review-context-error">
        <div className={styles.contextError} role="alert">
          <p className={styles.errorMessage}>
            {contextError?.message || 'Không thể tải thông tin đánh giá. Vui lòng thử lại.'}
          </p>
          {onRetryContext && (
            <button type="button" className={styles.retryButton} onClick={onRetryContext}>
              Thử lại
            </button>
          )}
        </div>
      </div>
    );
  }

  // 3. Truong hop da danh gia
  if (itemContext.review) {
    const rev = itemContext.review;
    const badgeClass =
      rev.moderationStatus === 'APPROVED'
        ? styles.badgeApproved
        : rev.moderationStatus === 'REJECTED'
          ? styles.badgeRejected
          : styles.badgePending;

    const badgeLabel =
      rev.moderationStatus === 'APPROVED'
        ? 'Đã duyệt'
        : rev.moderationStatus === 'REJECTED'
          ? 'Không được duyệt'
          : 'Đang chờ duyệt';

    return (
      <div className={styles.container} data-testid="order-review-reviewed">
        <div className={styles.reviewed}>
          <div className={styles.reviewedHeader}>
            <div>
              <span className={styles.ratingStars}>{rev.rating}/5 sao</span>
              <span className={styles.reviewDate}>· {formatDateTime(rev.createdAt)}</span>
            </div>
            <span className={`${styles.badge} ${badgeClass}`}>{badgeLabel}</span>
          </div>
          {rev.content && <p className={styles.reviewContent}>{rev.content}</p>}
        </div>
      </div>
    );
  }

  // 4. Truong hop chua du dieu kien danh gia (vi du chua DELIVERED)
  if (!itemContext.eligible) {
    let noticeText = 'Chưa đủ điều kiện đánh giá';
    if (itemContext.reasonCode === 'NOT_DELIVERED') {
      noticeText = 'Chưa đủ điều kiện đánh giá (đơn hàng chưa giao thành công)';
    } else if (itemContext.reasonCode === 'ALREADY_REVIEWED') {
      noticeText = 'Sản phẩm đã được đánh giá';
    }

    return (
      <div className={styles.container} data-testid="order-review-ineligible">
        <p className={styles.notice}>{noticeText}</p>
      </div>
    );
  }

  // 5. Truong hop du dieu kien danh gia
  if (!isFormOpen) {
    return (
      <div className={styles.container} data-testid="order-review-eligible">
        <button
          type="button"
          className={styles.writeButton}
          onClick={() => {
            setIsOpen(true);
            setErrorMessage(null);
          }}
        >
          Viết đánh giá
        </button>
      </div>
    );
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (rating < 1 || rating > 5) {
      setErrorMessage('Vui lòng chọn số sao từ 1 đến 5');
      return;
    }
    if (!actorId || !orderItemId) return;
    const normalizedContent = content.trim() || null;
    const epoch = getSessionEpoch?.() ?? 0;
    setErrorMessage(null);

    const controller = new AbortController();
    const requestId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${actorId}:${orderItemId}:${epoch}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
    const submittedAt = Date.now();

    registerActiveRequest(actorId, orderItemId, {
      requestId,
      epoch,
      abortController: controller,
    });

    setInDoubtSubmission({
      actorId,
      orderItemId,
      rating,
      content: normalizedContent,
      sessionEpoch: epoch,
      submittedAt,
      status: 'in_flight',
      requestId,
    });

    mutation.mutate({
      requestId,
      actorId,
      orderItemId,
      rating,
      content: normalizedContent,
      epoch,
      submittedAt,
      abortController: controller,
    });
  };

  const handleReplay = () => {
    if (!actorId || !orderItemId || !inDoubt) return;
    const epoch = getSessionEpoch?.() ?? 0;
    setErrorMessage(null);

    const controller = new AbortController();
    const requestId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${actorId}:${orderItemId}:${epoch}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
    const submittedAt = Date.now();

    registerActiveRequest(actorId, orderItemId, {
      requestId,
      epoch,
      abortController: controller,
    });

    setInDoubtSubmission({
      ...inDoubt,
      actorId,
      orderItemId,
      sessionEpoch: epoch,
      submittedAt,
      status: 'in_flight',
      error: undefined,
      requestId,
    });

    mutation.mutate({
      requestId,
      actorId,
      orderItemId,
      rating: inDoubt.rating,
      content: inDoubt.content,
      epoch,
      submittedAt,
      abortController: controller,
    });
  };

  return (
    <div className={styles.container} data-testid="order-review-form-container">
      <form className={styles.form} onSubmit={handleSubmit}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Điểm đánh giá (1 đến 5 sao)</legend>
          <div className={styles.starGroup} role="radiogroup" aria-label="Điểm đánh giá">
            {[1, 2, 3, 4, 5].map((star) => (
              <label key={star} className={styles.starLabel}>
                <input
                  type="radio"
                  name={`rating-${itemContext.orderItemId}`}
                  value={star}
                  checked={activeRating === star}
                  onChange={() => setRating(star)}
                  disabled={isInputsDisabled}
                />
                <span className={styles.starText}>{star} sao</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className={styles.field}>
          <label htmlFor={`content-${itemContext.orderItemId}`} className={styles.label}>
            Nội dung nhận xét (không bắt buộc)
          </label>
          <textarea
            id={`content-${itemContext.orderItemId}`}
            className={styles.textarea}
            value={activeContent}
            maxLength={2000}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Chia sẻ trải nghiệm sử dụng sản phẩm..."
            disabled={isInputsDisabled}
          />
          <span className={styles.counter}>{activeContent.length}/2000 ký tự</span>
        </div>

        {activeErrorMessage && (
          <p className={styles.error} role="alert">
            {activeErrorMessage}
          </p>
        )}

        <div className={styles.actions}>
          {inDoubt?.status === 'conflict' ? (
            <button
              type="button"
              className={styles.submitButton}
              disabled={loading}
              onClick={onRetryContext ?? onReviewSubmitted}
            >
              {loading ? 'Đang kiểm tra…' : 'Kiểm tra lại'}
            </button>
          ) : isFrozen ? (
            <button
              type="button"
              className={styles.submitButton}
              disabled={isPending}
              onClick={handleReplay}
            >
              {isPending ? 'Đang gửi lại…' : 'Gửi lại'}
            </button>
          ) : (
            <button
              type="submit"
              className={styles.submitButton}
              disabled={activeRating === 0 || isPending}
            >
              {isPending ? 'Đang gửi…' : 'Gửi đánh giá'}
            </button>
          )}
          <button
            type="button"
            className={styles.cancelButton}
            disabled={isInputsDisabled}
            onClick={() => {
              setIsOpen(false);
              setErrorMessage(null);
            }}
          >
            Hủy
          </button>
        </div>
      </form>
    </div>
  );
}
