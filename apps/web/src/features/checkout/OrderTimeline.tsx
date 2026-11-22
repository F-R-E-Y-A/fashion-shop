import { formatDateTime } from '@/core';

import styles from './Checkout.module.css';
import type { OrderView } from './types.js';

/** Nhan moc: doc duoc ca khi da qua (co gio) lan khi con cho (mo xam). */
const stepLabels: Record<string, string> = {
  PENDING_PAYMENT: 'Đặt hàng · chờ thanh toán',
  PENDING_CONFIRMATION: 'Đặt hàng · thanh toán khi nhận',
  CONFIRMED: 'Thanh toán thành công',
  PAYMENT_REVIEW: 'Đã nhận tiền · shop đang đối soát',
  PROCESSING: 'Shop chuẩn bị hàng',
  SHIPPED: 'Giao cho đơn vị vận chuyển',
  DELIVERED: 'Giao hàng thành công',
  CANCELLED: 'Đơn đã hủy',
  PARTIALLY_REFUNDED: 'Hoàn tiền một phần',
  REFUNDED: 'Hoàn tiền xong',
};
const ONLINE_PATH = ['PENDING_PAYMENT', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
const COD_PATH = ['PENDING_CONFIRMATION', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
const SETTLED = ['DELIVERED', 'PARTIALLY_REFUNDED', 'REFUNDED'];

type StepState = 'done' | 'active' | 'pending' | 'failed';
interface Step {
  status: string;
  at: string | null;
  state: StepState;
}

/**
 * Moc trang thai cua don (UC-07.3/AC7, ADR-122). Lich su chi cho gio; moc hien tai luon theo
 * `order.status` de khong lech the trang thai. Don con tren luong chinh thi hien cac moc con lai mo
 * xam; huy, hoan tien, doi soat la nhanh rieng nen khong du bao tiep.
 */
export function orderTimeline(order: OrderView): Step[] {
  const events: { status: string; at: string | null }[] = [];
  for (const row of order.history ?? []) {
    if (events.at(-1)?.status !== row.status) events.push({ status: row.status, at: row.at });
  }
  if (events.at(-1)?.status !== order.status) events.push({ status: order.status, at: null });

  const steps: Step[] = events.map((event, index) => ({
    ...event,
    state:
      event.status === 'CANCELLED'
        ? 'failed'
        : index < events.length - 1 || SETTLED.includes(event.status)
          ? 'done'
          : 'active',
  }));

  const cod = order.payments.some((payment) => payment.gateway === 'COD');
  const path = cod ? COD_PATH : ONLINE_PATH;
  const current = path.indexOf(order.status);
  for (const status of current >= 0 ? path.slice(current + 1) : []) {
    steps.push({ status, at: null, state: 'pending' });
  }
  return steps;
}

const dots: Record<StepState, string> = { done: '✓', active: '●', pending: '○', failed: '✕' };

export function OrderTimeline({ order }: { order: OrderView }) {
  return (
    <section className={styles.section} aria-labelledby="order-progress-title">
      <h2 id="order-progress-title" className={styles.sectionTitle}>
        Tiến trình đơn hàng
      </h2>
      <ol className={styles.timeline} aria-labelledby="order-progress-title">
        {orderTimeline(order).map((step, index) => (
          <li
            key={`${step.status}-${index}`}
            className={styles.timelineStep}
            data-status={step.state}
            aria-current={step.state === 'active' ? 'step' : undefined}
          >
            <span className={styles.timelineDot} aria-hidden="true">
              {dots[step.state]}
            </span>
            <span className={styles.timelineBody}>
              <span className={styles.timelineLabel}>{stepLabels[step.status] ?? step.status}</span>
              {step.at && (
                <time className={styles.timelineTime} dateTime={step.at}>
                  {formatDateTime(step.at)}
                </time>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
