import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { CARRIER_MODES, type CarrierMode } from '../shipping-carrier.js';

export const ShipmentStatus = {
  PENDING: 'PENDING',
  IN_TRANSIT: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  RETURNED: 'RETURNED',
} as const;

export type ShipmentStatus = (typeof ShipmentStatus)[keyof typeof ShipmentStatus];

export const SHIPMENT_STATUSES = Object.values(ShipmentStatus);

/**
 * Ma trận bước chuyển hợp lệ của vận đơn.
 * - Chặn lùi trạng thái (ví dụ đã DELIVERED thì không thể lùi về IN_TRANSIT hay PENDING do sự kiện đến muộn).
 * - DELIVERED và RETURNED là trạng thái kết thúc (terminal states).
 */
export const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  PENDING: ['IN_TRANSIT', 'FAILED', 'RETURNED'],
  IN_TRANSIT: ['DELIVERED', 'FAILED', 'RETURNED'],
  DELIVERED: [],
  // GHN cho phép kích hoạt giao lại (delivery-again) từ delivery_fail / waiting_to_return (FAILED)
  // sang delivering (IN_TRANSIT) hoặc delivered (DELIVERED); đơn đã CANCELLED vẫn bị chặn ở ShippingService.
  FAILED: ['IN_TRANSIT', 'DELIVERED', 'RETURNED'],
  RETURNED: [],
};

export function canTransitionShipment(current: ShipmentStatus, target: ShipmentStatus): boolean {
  if (current === target) return true;
  return SHIPMENT_TRANSITIONS[current]?.includes(target) ?? false;
}

export class CreateShipmentDto {
  @ApiPropertyOptional({ example: 'GHN', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  carrierName?: string;

  @ApiPropertyOptional({ example: 'GHN-SBX-12345678', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  trackingNumber?: string;

  @ApiPropertyOptional({
    enum: CARRIER_MODES,
    default: 'AUTO',
    description:
      'AUTO: dùng GHN Sandbox nếu đã cấu hình, tự động dự phòng mô phỏng khi thiếu cấu hình hoặc GHN lỗi; GHN: bắt buộc gọi GHN Sandbox; MOCK: dùng mô phỏng nội bộ.',
  })
  @IsOptional()
  @IsIn(CARRIER_MODES, { message: 'Chế độ tạo vận đơn chỉ nhận AUTO, GHN hoặc MOCK' })
  mode?: CarrierMode;
}

export class UpdateShipmentStatusDto {
  @ApiProperty({ enum: SHIPMENT_STATUSES, example: 'IN_TRANSIT' })
  @IsIn(SHIPMENT_STATUSES, { message: 'Trạng thái vận đơn không hợp lệ' })
  status!: ShipmentStatus;

  @ApiPropertyOptional({ example: 'Shipper đã lấy hàng thành công', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ShipmentWebhookDto {
  @ApiPropertyOptional({ description: 'ID đơn hàng (UUID)' })
  @IsOptional()
  @IsUUID('all', { message: 'orderId phải là UUID' })
  orderId?: string;

  @ApiPropertyOptional({ example: 'GHN-SBX-12345678' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  trackingNumber?: string;

  @ApiProperty({ enum: SHIPMENT_STATUSES, example: 'IN_TRANSIT' })
  @IsIn(SHIPMENT_STATUSES, { message: 'Trạng thái vận đơn không hợp lệ' })
  status!: ShipmentStatus;

  @ApiPropertyOptional({ example: 'GHN' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  carrierName?: string;

  @ApiPropertyOptional({ example: 'Đang giao đến người nhận' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CarrierConfigResponse {
  @ApiProperty() ghnConfigured!: boolean;
  @ApiProperty({ enum: ['GHN_SANDBOX', 'MOCK_ONLY'] }) mode!: 'GHN_SANDBOX' | 'MOCK_ONLY';
}

export class ShipmentResponse {
  @ApiProperty() id!: string;
  @ApiProperty() orderId!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) carrierName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) trackingNumber!: string | null;
  @ApiProperty({ enum: SHIPMENT_STATUSES }) status!: ShipmentStatus;
  @ApiPropertyOptional({ type: Boolean, description: 'Đánh dấu vận đơn mô phỏng (Sandbox)' })
  isMock?: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) carrierStatus?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) statusNote?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) expectedDeliveryAt?: string | null;
  @ApiPropertyOptional({
    type: Boolean,
    description: 'true nếu GHN Sandbox lỗi và hệ thống đã dự phòng sang mô phỏng',
  })
  fallbackUsed?: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) fallbackReason?: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}
