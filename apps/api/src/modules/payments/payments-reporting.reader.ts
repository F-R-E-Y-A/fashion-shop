import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma/client.js';

export interface DailyMoneyFact {
  reportDate: Date;
  orderCount: number;
  collectedAmount: string;
  refundedAmount: string;
}

@Injectable()
export class PaymentsReportingReader {
  /**
   * Truy van tong hop doanh thu da thu va da hoan theo ngay (mui gio Asia/Ho_Chi_Minh).
   *
   * Quy tac bang chung nghiem ngat:
   * 1. Kiem tra tinh hop le cua Payment SUCCEEDED: phai co it nhat mot PaymentTransaction PROCESSED
   *    voi receipt hop le theo gateway va amount > 0.
   * 2. Kiem tra refund PROCESSED: phai co payload chua so tien hoan duong (> 0).
   * 3. Neu bat ky ban ghi nao thieu bang chung, ham se NEM LOI de rollback transaction
   *    va bao toan snapshot hop le truoc do (khong am tham cong bo 0 NORMAL).
   */
  async getDailyMoneyFacts(tx: Prisma.TransactionClient): Promise<DailyMoneyFact[]> {
    // 1. Kiem tra payments SUCCEEDED khong co receipt hop le
    const unprovablePayments = await tx.$queryRaw<{ id: string }[]>`
      SELECT p.id
      FROM public.payments p
      WHERE p.status = 'SUCCEEDED'
        AND (
          p.amount IS NULL
          OR p.amount <= 0
          OR NOT EXISTS (
            SELECT 1
            FROM public.payment_transactions pt
            WHERE pt.payment_id = p.id
              AND pt.status = 'PROCESSED'
              AND (
                (pt.gateway = 'COD' AND pt.external_transaction_id LIKE 'COD:%' AND pt.external_transaction_id NOT LIKE 'COD-FAILED:%')
                OR
                (pt.gateway IN ('VNPAY', 'MOMO', 'MOMO_ATM') AND pt.external_transaction_id ~ '^[1-9][0-9]{0,19}$')
              )
          )
        )
      LIMIT 5
    `;

    if (unprovablePayments.length > 0) {
      throw new Error(
        `Du lieu nguon khong the chung minh: Phat hien payment SUCCEEDED thieu transaction receipt hop le: ${unprovablePayments.map((p) => p.id).join(', ')}`,
      );
    }

    // 2. Kiem tra refunds PROCESSED thieu so tien hoac payload loi
    const unprovableRefunds = await tx.$queryRaw<{ id: string }[]>`
      SELECT pt.id
      FROM public.payment_transactions pt
      WHERE pt.status = 'PROCESSED'
        AND pt.external_transaction_id LIKE 'REFUND:%'
        AND (
          pt.payload IS NULL
          OR (
            (pt.payload->>'refundedAmount') IS NULL
            AND (pt.payload->>'vnp_Amount') IS NULL
            AND (pt.payload->>'amount') IS NULL
          )
          OR (
            (pt.payload->>'refundedAmount') IS NOT NULL
            AND (pt.payload->>'refundedAmount') !~ '^[0-9]+(\\.[0-9]+)?$'
          )
          OR (
            (pt.payload->>'vnp_Amount') IS NOT NULL
            AND (pt.payload->>'vnp_Amount') !~ '^[0-9]+$'
          )
          OR (
            (pt.payload->>'amount') IS NOT NULL
            AND (pt.payload->>'amount') !~ '^[0-9]+(\\.[0-9]+)?$'
          )
          OR (
            COALESCE(
              CASE WHEN (pt.payload->>'refundedAmount') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (pt.payload->>'refundedAmount')::numeric ELSE NULL END,
              CASE WHEN (pt.payload->>'vnp_Amount') ~ '^[0-9]+$' THEN (pt.payload->>'vnp_Amount')::numeric / 100 ELSE NULL END,
              CASE WHEN (pt.payload->>'amount') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (pt.payload->>'amount')::numeric ELSE NULL END
            ) IS NULL
            OR COALESCE(
              CASE WHEN (pt.payload->>'refundedAmount') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (pt.payload->>'refundedAmount')::numeric ELSE NULL END,
              CASE WHEN (pt.payload->>'vnp_Amount') ~ '^[0-9]+$' THEN (pt.payload->>'vnp_Amount')::numeric / 100 ELSE NULL END,
              CASE WHEN (pt.payload->>'amount') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (pt.payload->>'amount')::numeric ELSE NULL END
            ) <= 0
          )
        )
      LIMIT 5
    `;

    if (unprovableRefunds.length > 0) {
      throw new Error(
        `Du lieu nguon khong the chung minh: Phat hien refund PROCESSED thieu so tien hop le: ${unprovableRefunds.map((r) => r.id).join(', ')}`,
      );
    }

    // 3. Tong hop theo ngay
    const rows = await tx.$queryRaw<
      {
        reportDate: Date;
        orderCount: number;
        collectedAmount: string;
        refundedAmount: string;
      }[]
    >`
      WITH payment_first_confirmed AS (
        SELECT
          p.id AS payment_id,
          p.amount,
          p.order_id,
          MIN(pt.created_at) AS confirmed_at
        FROM public.payments p
        JOIN public.payment_transactions pt ON pt.payment_id = p.id
        WHERE p.status = 'SUCCEEDED'
          AND pt.status = 'PROCESSED'
          AND (
            (pt.gateway = 'COD' AND pt.external_transaction_id LIKE 'COD:%' AND pt.external_transaction_id NOT LIKE 'COD-FAILED:%')
            OR
            (pt.gateway IN ('VNPAY', 'MOMO', 'MOMO_ATM') AND pt.external_transaction_id ~ '^[1-9][0-9]{0,19}$')
          )
        GROUP BY p.id, p.amount, p.order_id
      ),
      daily_collected AS (
        SELECT
          (confirmed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS report_date,
          COUNT(DISTINCT order_id)::int AS order_count,
          SUM(amount)::numeric(12,2) AS collected_amount
        FROM payment_first_confirmed
        GROUP BY (confirmed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
      ),
      daily_refunded AS (
        SELECT
          (pt.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS report_date,
          SUM(
            COALESCE(
              CASE WHEN (pt.payload->>'refundedAmount') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (pt.payload->>'refundedAmount')::numeric ELSE NULL END,
              CASE WHEN (pt.payload->>'vnp_Amount') ~ '^[0-9]+$' THEN (pt.payload->>'vnp_Amount')::numeric / 100 ELSE NULL END,
              CASE WHEN (pt.payload->>'amount') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (pt.payload->>'amount')::numeric ELSE NULL END
            )
          )::numeric(12,2) AS refunded_amount
        FROM public.payment_transactions pt
        WHERE pt.status = 'PROCESSED'
          AND pt.external_transaction_id LIKE 'REFUND:%'
        GROUP BY (pt.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
      )
      SELECT
        COALESCE(c.report_date, r.report_date) AS "reportDate",
        COALESCE(c.order_count, 0) AS "orderCount",
        COALESCE(c.collected_amount, 0)::text AS "collectedAmount",
        COALESCE(r.refunded_amount, 0)::text AS "refundedAmount"
      FROM daily_collected c
      FULL OUTER JOIN daily_refunded r ON c.report_date = r.report_date
      ORDER BY "reportDate" ASC
    `;

    return rows;
  }
}
