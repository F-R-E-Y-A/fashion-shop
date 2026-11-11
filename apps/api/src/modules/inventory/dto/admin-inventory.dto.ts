import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

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
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
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
