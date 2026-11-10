import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { CurrentUserType } from './current-user.type.js';

/** Reads the safe principal that AuthGuard has already attached to the request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUserType => {
    const request = context.switchToHttp().getRequest<{ user: CurrentUserType }>();
    return request.user;
  },
);
