import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersService } from './admin-users.service.js';

/**
 * Quan tri tai khoan (Tai). Import AuthModule de RequireRoles dung duoc AuthGuard (can TokenService
 * cua AuthModule) va RolesGuard. Chua xuat service nao: chua phan he nao can doc tai khoan qua day.
 */
@Module({
  imports: [AuthModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
})
export class UsersModule {}
