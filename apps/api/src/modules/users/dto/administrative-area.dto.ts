import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/**
 * GET /api/administrative-areas: khong co parentId thi tra cac tinh; co parentId (id mot tinh) thi tra
 * cac xa cua tinh do. Mot duong dan cho ca hai bac de khong co hai API trung chuc nang.
 */
export class ListAdministrativeAreasQuery {
  @ApiPropertyOptional({ format: 'uuid', description: 'Id tinh; bo trong de lay danh sach tinh' })
  @IsOptional()
  @IsUUID('all', { message: 'parentId phai la UUID' })
  parentId?: string;
}

export class AdministrativeAreaResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: 'Ma don vi hanh chinh' }) code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['PROVINCE', 'COMMUNE'] }) level!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) parentId!: string | null;
}
