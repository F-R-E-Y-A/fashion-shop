import { ApiProperty } from '@nestjs/swagger';

export class AuthenticatedUserResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ type: [String], example: ['CUSTOMER'] })
  roles!: string[];
}

export class AuthResponse {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ type: AuthenticatedUserResponse })
  user!: AuthenticatedUserResponse;
}

export class RegisterResponse {
  @ApiProperty({ example: true, description: 'Luon la true: dang ky khong cap phien dang nhap.' })
  verificationRequired!: true;

  @ApiProperty({ format: 'email' })
  email!: string;
}

export class VerifyEmailResponse {
  @ApiProperty({ example: true })
  verified!: true;
}

export class ResendVerificationResponse {
  @ApiProperty({ example: true, description: 'Luon true, ke ca khi email khong ton tai.' })
  accepted!: true;
}

export class ForgotPasswordResponse {
  @ApiProperty({
    example: true,
    description: 'Luon true, ke ca khi email khong ton tai hoac khong du dieu kien dat lai.',
  })
  accepted!: true;
}

export class ResetPasswordResponse {
  @ApiProperty({ example: true })
  reset!: true;
}
