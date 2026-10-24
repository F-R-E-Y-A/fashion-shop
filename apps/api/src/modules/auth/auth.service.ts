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
import { AuthRateLimitService } from './auth-rate-limit.service.js';
import type {
  AuthenticatedUserResponse,
  AuthResponse,
  ForgotPasswordResponse,
  RegisterResponse,
  ResendVerificationResponse,
  ResetPasswordResponse,
  VerifyEmailResponse,
} from './dto/auth.response.js';
import { LoginRequest, RegisterRequest } from './dto/auth-credentials.request.js';
import { ChangePasswordRequest } from './dto/change-password.request.js';
import { ForgotPasswordRequest } from './dto/forgot-password.request.js';
import { ResendVerificationRequest } from './dto/resend-verification.request.js';
import { ResetPasswordRequest } from './dto/reset-password.request.js';
import { VerifyEmailRequest } from './dto/verify-email.request.js';
import { normalizeEmail } from './email.js';
import { OtpService } from './otp.service.js';
import { PasswordHasherService } from './password-hasher.service.js';
import { buildPasswordResetEmail } from './password-reset-email.js';
import { RoleCode } from './role-code.js';
import { TokenService } from './token.service.js';
import { lockUserForSession, lockUserForSessionEnd } from './user-session-lock.js';
import { buildVerificationEmail } from './verification-email.js';

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
    private readonly limits: AuthRateLimitService,
  ) {}

  /**
   * Creates a PENDING_VERIFICATION user and emails an OTP. No session is issued here: the account
   * only becomes usable through verifyEmail() below, then a normal login().
   */
  async register(request: RegisterRequest, ip: string | undefined): Promise<RegisterResponse> {
    await this.limits.enforce('REGISTER', { ip });

    const email = normalizeEmail(request.email);
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw this.emailAlreadyExists();

    const [passwordHash, customerRole] = await Promise.all([
      this.passwordHasher.hash(request.password),
      this.prisma.role.findUnique({ where: { code: RoleCode.CUSTOMER }, select: { id: true } }),
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
      this.logger.warn('Gui email xac thuc that bai luc dang ky');
    }

    return { verificationRequired: true, email };
  }

  /**
   * Brute-force protection counts EVERY attempt before any lookup or bcrypt work (count first,
   * check after, atomically), keyed on the hashed normalized email whether or not it exists, so an
   * unknown email hits the same limit and gets the same 429 as a real one. A successful login clears
   * the identity counter, which makes the effective rule "5 failed attempts per 15 minutes".
   */
  async login(request: LoginRequest, ip: string | undefined): Promise<AuthenticationResult> {
    const email = normalizeEmail(request.email);
    await this.limits.enforce('LOGIN', { ip, identity: email });

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
    // Trang thai doc o tren da cu sau bcrypt (vai tram ms): kiem lai duoi khoa dong user roi moi tao
    // phien, de admin khoa tai khoan hay doi mat khau trong luc do khong de lai refresh token song lai
    // sau khi mo khoa (xem lockUserForSession). Lech authVersion nghia la mat khau vua doi: tu choi.
    const sessionCreated = await this.prisma.$transaction(async (transaction) => {
      const locked = await lockUserForSession(transaction, user.id);
      if (locked?.status !== UserStatus.ACTIVE || locked.authVersion !== user.authVersion) {
        return false;
      }
      await transaction.refreshToken.create({
        data: {
          userId: authenticatedUser.id,
          tokenHash: this.tokens.hashRefreshToken(refreshToken),
          familyId: randomUUID(),
          expiresAt: this.tokens.refreshTokenExpiresAt(),
        },
      });
      return true;
    });
    if (!sessionCreated) throw this.invalidCredentials();
    const accessToken = await this.tokens.signAccessToken(authenticatedUser.id, user.authVersion);

    await this.limits.resetIdentity('LOGIN', email);
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
  async verifyEmail(
    request: VerifyEmailRequest,
    ip: string | undefined,
  ): Promise<VerifyEmailResponse> {
    await this.limits.enforce('VERIFY_EMAIL', { ip });
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

      // Only the request that consumed the OTP gets here, so the timestamp is written once.
      await transaction.user.update({
        where: { id: user.id },
        data: { status: UserStatus.ACTIVE, emailVerifiedAt: new Date() },
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
    ip: string | undefined,
  ): Promise<ResendVerificationResponse> {
    const email = normalizeEmail(request.email);
    // Dem theo email da chuan hoa TRUOC khi tra cuu user: email khong ton tai cung bi dem, nen 429
    // khong phan biet duoc tai khoan co that hay khong.
    await this.limits.enforce('RESEND_VERIFICATION', { ip, identity: email });
    const accepted: ResendVerificationResponse = { accepted: true };

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true },
    });
    if (!user || user.status !== UserStatus.PENDING_VERIFICATION) return accepted;

    const issuedCode = await this.prisma.$transaction(async (transaction) => {
      const issued = await this.otp.issueIfCooldownElapsed(transaction, {
        email,
        purpose: OtpPurpose.EMAIL_VERIFICATION,
        userId: user.id,
      });
      return issued?.code ?? null;
    });
    if (!issuedCode) return accepted;

    try {
      await this.mail.send(buildVerificationEmail({ to: email, code: issuedCode }));
    } catch {
      this.logger.warn('Gui lai email xac thuc that bai');
    }

    return accepted;
  }

  /**
   * Always returns the same generic response. Policy: only an ACTIVE account ever gets a real
   * PASSWORD_RESET OTP + email. PENDING_VERIFICATION cannot log in regardless of password (it is
   * blocked by EMAIL_NOT_VERIFIED, a separate purpose/flow), and LOCKED/DISABLED are deliberate
   * administrative holds that self-service password recovery must not undermine — both cases are
   * silently accepted here, exactly like an unknown email, so this endpoint cannot be used to learn
   * whether an email exists or what state its account is in.
   */
  async forgotPassword(
    request: ForgotPasswordRequest,
    ip: string | undefined,
  ): Promise<ForgotPasswordResponse> {
    const email = normalizeEmail(request.email);
    await this.limits.enforce('FORGOT_PASSWORD', { ip, identity: email });
    const accepted: ForgotPasswordResponse = { accepted: true };

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) return accepted;

    const issuedCode = await this.prisma.$transaction(async (transaction) => {
      const issued = await this.otp.issueIfCooldownElapsed(transaction, {
        email,
        purpose: OtpPurpose.PASSWORD_RESET,
        userId: user.id,
      });
      return issued?.code ?? null;
    });
    if (!issuedCode) return accepted;

    try {
      await this.mail.send(buildPasswordResetEmail({ to: email, code: issuedCode }));
    } catch {
      this.logger.warn('Gui email dat lai mat khau that bai');
    }

    return accepted;
  }

  /**
   * Changes the password on a correct, unexpired, not-yet-exhausted PASSWORD_RESET OTP, and revokes
   * every refresh session the user currently holds (not just one family) so a stolen/old session
   * cannot survive a password reset. Follows the exact same outcome-after-transaction discipline as
   * verifyEmail(): nothing throws inside the transaction for an expected outcome, so the OTP
   * consumption, password change, and session revocation either all commit together or none do —
   * there is no state where the password changed but the OTP is still usable, or vice versa.
   *
   * The same transaction also bumps `authVersion`, so every access token issued before the reset
   * (which carries the old `ver`) is rejected by AuthGuard immediately instead of surviving until
   * its own TTL. There is no per-token blacklist: the version compare is enough and needs no cache.
   */
  async resetPassword(
    request: ResetPasswordRequest,
    ip: string | undefined,
  ): Promise<ResetPasswordResponse> {
    await this.limits.enforce('RESET_PASSWORD', { ip });
    const email = normalizeEmail(request.email);

    const outcome = await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { email },
        select: { id: true, status: true },
      });
      if (!user || user.status !== UserStatus.ACTIVE) return { status: 'INVALID' } as const;

      const result = await this.otp.verify(transaction, {
        email,
        purpose: OtpPurpose.PASSWORD_RESET,
        code: request.code,
      });
      if (result.status !== 'VERIFIED') return result;

      const passwordHash = await this.passwordHasher.hash(request.newPassword);
      await transaction.user.update({
        where: { id: user.id },
        data: { passwordHash, authVersion: { increment: 1 } },
      });
      await transaction.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return result;
    });

    switch (outcome.status) {
      case 'VERIFIED':
        return { reset: true };
      case 'EXPIRED':
        throw this.otpExpired();
      case 'ATTEMPTS_EXCEEDED':
        throw this.otpAttemptsExceeded();
      case 'INVALID':
        throw this.otpInvalid();
    }
  }

  /**
   * Changes the password for the already-authenticated principal (userId comes from AuthGuard's
   * verified access token, never from the request body) and revokes every refresh session the
   * user currently holds. AuthGuard has already re-queried the user's status for this exact
   * request and rejected LOCKED/DISABLED/PENDING_VERIFICATION with the generic 401 it always uses,
   * so this method does not repeat that check.
   *
   * The password-hash write and the session revocation happen in the same transaction, and the
   * write is a conditional `updateMany` keyed on the passwordHash this method actually read
   * (optimistic concurrency): if another request changed the password first, this update matches
   * zero rows and the whole change is rejected rather than silently overwriting a newer password.
   * Nothing throws inside the transaction for that "lost the race" outcome, for the same reason
   * verifyEmail()/resetPassword() don't: a thrown exception would roll back a persisted write that
   * must survive, and here it is exactly the point — a stale write must NOT persist, so returning a
   * discriminated outcome and mapping it to an HTTP error after commit keeps the same discipline.
   */
  async changePassword(userId: string, request: ChangePasswordRequest): Promise<void> {
    // Dem MOI lan thu truoc khi tinh bcrypt (dem truoc, kiem sau) nen bao ve chong doan mat khau
    // hien tai ngay ca khi nhieu request song song. Chung minh dung mat khau hien tai thi xoa bo dem.
    await this.limits.enforce('CHANGE_PASSWORD', { identity: userId });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) throw this.currentPasswordInvalid();

    const currentMatches = await this.passwordHasher.verify(
      request.currentPassword,
      user.passwordHash,
    );
    if (!currentMatches) throw this.currentPasswordInvalid();
    await this.limits.resetIdentity('CHANGE_PASSWORD', userId);

    const sameAsCurrent = await this.passwordHasher.verify(request.newPassword, user.passwordHash);
    if (sameAsCurrent) throw this.newPasswordSameAsCurrent();

    const newPasswordHash = await this.passwordHasher.hash(request.newPassword);

    const outcome = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.updateMany({
        where: { id: userId, passwordHash: user.passwordHash },
        data: { passwordHash: newPasswordHash, authVersion: { increment: 1 } },
      });
      if (updated.count === 0) return { status: 'STALE' } as const;

      await transaction.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { status: 'CHANGED' } as const;
    });

    if (outcome.status === 'STALE') throw this.currentPasswordInvalid();
  }

  /**
   * Rotates a refresh token and detects REPLAY: presenting a token that was already rotated.
   *
   * A rotated token is `revokedAt` set AND `replacedByTokenId` set; a token revoked by logout or by
   * a password change/reset has `revokedAt` but no replacement. That is the whole distinction, so no
   * schema change is needed. Only a genuine replay triggers the family response; unknown/garbage
   * tokens, expired tokens, and logout/password revocations only get the same generic 401, so a
   * random string can never revoke anyone's session.
   *
   * The token is CLAIMED first (conditional `revokedAt: null` update) and the replacement is created
   * only if the claim won. Of two concurrent refreshes with the same token exactly one claims it; the
   * other waits on the row, sees it rotated, and treats that as replay. The winner's new token is in
   * the same family and already committed, so revoking the family makes it unusable too — the
   * intended outcome when a token is used twice, because we cannot tell which holder is legitimate.
   *
   * As everywhere else, nothing throws inside the transaction for an expected outcome: the family
   * revocation must persist while the request still fails, and a throw would roll it back.
   */
  async refresh(refreshToken: string | undefined): Promise<AuthenticationResult> {
    if (!refreshToken) throw this.invalidRefreshToken();

    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    const now = new Date();
    const outcome = await this.prisma.$transaction(async (transaction) => {
      const owner = await transaction.refreshToken.findUnique({
        where: { tokenHash },
        select: { userId: true },
      });
      if (!owner) return { status: 'UNKNOWN' } as const;
      // Khoa dong user TRUOC khi doc trang thai va xoay: lenh doc ben duoi thay trang thai sau cung,
      // va neu admin khoa tai khoan song song thi token moi tao ra se bi lenh thu hoi cua ho thay.
      await lockUserForSession(transaction, owner.userId);

      const current = await transaction.refreshToken.findUnique({
        where: { tokenHash },
        include: {
          user: { include: { userRoles: { include: { role: { select: { code: true } } } } } },
        },
      });
      if (!current) return { status: 'UNKNOWN' } as const;

      if (current.revokedAt) {
        if (!current.replacedByTokenId) return { status: 'REVOKED' } as const;
        return this.revokeFamilyOnReplay(transaction, current.familyId, now);
      }
      if (current.expiresAt <= now) return { status: 'EXPIRED' } as const;
      if (current.user.status !== UserStatus.ACTIVE) return { status: 'INACTIVE' } as const;

      const claimed = await transaction.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: now },
      });
      if (claimed.count !== 1) {
        // Lost the claim: someone revoked it between our read and write. Only a rotation is a
        // replay; a concurrent logout/password change just means the session is already gone.
        const fresh = await transaction.refreshToken.findUnique({
          where: { id: current.id },
          select: { replacedByTokenId: true },
        });
        if (!fresh?.replacedByTokenId) return { status: 'REVOKED' } as const;
        return this.revokeFamilyOnReplay(transaction, current.familyId, now);
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
      await transaction.refreshToken.update({
        where: { id: current.id },
        data: { replacedByTokenId: created.id },
      });

      return {
        status: 'ROTATED',
        refreshToken: nextRefreshToken,
        user: this.toAuthenticatedUser(current.user),
        authVersion: current.user.authVersion,
      } as const;
    });

    if (outcome.status !== 'ROTATED') throw this.invalidRefreshToken();
    return this.withAccessToken(outcome.user, outcome.authVersion, outcome.refreshToken);
  }

  /** Revokes only the replayed token's OWN family; other sessions of the same user are untouched. */
  private async revokeFamilyOnReplay(
    transaction: Prisma.TransactionClient,
    familyId: string,
    now: Date,
  ) {
    await transaction.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
    // familyId is a random UUID, not a credential or PII; never log the token or its hash.
    this.logger.warn(`Refresh token da xoay bi dung lai, thu hoi ca family (familyId=${familyId})`);
    return { status: 'REPLAY' } as const;
  }

  /**
   * Ket thuc phien cua cookie duoc gui: thu hoi CA family, ke ca khi token gui len vua bi xoay (logout
   * mang cookie cu trong luc refresh dang bay). Family khac cua cung nguoi dung khong bi dong toi.
   * Nguoi cam token cu von da thu hoi duoc ca family qua replay refresh (ADR-016), nen khong mo them
   * nang luc nao. Token la thi khong lam gi.
   */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;

    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    await this.prisma.$transaction(async (transaction) => {
      const owner = await transaction.refreshToken.findUnique({
        where: { tokenHash },
        select: { userId: true, familyId: true },
      });
      if (!owner) return;
      await lockUserForSessionEnd(transaction, owner.userId);
      await transaction.refreshToken.updateMany({
        where: { userId: owner.userId, familyId: owner.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  private async withAccessToken(
    user: AuthenticatedUserResponse,
    authVersion: number,
    refreshToken: string,
  ): Promise<AuthenticationResult> {
    return {
      accessToken: await this.tokens.signAccessToken(user.id, authVersion),
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

  private currentPasswordInvalid(): BadRequestException {
    // 400, not 401: the caller is already authenticated (AuthGuard confirmed the access token and
    // ACTIVE status). A wrong current password is a business-rule failure on this specific
    // mutation's input, the same category as OTP_INVALID, not an authentication/session failure —
    // keeping it out of 401 also avoids the frontend's authenticatedRequest() treating a wrong
    // current password as an expired-token signal and firing an unnecessary refresh+retry.
    return new BadRequestException({
      error: 'CURRENT_PASSWORD_INVALID',
      message: 'Mat khau hien tai khong dung',
    });
  }

  private newPasswordSameAsCurrent(): BadRequestException {
    return new BadRequestException({
      error: 'NEW_PASSWORD_SAME_AS_CURRENT',
      message: 'Mat khau moi phai khac mat khau hien tai',
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
