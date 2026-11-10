import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  NotContains,
  ValidateIf,
} from 'class-validator';

import { CONTENT_FIELDS } from '../product-content.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const nullableTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
const notNull = (_: unknown, value: unknown) => value !== null;

export class ChangeProductContentDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  @NotContains('\0')
  name!: string;

  @ApiProperty({ type: String, nullable: true, maxLength: 20000 })
  @Transform(nullableTrim)
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(20000)
  @NotContains('\0')
  description!: string | null;

  @ApiProperty({ type: String, nullable: true, maxLength: 500 })
  @Transform(nullableTrim)
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(500)
  @NotContains('\0')
  material!: string | null;

  @ApiProperty({ type: String, nullable: true, maxLength: 5000 })
  @Transform(nullableTrim)
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(5000)
  @NotContains('\0')
  careInstructions!: string | null;

  @ApiProperty({ minimum: 0, maximum: 2147483646 })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedVersion!: number;
}

export class AdminProductContent {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) material!: string | null;
  @ApiProperty({ type: String, nullable: true }) careInstructions!: string | null;
  @ApiProperty() contentVersion!: number;
  @ApiProperty({ isArray: true, enum: CONTENT_FIELDS }) adminContentFields!: string[];
}
