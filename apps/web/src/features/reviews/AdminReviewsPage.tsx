import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { classifyRequestError, requestErrorCode } from '@/core';
import {
  AdminForbidden,
  formatAdminDateTime,
  shouldRetryAdminQuery,
  useAdminForbidden,
  useAuth,
} from '@/features/account';
import { ConfirmDialog, ErrorNote, Loading, Pager } from '@/ui';

import styles from './AdminReviews.module.css';
import { ReviewBody } from './ReviewCard.js';
import {
  type AdminReview,
  type AdminReviewFilters,
  type AdminReviewPage,
  adminReviewPath,
  REPORT_LABELS,
  reviewKeys,
  STATUS_LABELS,
} from './reviews.api.js';

type ActionKind = 'approve' | 'reject' | 'reply' | 'remove-reply' | 'clear-reports';
interface Action {
  kind: ActionKind;
  review: AdminReview;
}

const STATUS_TONES = { PENDING: 'pending', APPROVED: 'accent', REJECTED: 'danger' } as const;

const STATUS_TABS: { value: AdminReviewFilters['status']; label: string }[] = [
  { value: 'PENDING', label: 'Chờ duyệt' },
  { value: 'APPROVED', label: 'Đang hiển thị' },
  { value: 'REJECTED', label: 'Đã ẩn' },
  { value: 'ALL', label: 'Tất cả' },
];

function readFilters(params: URLSearchParams): AdminReviewFilters {
  const status = params.get('status');
  return {
    page: Math.max(1, Number(params.get('page')) || 1),
    status: STATUS_TABS.some((tab) => tab.value === status)
      ? (status as AdminReviewFilters['status'])
      : 'PENDING',
    reported: params.get('reported') === 'true',
    q: params.get('q') ?? '',
  };
}

function actionError(error: unknown): string {
  const code = requestErrorCode(error);
  if (code === 'REVIEW_ALREADY_REJECTED') return 'Đánh giá này đã bị ẩn trước đó.';
  if (code === 'REVIEW_NOT_FOUND') return 'Đánh giá không còn tồn tại.';
  return 'Không thực hiện được. Tải lại danh sách rồi thử lại.';
}

/**
 * Kiem duyet danh gia (UC-11.2): hang cho duyet cu nhat truoc, an kem ly do, phan hoi cua shop,
 * xoa bao cao sai. Moi thao tac ghi audit_logs o may chu.
 */
