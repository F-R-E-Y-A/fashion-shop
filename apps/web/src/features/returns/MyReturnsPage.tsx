import { Link, useSearchParams } from 'react-router-dom';

import { formatPrice } from '@/core';
import { Empty, ErrorNote, Loading, Pager } from '@/ui';

import { formatReturnDate, REASON_LABELS, STATUS_LABELS } from './returns.api.js';
import styles from './Returns.module.css';
import { useMyReturns } from './use-returns.js';

/** Tab "Tra hang" trong tai khoan (UC-14.1 buoc 6): moi yeu cau mot dong, bam vao xem tung buoc. */
export function MyReturnsPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('trang')) || 1);
  const returns = useMyReturns(page);
  const data = returns.data;

  return (
    <section className={styles.page} aria-labelledby="my-returns-title">
      <h2 id="my-returns-title" className="sr-only">
        Yêu cầu trả hàng của tôi
      </h2>
      {returns.isPending && <Loading label="Đang tải yêu cầu trả hàng…" />}
      {returns.isError && (
        <ErrorNote
          label="Không tải được yêu cầu trả hàng."
          onRetry={() => void returns.refetch()}
        />
      )}
      {data && data.items.length === 0 && (
        <div>
          <Empty label="Bạn chưa có yêu cầu trả hàng nào." />
          <p className={styles.muted}>
            Đơn đã giao trong 15 ngày có nút &quot;Yêu cầu trả hàng&quot; ở{' '}
            <Link to="/tai-khoan/don-hang">trang đơn hàng</Link>.
          </p>
        </div>
      )}
      {data && data.items.length > 0 && (
        <ul className={styles.list} aria-busy={returns.isFetching}>
          {data.items.map((item) => (
            <li key={item.id} className={styles.card}>
              <div className={styles.cardHead}>
                <Link className={styles.cardLink} to={`/tai-khoan/tra-hang/${item.id}`}>
                  Đơn {item.orderCode}
                </Link>
                <span className={styles.status} data-status={item.status}>
                  {STATUS_LABELS[item.status]}
                </span>
              </div>
              <p className={styles.muted}>
                Gửi ngày {formatReturnDate(item.createdAt)} · {item.items.length} sản phẩm ·{' '}
                {REASON_LABELS[item.reasonCode]}
              </p>
              <p className={styles.amount}>Hoàn dự kiến: {formatPrice(item.refundAmount)}</p>
            </li>
          ))}
        </ul>
      )}
      {data && data.totalPages > 1 && (
        <Pager
          page={page}
          totalPages={data.totalPages}
          total={data.total}
          unit="yêu cầu"
          onChange={(next) => setParams(next > 1 ? { trang: String(next) } : {})}
        />
      )}
    </section>
  );
}
