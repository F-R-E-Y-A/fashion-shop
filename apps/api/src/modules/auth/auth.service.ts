import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import { OtpPurpose, Prisma, UserStatus } from '../../generated/prisma/client.js';
import { MailService } from '../../infra/mail/mail.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type {
  AuthenticatedUserResponse,
  AuthResponse,
  RegisterResponse,
  ResendVerificationResponse,
  VerifyEmailResponse,
} from './dto/auth.response.js';
import { LoginRequest, RegisterRequest } from './dto/auth-credentials.request.js';
import { ResendVerificationRequest } from './dto/resend-verification.request.js';
import { VerifyEmailRequest } from './dto/verify-email.request.js';
import { normalizeEmail } from './email.js';
import { OtpService } from './otp.service.js';
import { PasswordHasherService } from './password-hasher.service.js';
import { TokenService } from './token.service.js';
import { buildVerificationEmail } from './verification-email.js';

const CUSTOMER_ROLE_CODE = 'CUSTOMER';
const UNKNOWN_PASSWORD_HASH = '$2b$12$kzzzR78c851Kd4LxTJycQe/toZ7t7DbCWRLKxCDY8FpcWnrPLk48e';

interface AuthenticationResult extends AuthResponse {
  refreshToken: string;
}

/** Owns credential validation, Identity writes, and issuance of new authentication sessions. */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasherService,
    private readonly tokens: TokenService,
    private readonly otp: OtpService,
    private readonly mail: MailService,
  ) {}

  /**
   * Creates a PENDING_VERIFICATION user and emails an OTP. No session is issued here: the account
   * only becomes usable through verifyEmail() below, then a normal login().
   */
  async register(request: RegisterRequest): Promise<RegisterResponse> {
    const email = normalizeEmail(request.email);
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw this.emailAlreadyExists();

    const [passwordHash, customerRole] = await Promise.all([
      this.passwordHasher.hash(request.password),
      this.prisma.role.findUnique({ where: { code: CUSTOMER_ROLE_CODE }, select: { id: true } }),
    ]);
    if (!customerRole) throw this.customerRoleMissing();

    let issuedCode: string;
    try {
      issuedCode = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.user.create({
          data: {
            email,
            passwordHash,
            status: UserStatus.PENDING_VERIFICATION,
            userRoles: { create: { roleId: customerRole.id } },
          },
        });
        const issued = await this.otp.issue(transaction, {
          email,
          purpose: OtpPurpose.EMAIL_VERIFICATION,
          userId: created.id,
        });
        return issued.code;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) throw this.emailAlreadyExists();
      throw error;
    }

    // Gui email KHONG the rollback nhu giao dich CSDL: user da duoc tao PENDING_VERIFICATION du
    // email that bai, va van dung duoc /auth/resend-verification de xin ma moi.
    try {
      await this.mail.send(buildVerificationEmail({ to: email, code: issuedCode }));
    } catch {
      this.logger.warn(`Gui email xac thuc that bai luc dang ky (email=${email})`);
    }

    return { verificationRequired: true, email };
  }

  async login(request: LoginRequest): Promise<AuthenticationResult> {
    const email = normalizeEmail(request.email);
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { userRoles: { include: { role: { select: { code: true } } } } },
    });

    const passwordMatches = await this.passwordHasher.verify(
      request.password,
      user?.passwordHash ?? UNKNOWN_PASSWORD_HASH,
    );
    if (!user || !passwordMatches) throw this.invalidCredentials();
    if (user.status === UserStatus.PENDING_VERIFICATION) throw this.emailNotVerified();
    if (user.status !== UserStatus.ACTIVE) throw this.invalidCredentials();

    const authenticatedUser = this.toAuthenticatedUser(user);
    const refreshToken = this.tokens.generateRefreshToken();
    const accessToken = await this.tokens.signAccessToken(authenticatedUser.id);
    await this.prisma.refreshToken.create({
      data: {
        userId: authenticatedUser.id,
        tokenHash: this.tokens.hashRefreshToken(refreshToken),
        familyId: randomUUID(),
        expiresAt: this.tokens.refreshTokenExpiresAt(),
      },
    });

    return { accessToken, user: authenticatedUser, refreshToken };
  }

  /**
   * Activates a PENDING_VERIFICATION user on a correct, unexpired, not-yet-exhausted OTP.
   *
   * The whole lookup-verify-activate sequence runs as ONE transaction so it commits or rolls back
   * together, but nothing inside the callback throws for an expected outcome (wrong/expired/
   * exhausted code): a thrown exception would make Prisma roll back every write the callback made,
   * including the attemptCount increment that a "wrong code" outcome must persist. Only after
   * $transaction has resolved (committed) do we inspect the outcome and raise the matching HTTP
   * error, so a rejected verification can never erase its own side effect.
   */
  async verifyEmail(request: VerifyEmailRequest): Promise<VerifyEmailResponse> {
    const email = normalizeEmail(request.email);

    const outcome = await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { email },
        select: { id: true, status: true },
      });
      if (!user || user.status !== UserStatus.PENDING_VERIFICATION) {
        return { status: 'INVALID' } as const;
      }

      const result = await this.otp.verify(transaction, {
        email,
        purpose: OtpPurpose.EMAIL_VERIFICATION,
        code: request.code,
      });
      if (result.status !== 'VERIFIED') return result;

      await transaction.user.update({
        where: { id: user.id },
        data: { status: UserStatus.ACTIVE },
      });
      return result;
    });

    switch (outcome.status) {
      case 'VERIFIED':
        return { verified: true };
      case 'EXPIRED':
        throw this.otpExpired();
      case 'ATTEMPTS_EXCEEDED':
        throw this.otpAttemptsExceeded();
      case 'INVALID':
        throw this.otpInvalid();
    }
  }

  /**
   * Always returns the same generic response so an attacker cannot use this endpoint to learn
   * whether an email is registered, already verified, or locked/disabled.
   */
  async resendVerification(
    request: ResendVerificationRequest,
  ): Promise<ResendVerificationResponse> {
    const email = normalizeEmail(request.email);
    const accepted: ResendVerificationResponse = { accepted: true };

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true },
    });
    if (!user || user.status !== UserStatus.PENDING_VERIFICATION) return accepted;

    const issuedCode = await this.prisma.$transaction(async (transaction) => {
      if (
        await this.otp.isWithinResendCooldown(transaction, {
          email,
          purpose: OtpPurpose.EMAIL_VERIFICATION,
        })
      ) {
        return null;
      }
      const issued = await this.otp.issue(transaction, {
        email,
        purpose: OtpPurpose.EMAIL_VERIFICATION,
        userId: user.id,
      });
      return issued.code;
    });
    if (!issuedCode) return accepted;

    try {
      await this.mail.send(buildVerificationEmail({ to: email, code: issuedCode }));
    } catch {
      this.logger.warn(`Gui lai email xac thuc that bai (email=${email})`);
    }

    return accepted;
  }

  async refresh(refreshToken: string | undefined): Promise<AuthenticationResult> {
    if (!refreshToken) throw this.invalidRefreshToken();

    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    const now = new Date();
    const replacement = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.refreshToken.findUnique({
        where: { tokenHash },
        include: {
          user: { include: { userRoles: { include: { role: { select: { code: true } } } } } },
        },
      });
      if (
        !current ||
        current.revokedAt ||
        current.expiresAt <= now ||
        current.user.status !== UserStatus.ACTIVE
      ) {
        throw this.invalidRefreshToken();
      }

      const nextRefreshToken = this.tokens.generateRefreshToken();
      const created = await transaction.refreshToken.create({
        data: {
          userId: current.userId,
          tokenHash: this.tokens.hashRefreshToken(nextRefreshToken),
          familyId: current.familyId,
          expiresAt: this.tokens.refreshTokenExpiresAt(now),
        },
      });
      const revoked = await transaction.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: now, replacedByTokenId: created.id },
      });
      if (revoked.count !== 1) throw this.invalidRefreshToken();

      return { refreshToken: nextRefreshToken, user: this.toAuthenticatedUser(current.user) };
    });

    return this.withAccessToken(replacement.user, replacement.refreshToken);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.tokens.hashRefreshToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async withAccessToken(
    user: AuthenticatedUserResponse,
    refreshToken: string,
  ): Promise<AuthenticationResult> {
    return {
      accessToken: await this.tokens.signAccessToken(user.id),
      user,
      refreshToken,
    };
  }

  private toAuthenticatedUser(user: {
    id: string;
    email: string;
    userRoles: Array<{ role: { code: string } }>;
  }): AuthenticatedUserResponse {
    return {
      id: user.id,
      email: user.email,
      roles: user.userRoles.map(({ role }) => role.code),
    };
  }

  private emailAlreadyExists(): ConflictException {
    return new ConflictException({
      error: 'EMAIL_ALREADY_EXISTS',
      message: 'Email da duoc su dung',
    });
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      error: 'INVALID_CREDENTIALS',
      message: 'Email hoac mat khau khong dung',
    });
  }

  private emailNotVerified(): UnauthorizedException {
    return new UnauthorizedException({
      error: 'EMAIL_NOT_VERIFIED',
      message: 'Tai khoan chua xac thuc email',
    });
  }

  private invalidRefreshToken(): UnauthorizedException {
    return new UnauthorizedException({
      error: 'UNAUTHORIZED',
      message: 'Khong duoc phep truy cap',
    });
  }

  private otpInvalid(): BadRequestException {
    return new BadRequestException({
      error: 'OTP_INVALID',
      message: 'Ma xac thuc khong dung',
    });
  }

  private otpExpired(): BadRequestException {
    return new BadRequestException({
      error: 'OTP_EXPIRED',
      message: 'Ma xac thuc da het han',
    });
  }

  private otpAttemptsExceeded(): BadRequestException {
    return new BadRequestException({
      error: 'OTP_ATTEMPTS_EXCEEDED',
      message: 'Da nhap sai qua so lan cho phep, hay yeu cau ma moi',
    });
  }

  private customerRoleMissing(): InternalServerErrorException {
    return new InternalServerErrorException({
      error: 'AUTH_CONFIGURATION_ERROR',
      message: 'Cau hinh xac thuc khong hop le',
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