export function AdminReviewsPage() {
  const { user, authenticatedRequest, getSessionEpoch } = useAuth();
  const actorId = user?.id ?? '';
  const { forbidden, markForbidden, guardQuery } = useAdminForbidden(actorId, getSessionEpoch);
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const [search, setSearch] = useState(filters.q);
  const [action, setAction] = useState<Action | null>(null);
  const [text, setText] = useState('');
  const [message, setMessage] = useState<{ text: string; warning: boolean } | null>(null);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: reviewKeys.adminList(actorId, filters),
    queryFn: ({ signal }) =>
      guardQuery(() => authenticatedRequest<AdminReviewPage>(adminReviewPath(filters), { signal })),
    enabled: Boolean(actorId) && !forbidden,
    retry: shouldRetryAdminQuery,
    placeholderData: keepPreviousData,
  });
  const mutation = useMutation({
    mutationFn: ({ kind, review }: Action) => {
      const path = `/admin/reviews/${review.id}`;
      if (kind === 'reject') {
        return authenticatedRequest<AdminReview>(`${path}/reject`, {
          method: 'POST',
          body: { note: text.trim(), editCount: review.editCount },
        });
      }
      if (kind === 'reply') {
        return authenticatedRequest<AdminReview>(`${path}/reply`, {
          method: 'PUT',
          body: { content: text.trim() },
        });
      }
      if (kind === 'remove-reply') {
        return authenticatedRequest<AdminReview>(`${path}/reply`, { method: 'DELETE' });
      }
      if (kind === 'approve') {
        return authenticatedRequest<AdminReview>(`${path}/approve`, {
          method: 'POST',
          body: { editCount: review.editCount },
        });
      }
      return authenticatedRequest<AdminReview>(`${path}/clear-reports`, { method: 'POST' });
    },
    onSuccess: async (_review, done) => {
      setAction(null);
      setMessage({
        text: {
          approve: 'Đã duyệt, đánh giá đang hiển thị.',
          reject: 'Đã ẩn đánh giá.',
          reply: 'Đã lưu phản hồi của shop.',
          'remove-reply': 'Đã gỡ phản hồi.',
          'clear-reports': 'Đã xoá báo cáo.',
        }[done.kind],
        warning: false,
      });
      await client.invalidateQueries({ queryKey: reviewKeys.admin(actorId) });
    },
    onError: (error) => {
      if (classifyRequestError(error, 'mutation') === 'forbidden') markForbidden();
      // Ban dang xem da cu: dong hop (nut trong hop van mang phien ban cu), tai lai de doc ban moi.
      if (requestErrorCode(error) === 'REVIEW_CHANGED') {
        setAction(null);
        setMessage({
          text: 'Khách vừa sửa đánh giá này. Danh sách đã tải lại: đọc nội dung mới rồi quyết định.',
          warning: true,
        });
        void client.invalidateQueries({ queryKey: reviewKeys.admin(actorId) });
      }
    },
  });

  if (forbidden) return <AdminForbidden />;

  const update = (next: Partial<AdminReviewFilters>) => {
    const merged = { ...filters, page: 1, ...next };
    const out = new URLSearchParams();
    if (merged.status !== 'PENDING') out.set('status', merged.status);
    if (merged.reported) out.set('reported', 'true');
    if (merged.q.trim()) out.set('q', merged.q.trim());
    if (merged.page > 1) out.set('page', String(merged.page));
    setParams(out);
  };
  const open = (next: Action) => {
    setText(next.kind === 'reply' ? (next.review.reply?.content ?? '') : '');
    mutation.reset();
    setAction(next);
  };
  const needsText = action?.kind === 'reject' || action?.kind === 'reply';
  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    update({ q: search });
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Đánh giá sản phẩm</h1>
        <p>Duyệt đánh giá có ảnh hoặc nội dung cần xem, ẩn đánh giá vi phạm và trả lời khách.</p>
      </header>
      <div className={styles.filters}>
        <div role="tablist" aria-label="Trạng thái" className={styles.tabs}>
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={filters.status === tab.value}
              className={styles.tab}
              onClick={() => update({ status: tab.value })}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={filters.reported}
            onChange={(event) =>
              // Chi danh gia dang hien moi bi bao cao duoc: tab Cho duyet gan nhu luon rong.
              update({
                reported: event.target.checked,
                ...(event.target.checked && filters.status === 'PENDING'
                  ? { status: 'ALL' as const }
                  : {}),
              })
            }
          />
          Chỉ đánh giá bị báo cáo
        </label>
        <form className={styles.search} onSubmit={onSearch} role="search">
          <label>
            <span className="sr-only">Tìm đánh giá</span>
            <input
              value={search}
              maxLength={100}
              placeholder="Nội dung, email khách, tên sản phẩm"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button type="submit">Tìm</button>
        </form>
      </div>
      {message && (
        <p
          className={message.warning ? styles.warning : styles.notice}
          role={message.warning ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
      {query.isPending && <Loading label="Đang tải đánh giá…" />}
      {query.isError && (
        <ErrorNote label="Không tải được đánh giá." onRetry={() => void query.refetch()} />
      )}
      {query.data && (
        <>
          <p className={styles.note}>{query.data.total.toLocaleString('vi-VN')} đánh giá</p>
          {query.data.items.length === 0 ? (
            <p role="status">Không có đánh giá nào khớp bộ lọc.</p>
          ) : (
            <ul className={styles.list} aria-busy={query.isFetching}>
              {query.data.items.map((review) => (
                <AdminReviewRow key={review.id} review={review} onAction={open} />
              ))}
            </ul>
          )}
          <Pager
            page={filters.page}
            totalPages={query.data.totalPages}
            total={query.data.total}
            unit="đánh giá"
            onChange={(page) => update({ page })}
          />
        </>
      )}
      <ConfirmDialog
        open={action !== null}
        title={
          action
            ? {
                approve: 'Duyệt đánh giá',
                reject: 'Ẩn đánh giá',
                reply: 'Phản hồi của shop',
                'remove-reply': 'Gỡ phản hồi',
                'clear-reports': 'Xoá báo cáo',
              }[action.kind]
            : ''
        }
        subject={action ? `${action.review.product.name} · ${action.review.reviewer.email}` : ''}
        impacts={
          action?.kind === 'reject'
            ? [
                'Đánh giá biến khỏi trang sản phẩm, điểm sao được tính lại.',
                'Khách thấy lý do bạn ghi.',
              ]
            : action?.kind === 'approve'
              ? ['Đánh giá hiện công khai và được tính vào điểm sao.']
              : action?.kind === 'reply'
                ? ['Phản hồi hiện công khai dưới đánh giá.']
                : ['Thao tác được ghi vào nhật ký quản trị.']
        }
        confirmLabel={action?.kind === 'reject' ? 'Ẩn đánh giá' : 'Xác nhận'}
        pendingLabel="Đang lưu…"
        tone={action?.kind === 'reject' || action?.kind === 'remove-reply' ? 'danger' : 'primary'}
        pending={mutation.isPending}
        onClose={() => setAction(null)}
        onConfirm={() => {
          if (action && (!needsText || text.trim())) mutation.mutate(action);
        }}
      >
        {needsText && (
          <label className={styles.field}>
            <span>
              {action?.kind === 'reject' ? 'Lý do ẩn (khách sẽ thấy)' : 'Nội dung phản hồi'}
            </span>
            <textarea
              value={text}
              maxLength={action?.kind === 'reject' ? 500 : 1000}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
        )}
        {needsText && !text.trim() && (
          <p className={styles.hint}>Cần nhập nội dung trước khi xác nhận.</p>
        )}
        {mutation.isError && (
          <p className={styles.error} role="alert">
            {actionError(mutation.error)}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}

function AdminReviewRow({
  review,
  onAction,
}: {
  review: AdminReview;
  onAction(action: Action): void;
}) {
  const status = review.status;
  return (
    <li className={styles.row}>
      <div className={styles.rowHead}>
        <Link to={`/san-pham/${review.product.slug}`} className={styles.product}>
          {review.product.name}
        </Link>
        <span className={styles.status} data-tone={STATUS_TONES[status]}>
          {STATUS_LABELS[status]}
        </span>
        {review.reportCount > 0 && (
          <span className={styles.reported}>{review.reportCount} báo cáo</span>
        )}
      </div>
      <p className={styles.meta}>
        {review.reviewer.displayName} · {review.reviewer.email}
        {review.isAnonymous && ' · ẩn tên'}
        {review.orderCode && ` · Đơn ${review.orderCode}`} · {formatAdminDateTime(review.createdAt)}
        {review.editedAt && ' · đã sửa'}
      </p>
      <ReviewBody {...review} />
      {review.reports.length > 0 && (
        <ul className={styles.reports} aria-label="Báo cáo gần nhất">
          {review.reports.map((report) => (
            <li key={`${report.createdAt}-${report.reason}`}>
              {REPORT_LABELS[report.reason]}
              {report.note && `: ${report.note}`}
            </li>
          ))}
        </ul>
      )}
      {review.moderationNote && status === 'REJECTED' && (
        <p className={styles.note}>Lý do ẩn: {review.moderationNote}</p>
      )}
      {review.reply && (
        <p className={styles.reply}>
          <strong>Shop:</strong> {review.reply.content}
        </p>
      )}
      <div className={styles.actions}>
        {status !== 'APPROVED' && (
          <button type="button" onClick={() => onAction({ kind: 'approve', review })}>
            Duyệt
          </button>
        )}
        {status !== 'REJECTED' && (
          <button type="button" onClick={() => onAction({ kind: 'reject', review })}>
            Ẩn
          </button>
        )}
        <button type="button" onClick={() => onAction({ kind: 'reply', review })}>
          {review.reply ? 'Sửa phản hồi' : 'Phản hồi'}
        </button>
        {review.reply && (
          <button type="button" onClick={() => onAction({ kind: 'remove-reply', review })}>
            Gỡ phản hồi
          </button>
        )}
        {review.reportCount > 0 && (
          <button type="button" onClick={() => onAction({ kind: 'clear-reports', review })}>
            Bỏ báo cáo
          </button>
        )}
      </div>
    </li>
  );
}
