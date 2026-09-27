import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { UserStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { CurrentUserType } from './current-user.type.js';
import { TokenService } from './token.service.js';

type AuthenticatedRequest = {
  headers: { authorization?: string };
  user?: CurrentUserType;
};

/** Verifies an access JWT and resolves a safe, currently active authenticated principal. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const accessToken = this.accessTokenFrom(request.headers.authorization);

    const payload = await this.tokens.verifyAccessToken(accessToken).catch(() => {
      throw this.unauthorized();
    });
    if (!payload.sub) throw this.unauthorized();

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        status: true,
        userRoles: { select: { role: { select: { code: true } } } },
      },
    });
    if (!user || user.status !== UserStatus.ACTIVE) throw this.unauthorized();

    request.user = {
      id: user.id,
      email: user.email,
      roles: user.userRoles.map(({ role }) => role.code),
    };
    return true;
  }

  private accessTokenFrom(authorization: string | undefined): string {
    const match = /^Bearer ([^\s]+)$/.exec(authorization ?? '');
    if (!match?.[1]) throw this.unauthorized();
    return match[1];
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      error: 'UNAUTHORIZED',
      message: 'Khong duoc phep truy cap',
    });
  }
}
