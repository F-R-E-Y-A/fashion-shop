import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CheckoutAddressResponse {
  @ApiProperty() id!: string;
  @ApiProperty() recipientName!: string;
  @ApiProperty() phone!: string;
  @ApiProperty() administrativeAreaId!: string;
  @ApiProperty() commune!: string;
  @ApiProperty() province!: string;
  @ApiProperty() detailAddress!: string;
  @ApiProperty({ type: String, nullable: true }) postalCode!: string | null;
}
export class CheckoutItemResponse {
  @ApiProperty() variantId!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() productSlug!: string;
  @ApiProperty() name!: string;
  @ApiProperty() variantLabel!: string;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty() price!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() subtotal!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: Number, nullable: true }) availableQuantity!: number | null;
  @ApiProperty() availability!: string;
  @ApiProperty() isSelected!: boolean;
  @ApiProperty() canCheckout!: boolean;
}
export class GatewayResponse {
  @ApiProperty({ enum: ['VNPAY', 'MOMO', 'MOMO_ATM', 'COD'] }) code!: string;
  @ApiProperty() label!: string;
  @ApiProperty() configured!: boolean;
  @ApiProperty({ required: false, description: 'Ly do COD bi tat cho don/khach nay (ADR-038)' })
  unavailableReason?: string;
}
export class PendingOrderResponse {
  @ApiProperty() id!: string;
  @ApiProperty() orderCode!: string;
}
export class QuoteResponse {
  @ApiProperty() fingerprint!: string;
  @ApiProperty({ type: CheckoutAddressResponse }) address!: CheckoutAddressResponse;
  @ApiProperty({ type: [CheckoutItemResponse] }) items!: CheckoutItemResponse[];
  @ApiProperty() subtotalAmount!: string;
  @ApiProperty() discountAmount!: string;
  @ApiProperty() shippingFeeAmount!: string;
  @ApiProperty() shippingRateId!: string;
  @ApiProperty() totalAmount!: string;
  @ApiProperty() paymentConfigured!: boolean;
  @ApiProperty({ type: [GatewayResponse] }) gateways!: GatewayResponse[];
  @ApiProperty() holdMinutes!: number;
  @ApiProperty({ description: 'Phut link cong con hieu luc; ngan hon hold de cho IPN/query.' })
  payMinutes!: number;
  @ApiProperty({ type: PendingOrderResponse, nullable: true })
  pendingOrder!: PendingOrderResponse | null;
}
export class ProductSnapshotResponse {
  @ApiProperty() name!: string;
  @ApiProperty() variantLabel!: string;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty() productSlug!: string;
}
export class OrderItemResponse {
  @ApiProperty() variantId!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() price!: string;
  @ApiProperty({ type: ProductSnapshotResponse }) snapshot!: ProductSnapshotResponse;
}
export class ShipmentResponse {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) carrierName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) trackingNumber!: string | null;
  @ApiProperty({ enum: ['PENDING', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'RETURNED'] })
  status!: string;
  @ApiPropertyOptional({ type: Boolean, description: 'Đánh dấu vận đơn mô phỏng (Sandbox)' })
  isMock?: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class PaymentResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, nullable: true }) gateway!: string | null;
  @ApiProperty({ type: String, nullable: true }) reference!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, nullable: true }) expiresAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) checkoutUrl!: string | null;
}
export class OrderResponse {
  @ApiProperty({ type: String, nullable: true }) checkoutFingerprint!: string | null;
  @ApiProperty() id!: string;
  @ApiProperty() orderCode!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, nullable: true }) paymentDueAt!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: CheckoutAddressResponse }) address!: CheckoutAddressResponse;
  @ApiProperty() subtotalAmount!: string;
  @ApiProperty() discountAmount!: string;
  @ApiProperty() shippingFeeAmount!: string;
  @ApiProperty() totalAmount!: string;
  @ApiProperty({ type: [OrderItemResponse] }) items!: OrderItemResponse[];
  @ApiProperty({ type: [PaymentResponse] }) payments!: PaymentResponse[];
  @ApiProperty({ description: 'Tong da hoan (REFUND:* da xac nhan)' }) refundedAmount!: string;
  @ApiProperty({ description: 'Co lenh hoan dang cho cong/doi soat' }) refundPending!: boolean;
  @ApiProperty({ description: 'Khach huy duoc don luc nay' }) canCancel!: boolean;
  @ApiProperty({ description: 'Huy luc nay se hoan tien tu dong (ADR-038)' })
  cancelRefunds!: boolean;
  @ApiPropertyOptional({ type: ShipmentResponse, nullable: true })
  shipment?: ShipmentResponse | null;
}
export class IpnResponse {
  @ApiProperty() RspCode!: string;
  @ApiProperty() Message!: string;
}
