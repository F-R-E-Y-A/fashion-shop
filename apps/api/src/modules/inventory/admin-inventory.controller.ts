import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
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
  AdminAdjustStockDto,
  AdminInventoryDetail,
  AdminInventoryPage,
  AdminLowStockResponse,
  InventoryPageQuery,
  InventoryVariantParam,
  LowStockQuery,
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

  @Get('low-stock')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminLowStockResponse })
  lowStock(@Query() query: LowStockQuery) {
    return this.inventory.lowStock(query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminInventoryDetail })
  @ApiNotFoundResponse({ description: 'Không tìm thấy biến thể' })
  detail(@Param() { id }: InventoryVariantParam, @Query() query: InventoryPageQuery) {
    return this.inventory.detail(id, query);
  }

  @Post(':id/adjust')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminInventoryDetail })
  @ApiNotFoundResponse({ description: 'Không tìm thấy biến thể' })
  @ApiBadRequestResponse({
    description: 'Số lượng hoặc lý do không hợp lệ, hoặc nhỏ hơn lượng đang giữ cho đơn hàng',
  })
  adjust(@Param() { id }: InventoryVariantParam, @Body() dto: AdminAdjustStockDto) {
    return this.inventory.adjust(id, dto);
  }
}
