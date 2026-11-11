import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { RequireRoles, RoleCode } from '../auth/index.js';
import { AdminInventoryService } from './admin-inventory.service.js';
import {
  AdminInventoryDetail,
  AdminInventoryPage,
  InventoryPageQuery,
  InventoryVariantParam,
} from './dto/admin-inventory.dto.js';

@ApiTags('admin-inventory')
@Controller('admin/inventory')
@RequireRoles(RoleCode.ADMIN)
@ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
@ApiForbiddenResponse({ description: 'Cần quyền ADMIN' })
@ApiBadRequestResponse({ description: 'UUID hoặc phân trang không hợp lệ' })
export class AdminInventoryController {
  constructor(private readonly inventory: AdminInventoryService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminInventoryPage })
  list(@Query() query: InventoryPageQuery) {
    return this.inventory.list(query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminInventoryDetail })
  @ApiNotFoundResponse({ description: 'Không tìm thấy biến thể' })
  detail(@Param() { id }: InventoryVariantParam, @Query() query: InventoryPageQuery) {
    return this.inventory.detail(id, query);
  }
}
