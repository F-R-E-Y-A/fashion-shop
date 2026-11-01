import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { AddressesController } from './addresses.controller.js';
import { AddressesService } from './addresses.service.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdministrativeAreasController } from './administrative-areas.controller.js';
import { AdministrativeAreasService } from './administrative-areas.service.js';
import { CheckoutAddressService } from './checkout-address.service.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';

/**
 * Tai khoan (Tai): quan tri tai khoan (can ADMIN), ho so va so dia chi cua chinh minh (chi can dang
 * nhap), danh muc tinh/xa (cong khai). Import AuthModule de dung AuthGuard, RequireRoles va RolesGuard.
 * Xuat CheckoutAddressService de Checkout doc dia chi cua dung principal trong transaction.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    AdminUsersController,
    AdministrativeAreasController,
    AddressesController,
    ProfileController,
  ],
  providers: [
    AdminUsersService,
    AdministrativeAreasService,
    AddressesService,
    ProfileService,
    CheckoutAddressService,
  ],
  exports: [CheckoutAddressService],
})
export class UsersModule {}
