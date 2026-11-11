import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsUUID, Max } from 'class-validator';

import { PageQuery } from '../../../common/pagination/page.query.js';

const integer = ({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
  const raw = obj[key];
  return typeof raw === 'string' && /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN;
};

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
