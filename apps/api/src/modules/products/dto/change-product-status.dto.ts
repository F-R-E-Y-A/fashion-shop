import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class ChangeProductStatusDto {
  @ApiProperty({
    description: 'true: ngung ban thu cong; false: go ngung ban, tinh lai theo nguon',
  })
  @IsBoolean()
  adminDisabled!: boolean;

  @ApiProperty({ minimum: 0, maximum: 2147483647 })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  expectedVersion!: number;
}

export class AdminProductStatus {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() adminDisabled!: boolean;
  @ApiProperty() statusVersion!: number;
}
