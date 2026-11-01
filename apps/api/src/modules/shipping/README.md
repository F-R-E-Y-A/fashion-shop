# Shipping — hợp đồng public

Import ShippingModule/ShippingService qua `index.ts`. `quote(areaId, subtotalAfterDiscount, tx?)` trả rateId và fee dạng string Decimal; chỉ nhận area đã được Users kiểm tra quyền và khả năng giao.

Rate hoạt động, không giới hạn cân nặng, thuộc zone có area tương ứng. Không có rate thì 422. Từ 500.000đ tiền hàng sau giảm giá thì phí bằng 0; còn lại dùng fee cấu hình. [Chính sách](../../../../../docs/features/shipping/README.md), [ADR-027](../../../../../docs/LOG.md#adr-027).
