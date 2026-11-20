import { ApiProperty } from '@nestjs/swagger';

import { AdminOptionColor, AdminOptionSize } from './admin-variant-options.response.js';

export class AdminOptionBrand {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
}

export class AdminCreateOptionsResponse {
  @ApiProperty({ type: [AdminOptionBrand] }) brands!: AdminOptionBrand[];
  @ApiProperty({ type: [AdminOptionColor] }) colors!: AdminOptionColor[];
  @ApiProperty({ type: [AdminOptionSize] }) sizes!: AdminOptionSize[];
}
