import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ValidateVoucherDto {
  @ApiProperty({
    description: 'Mã giảm giá người dùng nhập',
    example: 'FREYA10',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString({ message: 'Mã giảm giá phải là chuỗi' })
  @IsNotEmpty({ message: 'Mã giảm giá không được để trống' })
  code!: string;

  @ApiProperty({
    description: 'Tạm tính tiền hàng (trước giảm giá và phí vận chuyển), đơn vị VNĐ',
    example: '500000',
  })
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'Tạm tính tiền hàng phải là số không âm' })
  @IsNotEmpty({ message: 'Tạm tính tiền hàng không được để trống' })
  subtotal!: string;
}
