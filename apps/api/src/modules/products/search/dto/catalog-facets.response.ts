import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FacetAudienceResponse {
  @ApiProperty({ enum: ['nam', 'nu'] }) value!: 'nam' | 'nu';
  @ApiProperty() count!: number;
}

export class FacetCategoryResponse {
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) parentSlug!: string | null;
  @ApiProperty() count!: number;
}

export class FacetColorResponse {
  @ApiProperty({ description: 'Khoa ho mau, dung cho tham so colors' }) family!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ description: 'Ma mau hien thi, vd #1d1814' }) hex!: string;
  @ApiProperty() count!: number;
}

export class FacetSizeResponse {
  @ApiProperty() code!: string;
  @ApiProperty() count!: number;
}

export class FacetPriceResponse {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) min!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) max!: number | null;
  @ApiProperty() count!: number;
}

/**
 * So dem cho bo loc. Moi nhom dem tren cac san pham qua MOI bo loc tru chinh nhom do, nen so
 * cua mot lua chon la so san pham se con lai neu khach chon them lua chon do. Chi tra lua chon co
 * count lon hon 0 hoac dang duoc chon. Mang, khong dung object khoa dong, de Swagger mo ta duoc.
 */
export class CatalogFacetsResponse {
  @ApiProperty({ type: [FacetAudienceResponse] }) audience!: FacetAudienceResponse[];
  @ApiProperty({ type: [FacetCategoryResponse], description: 'Cha roi den cac con cua no' })
  categories!: FacetCategoryResponse[];
  @ApiProperty({ type: [FacetColorResponse] }) colors!: FacetColorResponse[];
  @ApiProperty({ type: [FacetSizeResponse], description: 'Theo thu tu co' })
  sizes!: FacetSizeResponse[];
  @ApiProperty({ type: [FacetPriceResponse] }) price!: FacetPriceResponse[];
}
