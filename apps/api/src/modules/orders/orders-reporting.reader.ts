import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma/client.js';

export interface OrdersByStatusFact {
  reportDate: Date;
  orderStatus: string;
  orderCount: number;
}

export interface TopSellingProductFact {
  reportDate: Date;
  productId: string;
  productName: string | null;
  quantitySold: number;
  revenueAmount: string;
}

@Injectable()
export class OrdersReportingReader {
  /**
   * Truy van cohort don hang gom theo ngay tao (createdAt theo mui gio Asia/Ho_Chi_Minh)
   * va phan nhom theo trang thai HIEN TAI cua don hang.
   * Bao gom tat ca don hang hop le (ke ca khach vang lai userId = null).
   */
  async getOrdersByStatusFacts(tx: Prisma.TransactionClient): Promise<OrdersByStatusFact[]> {
    const rows = await tx.$queryRaw<
      {
        reportDate: Date;
        orderStatus: string;
        orderCount: number;
      }[]
    >`
      SELECT
        (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS "reportDate",
        status::text AS "orderStatus",
        COUNT(*)::int AS "orderCount"
      FROM public.orders
      GROUP BY (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, status
      ORDER BY "reportDate" ASC, status ASC
    `;

    return rows;
  }

  /**
   * Truy van top san pham giao nhieu nhat tinh tren cac don hang co su kien DELIVERED
   * dau tien trong lich su trang thai (OrderStatusHistory).
   * Khong dem lap khi su kien DELIVERED xuat hien nhieu lan trong lich su mot don.
   * So luong la so luong da giao thuc te (chua tru hang tra/hoan).
   */
  async getTopSellingProductFacts(tx: Prisma.TransactionClient): Promise<TopSellingProductFact[]> {
    const rows = await tx.$queryRaw<
      {
        reportDate: Date;
        productId: string;
        productName: string | null;
        quantitySold: number;
        revenueAmount: string;
      }[]
    >`
      WITH first_delivered AS (
        SELECT
          order_id,
          MIN(created_at) AS delivered_at
        FROM public.order_status_history
        WHERE status = 'DELIVERED'
        GROUP BY order_id
      )
      SELECT
        (fd.delivered_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS "reportDate",
        pv.product_id AS "productId",
        COALESCE(
          p.name,
          oi.product_snapshot->>'name',
          'Sản phẩm'
        ) AS "productName",
        SUM(oi.quantity)::int AS "quantitySold",
        SUM(oi.quantity * oi.unit_price)::numeric(12,2)::text AS "revenueAmount"
      FROM first_delivered fd
      JOIN public.order_items oi ON oi.order_id = fd.order_id
      JOIN public.product_variants pv ON pv.id = oi.product_variant_id
      LEFT JOIN public.products p ON p.id = pv.product_id
      GROUP BY
        (fd.delivered_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
        pv.product_id,
        COALESCE(p.name, oi.product_snapshot->>'name', 'Sản phẩm')
      ORDER BY "reportDate" ASC, "quantitySold" DESC, pv.product_id ASC
    `;

    return rows;
  }
}
