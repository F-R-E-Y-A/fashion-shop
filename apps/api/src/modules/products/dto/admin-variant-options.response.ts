import { ApiProperty } from '@nestjs/swagger';

import { AdminProductColor } from './admin-product.response.js';

export class AdminOptionSize {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() sortOrder!: number;
}

export class AdminOptionColor extends AdminProductColor {
  @ApiProperty() id!: string;
}

export class AdminVariantOptionsResponse {
  @ApiProperty({ type: [AdminOptionColor] }) colors!: AdminOptionColor[];
  @ApiProperty({ type: [AdminOptionSize] }) sizes!: AdminOptionSize[];
}
