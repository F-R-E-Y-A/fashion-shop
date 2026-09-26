import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';

import { Prisma, UserStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { AuthenticatedUserResponse, AuthResponse } from './dto/auth.response.js';
import { LoginRequest, RegisterRequest } from './dto/auth-credentials.request.js';
import { normalizeEmail } from './email.js';
import { PasswordHasherService } from './password-hasher.service.js';
import { TokenService } from './token.service.js';

const CUSTOMER_ROLE_CODE = 'CUSTOMER';
const UNKNOWN_PASSWORD_HASH = '$2b$12$kzzzR78c851Kd4LxTJycQe/toZ7t7DbCWRLKxCDY8FpcWnrPLk48e';

interface AuthenticationResult extends AuthResponse {
  refreshToken: string;
}

/** Owns credential validation, Identity writes, and issuance of new authentication sessions. */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasherService,
    private readonly tokens: TokenService,
  ) {}

  async register(request: RegisterRequest): Promise<AuthenticationResult> {
    const email = normalizeEmail(request.email);
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw this.emailAlreadyExists();

    const [passwordHash, customerRole] = await Promise.all([
      this.passwordHasher.hash(request.password),
      this.prisma.role.findUnique({ where: { code: CUSTOMER_ROLE_CODE }, select: { id: true } }),
    ]);
    if (!customerRole) throw this.customerRoleMissing();

    const refreshToken = this.tokens.generateRefreshToken();
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    const expiresAt = this.tokens.refreshTokenExpiresAt();

    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.user.create({
          data: {
            email,
            passwordHash,
            status: UserStatus.ACTIVE,
            userRoles: { create: { roleId: customerRole.id } },
            refreshTokens: {
              create: {
                tokenHash,
                familyId: randomUUID(),
                expiresAt,
              },
            },
          },
          include: { userRoles: { include: { role: { select: { code: true } } } } },
        });
        return this.toAuthenticatedUser(created);
      });

      return this.withAccessToken(user, refreshToken);
    } catch (error) {
      if (this.isUniqueViolation(error)) throw this.emailAlreadyExists();
      throw error;
    }
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
    if (!user || !passwordMatches || user.status !== UserStatus.ACTIVE) {
      throw this.invalidCredentials();
    }

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
