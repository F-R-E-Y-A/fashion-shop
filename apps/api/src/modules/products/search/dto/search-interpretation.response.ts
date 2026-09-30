import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { ChipKind, IntentAudience, IntentSort } from '../parse-query.js';

const CHIP_KINDS: ChipKind[] = [
  'price',
  'size',
  'audience',
  'color',
  'category',
  'sort',
  'style',
  'occasion',
  'term',
  'free',
];

/** Mot y cua cau tim kiem da duoc hieu. */
export class InterpretationChipResponse {
  @ApiProperty({ enum: CHIP_KINDS }) kind!: ChipKind;
  @ApiProperty({ description: 'Gia tri chuan, vd ho mau "trang" hay khoang gia "-100000"' })
  value!: string;
  @ApiProperty({ description: 'Nhan hien cho khach, vd "Màu trắng"' }) label!: string;
  @ApiProperty({ description: 'Nguyen van cac tu khach da go tao ra y nay' }) source!: string;
  @ApiProperty({
    type: [Number],
    description: 'Vi tri cac tu (tach theo khoang trang) da tao ra y nay; dung de bo y khoi cau',
  })
  tokens!: number[];
}

/** Nhung gi bo hieu truy van doc ra tu cau tim kiem (UC-03.2). */
export class SearchInterpretationResponse {
  @ApiProperty({ type: [String] }) categorySlugs!: string[];
  @ApiPropertyOptional({ enum: ['nam', 'nu'], nullable: true }) audience!: IntentAudience | null;
  @ApiProperty({ type: [String] }) colorFamilies!: string[];
  @ApiProperty({ type: [String] }) sizes!: string[];
  @ApiPropertyOptional({ type: Number, nullable: true }) minPrice!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) maxPrice!: number | null;
  @ApiPropertyOptional({ enum: ['newest', 'price_asc', 'price_desc'], nullable: true })
  sort!: IntentSort | null;
  @ApiProperty({
    type: 'array',
    items: { type: 'array', items: { type: 'string' } },
    description: 'Cac nhom tu bat buoc; moi nhom la HOAC giua cac tu, cac nhom la VA',
  })
  termGroups!: string[][];
  @ApiProperty({ type: [InterpretationChipResponse] }) chips!: InterpretationChipResponse[];
  @ApiProperty({ type: [String], description: 'Cac tu qua ngan nen bi bo qua' })
  ignored!: string[];
}
