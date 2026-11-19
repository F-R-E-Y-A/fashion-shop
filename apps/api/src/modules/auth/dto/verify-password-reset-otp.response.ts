import { ApiProperty } from '@nestjs/swagger';

export class VerifyPasswordResetOtpResponse {
  @ApiProperty({
    description: 'Reset grant token ngan han (dung 1 lan) de dat lai mat khau',
    example: 'd9b1c73a45c3614995f9d85aa990146747ddb8d6e7b1583c7c2b6ab8e3110589',
  })
  resetToken!: string;
}
