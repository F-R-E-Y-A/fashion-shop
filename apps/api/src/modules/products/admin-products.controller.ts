import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { RequireRoles, RoleCode } from '../auth/index.js';
import { AdminProductsService } from './admin-products.service.js';
import {
  AdminProductDetail,
  AdminProductIdParam,
  AdminProductPage,
} from './dto/admin-product.response.js';
import { ListAdminProductsQuery } from './dto/list-admin-products.query.js';

@ApiTags('admin-products')
@Controller('admin/products')
@RequireRoles(RoleCode.ADMIN)
@ApiUnauthorizedResponse({ description: 'Chua dang nhap' })
@ApiForbiddenResponse({ description: 'Can vai ADMIN' })
@ApiBadRequestResponse({ description: 'Query hoac UUID khong hop le; tham so lap/la bi tu choi' })
export class AdminProductsController {
  constructor(private readonly products: AdminProductsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Danh sach san pham quan tri, ke ca san pham/danh muc/bien the an' })
  @ApiOkResponse({ type: AdminProductPage })
  list(@Query() query: ListAdminProductsQuery): Promise<AdminProductPage> {
    return this.products.list(query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Chi tiet theo UUID, gom moi bien the va anh; khong loc dieu kien storefront',
  })
  @ApiOkResponse({ type: AdminProductDetail })
  @ApiNotFoundResponse({ description: 'UUID hop le nhung san pham khong ton tai' })
  detail(@Param() { id }: AdminProductIdParam): Promise<AdminProductDetail> {
    return this.products.findById(id);
  }
}
