import { useState } from 'react';

import type { AdminReportDailyMoney, AdminReportOrdersByStatus } from './admin-reporting.api.js';
import styles from './AdminReportCharts.module.css';

function formatCompactVnd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000)
    return `${sign}${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/u, '')} tỷ`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace(/\.0$/u, '')} tr`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${value} đ`;
}

function formatFullVnd(value: number): string {
  return `${Math.round(value).toLocaleString('vi-VN')} đ`;
}

function shortDayLabel(isoDate: string): string {
  const parts = isoDate.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : isoDate;
}

/** Biểu đồ cột SVG so sánh tiền thu và hoàn tiền theo từng ngày, giữ chiều cao ổn định khi hover/focus. */
export function DailyRevenueChart({ items }: { items: readonly AdminReportDailyMoney[] }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  if (items.length === 0) return null;

  const points = items.map((row) => ({
    date: row.date,
    collected: Math.max(0, Number(row.collectedAmount) || 0),
    refunded: Math.max(0, Number(row.refundedAmount) || 0),
    net: Number(row.netAmount) || 0,
  }));

  const rawMax = Math.max(...points.flatMap((p) => [p.collected, p.refunded]), 0);
  const maxVal = rawMax > 0 ? rawMax : 1;

  const peakIndex = points.reduce(
    (best, cur, idx) => (cur.collected > points[best]!.collected ? idx : best),
    0,
  );
  const activePoint =
    selectedIndex !== null && points[selectedIndex] ? points[selectedIndex]! : points[peakIndex]!;
  const isViewingPeak = selectedIndex === null;

  const W = 720;
  const H = 216;
  const padL = 56;
  const padR = 16;
  const padT = 16;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const step = plotW / points.length;
  const barWidth = Math.max(4, Math.min(20, step * 0.34));
  const labelStride = Math.max(1, Math.ceil(points.length / 10));

  const ticks = [0, 0.5, 1];

  return (
    <div className={styles.chartCard} data-testid="daily-revenue-chart">
      <div className={styles.chartHeader}>
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ background: 'var(--accent)' }} />
            Tiền đã thu
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ background: 'var(--danger)' }} />
            Tiền đã hoàn
          </span>
        </div>

        <div className={styles.inspectorSlot} aria-live="polite">
          <strong>
            {isViewingPeak
              ? `Ngày cao điểm (${shortDayLabel(activePoint.date)})`
              : activePoint.date}
            :
          </strong>
          <span className={styles.collectedText}>Thu {formatFullVnd(activePoint.collected)}</span>
          <span className={styles.refundedText}>Hoàn {formatFullVnd(activePoint.refunded)}</span>
          <span className={activePoint.net < 0 ? styles.negativeText : undefined}>
            Thu ròng {formatFullVnd(activePoint.net)}
          </span>
        </div>
      </div>

      <figure className={styles.svgWrap} aria-label="Biểu đồ doanh thu và hoàn tiền theo ngày">
        <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`}>
          {ticks.map((ratio) => {
            const y = padT + plotH * (1 - ratio);
            const val = rawMax * ratio;
            return (
              <g key={ratio}>
                <line x1={padL} x2={W - padR} y1={y} y2={y} className={styles.gridLine} />
                <text x={padL - 8} y={y + 4} textAnchor="end" className={styles.axisText}>
                  {formatCompactVnd(val)}
                </text>
              </g>
            );
          })}

          {points.map((pt, idx) => {
            const centerX = padL + step * (idx + 0.5);
            const collectedH = Math.max(pt.collected > 0 ? 3 : 0, (pt.collected / maxVal) * plotH);
            const refundedH = Math.max(pt.refunded > 0 ? 3 : 0, (pt.refunded / maxVal) * plotH);
            const barX1 = centerX - barWidth - 1;
            const barX2 = centerX + 1;
            const showLabel = idx % labelStride === 0 || idx === points.length - 1;
            const isSelected = selectedIndex === idx;

            return (
              <g
                key={pt.date}
                className={styles.barGroup}
                tabIndex={0}
                role="button"
                aria-label={`${pt.date}: thu ${formatFullVnd(pt.collected)}, hoàn ${formatFullVnd(pt.refunded)}`}
                onMouseEnter={() => setSelectedIndex(idx)}
                onMouseLeave={() => setSelectedIndex(null)}
                onFocus={() => setSelectedIndex(idx)}
                onBlur={() => setSelectedIndex(null)}
                onClick={() => setSelectedIndex((prev) => (prev === idx ? null : idx))}
              >
                <rect
                  x={padL + step * idx}
                  y={padT}
                  width={step}
                  height={plotH}
                  fill={
                    isSelected ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent'
                  }
                />
                <rect
                  x={barX1}
                  y={padT + plotH - collectedH}
                  width={barWidth}
                  height={collectedH}
                  rx={1.5}
                  fill="var(--accent)"
                />
                <rect
                  x={barX2}
                  y={padT + plotH - refundedH}
                  width={barWidth}
                  height={refundedH}
                  rx={1.5}
                  fill="var(--danger)"
                />
                {showLabel && (
                  <text x={centerX} y={H - 10} textAnchor="middle" className={styles.axisText}>
                    {shortDayLabel(pt.date)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </figure>
    </div>
  );
}

const STATUS_BAR_COLORS: Record<string, string> = {
  DELIVERED: 'var(--success)',
  CONFIRMED: 'var(--accent)',
  PROCESSING: 'var(--accent-bright)',
  SHIPPING: 'color-mix(in srgb, var(--accent) 65%, var(--paper))',
  PENDING_PAYMENT: 'var(--amber-glow)',
  PENDING_CONFIRMATION: 'color-mix(in srgb, var(--amber-glow) 75%, var(--paper))',
  CANCELLED: 'var(--danger)',
  RETURNED: 'var(--muted)',
};

export function OrdersStatusChart({
  items,
  statusLabels,
}: {
  items: readonly AdminReportOrdersByStatus[];
  statusLabels: Record<string, { label: string }>;
}) {
  const nonZero = items.filter(
    (row) => (Number(row.percentage) || 0) > 0 || (row.count ?? row.orderCount ?? 0) > 0,
  );
  const legendItems = nonZero.length > 0 ? nonZero : items;
  if (items.length === 0) return null;

  return (
    <div className={styles.chartCard} data-testid="orders-status-chart">
      <div
        className={styles.stackedBar}
        role="img"
        aria-label="Biểu đồ phân bổ tỷ lệ đơn hàng theo trạng thái"
      >
        {nonZero.map((row) => {
          const pct = Math.max(0, Number(row.percentage) || 0);
          if (pct <= 0) return null;
          const color = STATUS_BAR_COLORS[row.status] ?? 'var(--muted)';
          const name = row.label || statusLabels[row.status]?.label || row.status;
          return (
            <div
              key={row.status}
              className={styles.stackedSegment}
              style={{ width: `${pct}%`, background: color }}
              title={`${name}: ${pct}%`}
            />
          );
        })}
      </div>

      <div className={styles.legend}>
        {legendItems.map((row) => {
          const color = STATUS_BAR_COLORS[row.status] ?? 'var(--muted)';
          const name = row.label || statusLabels[row.status]?.label || row.status;
          return (
            <span key={row.status} className={styles.legendItem}>
              <span className={styles.legendSwatch} style={{ background: color }} />
              {name}: {row.percentage}%
            </span>
          );
        })}
      </div>
    </div>
  );
}
