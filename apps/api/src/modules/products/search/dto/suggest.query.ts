import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SuggestQuery {
  @ApiProperty({ description: 'Cau dang go, 2 den 120 ky tu', example: 'polo nu' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: 'q phai co it nhat 2 ky tu' })
  @MaxLength(120)
  q!: string;
}
