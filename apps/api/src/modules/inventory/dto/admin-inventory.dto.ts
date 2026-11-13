import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PageQuery } from '../../../common/pagination/page.query.js';

const integer = ({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
  const raw = obj[key];
  return typeof raw === 'string' && /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN;
};

const optionalInteger = ({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
  const raw = obj[key];
  if (raw === undefined) return undefined;
  return typeof raw === 'string' && /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN;
};

const quantityNumber = ({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
  const raw = obj[key];
  if (typeof raw === 'number' && Number.isInteger(raw)) return raw;
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) return Number(raw.trim());
  return NaN;
};

export class LowStockQuery {
  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 100 })
  @Transform(optionalInteger)
  @IsInt({ message: 'threshold phai la so nguyen' })
  @Min(1, { message: 'threshold nho nhat la 1' })
  @Max(100, { message: 'threshold lon nhat la 100' })
  @IsOptional()
  threshold = 5;

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 10 })
  @Transform(optionalInteger)
  @IsInt({ message: 'limit phai la so nguyen' })
  @Min(1, { message: 'limit nho nhat la 1' })
  @Max(10, { message: 'limit lon nhat la 10' })
  @IsOptional()
  limit = 5;
}

export class AdminLowStockItem {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  sku!: string;
  @ApiProperty()
  productName!: string;
  @ApiProperty()
  colorName!: string;
  @ApiProperty()
  sizeCode!: string;
  @ApiProperty({ type: Number })
  quantityOnHand!: number;
  @ApiProperty({ description: 'Giữ chưa nhả và expiresAt > asOf' })
  reservedQuantity!: number;
  @ApiProperty({ type: Number })
  availableQuantity!: number;
}

export class AdminLowStockResponse {
  @ApiProperty({ type: [AdminLowStockItem] })
  items!: AdminLowStockItem[];
  @ApiProperty()
  total!: number;
  @ApiProperty()
  threshold!: number;
  @ApiProperty({ format: 'date-time' })
  asOf!: string;
}

export class InventoryPageQuery extends PageQuery {
  @ApiPropertyOptional({ default: 1, maximum: 100000 })
  @Transform(integer)
  @Max(100000)
  override page = 1;

  @ApiPropertyOptional({ default: 12, maximum: 60 })
  @Transform(integer)
  override pageSize = 12;
}

export class InventoryVariantParam {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;
}

export class AdminInventoryRow {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  sku!: string;
  @ApiProperty()
  productName!: string;
  @ApiProperty()
  colorName!: string;
  @ApiProperty()
  sizeCode!: string;
  @ApiProperty({ type: Number, nullable: true, description: 'null khi chưa nhập tồn' })
  quantityOnHand!: number | null;
  @ApiProperty({ description: 'Giữ chưa nhả và expiresAt > asOf' })
  reservedQuantity!: number;
  @ApiProperty({ type: Number, nullable: true })
  availableQuantity!: number | null;
}

export class AdminInventoryPage {
  @ApiProperty({ type: [AdminInventoryRow] })
  items!: AdminInventoryRow[];
  @ApiProperty()
  total!: number;
  @ApiProperty()
  page!: number;
  @ApiProperty()
  pageSize!: number;
  @ApiProperty()
  totalPages!: number;
  @ApiProperty({ format: 'date-time' })
  asOf!: string;
}

export class AdminStockMovement {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ enum: ['RECEIPT', 'SALE', 'RETURN', 'ADJUSTMENT'] })
  movementType!: string;
  @ApiProperty()
  quantityDelta!: number;
  @ApiPropertyOptional({ example: 'Nhập lô hàng từ nhà cung cấp', nullable: true })
  reason!: string | null;
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export type StockAdjustmentType = 'RECEIPT' | 'ADJUSTMENT';

export class AdminAdjustStockDto {
  @ApiProperty({
    enum: ['RECEIPT', 'ADJUSTMENT'],
    example: 'RECEIPT',
    description: 'Loại thao tác: RECEIPT (nhập thêm) hoặc ADJUSTMENT (cân bằng kiểm kê)',
  })
  @IsIn(['RECEIPT', 'ADJUSTMENT'], {
    message: 'type phai la RECEIPT hoac ADJUSTMENT',
  })
  type!: StockAdjustmentType;

  @ApiProperty({
    type: Number,
    example: 50,
    description:
      'RECEIPT: số lượng nhập thêm (> 0). ADJUSTMENT: số tồn thực tế sau kiểm kê (>= 0).',
  })
  @Transform(quantityNumber)
  @IsInt({ message: 'quantity phai la so nguyen' })
  @Min(0, { message: 'quantity nho nhat la 0' })
  @Max(1000000, { message: 'quantity lon nhat la 1000000' })
  quantity!: number;

  @ApiProperty({
    example: 'Nhập lô hàng từ nhà cung cấp',
    maxLength: 255,
    description: 'Lý do nhập hoặc điều chỉnh tồn kho',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'reason phai la chuoi' })
  @IsNotEmpty({ message: 'Ly do khong duoc de trong' })
  @MaxLength(255, { message: 'Ly do khong duoc vuot qua 255 ky tu' })
  reason!: string;
}

export class AdminMovementPage {
  @ApiProperty({ type: [AdminStockMovement] })
  items!: AdminStockMovement[];
  @ApiProperty()
  total!: number;
  @ApiProperty()
  page!: number;
  @ApiProperty()
  pageSize!: number;
  @ApiProperty()
  totalPages!: number;
}

export class AdminInventoryDetail extends AdminInventoryRow {
  @ApiProperty({ format: 'date-time' })
  asOf!: string;
  @ApiProperty({ type: AdminMovementPage })
  movements!: AdminMovementPage;
}
