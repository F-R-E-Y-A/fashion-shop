import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const ShipmentStatus = {
  PENDING: 'PENDING',
  IN_TRANSIT: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  RETURNED: 'RETURNED',
} as const;

export type ShipmentStatus = (typeof ShipmentStatus)[keyof typeof ShipmentStatus];

export const SHIPMENT_STATUSES = Object.values(ShipmentStatus);

export class CreateShipmentDto {
  @ApiPropertyOptional({ example: 'GHN', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  carrierName?: string;

  @ApiPropertyOptional({ example: 'GHN123456789VN', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  trackingNumber?: string;
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

  @ApiPropertyOptional({ example: 'GHN123456789VN' })
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

export class ShipmentResponse {
  @ApiProperty() id!: string;
  @ApiProperty() orderId!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) carrierName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) trackingNumber!: string | null;
  @ApiProperty({ enum: SHIPMENT_STATUSES }) status!: ShipmentStatus;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}
