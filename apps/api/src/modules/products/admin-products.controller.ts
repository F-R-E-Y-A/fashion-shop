import { Body, Controller, Get, Header, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
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
import { AdminProductContent, ChangeProductContentDto } from './dto/change-product-content.dto.js';
import { AdminProductStatus, ChangeProductStatusDto } from './dto/change-product-status.dto.js';
import { ListAdminProductsQuery } from './dto/list-admin-products.query.js';

@ApiTags('admin-products')
@Controller('admin/products')
@RequireRoles(RoleCode.ADMIN)
@ApiUnauthorizedResponse({ description: 'Chua dang nhap' })
@ApiForbiddenResponse({ description: 'Can vai ADMIN' })
@ApiBadRequestResponse({ description: 'Query/body/UUID khong hop le; tham so lap/la bi tu choi' })
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

  @Patch(':id/content')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Sua bon truong noi dung theo phien ban, giu truong admin sua qua import',
  })
  @ApiOkResponse({ type: AdminProductContent })
  @ApiNotFoundResponse({ description: 'Khong tim thay san pham' })
  @ApiConflictResponse({ description: 'Noi dung da doi, tai lai truoc khi luu' })
  changeContent(
    @Param() { id }: AdminProductIdParam,
    @Body() input: ChangeProductContentDto,
  ): Promise<AdminProductContent> {
    return this.products.changeContent(id, input);
  }

  @Patch(':id/status')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Ngung ban hoac go ngung ban thu cong, kiem phien ban; khong xoa du lieu',
  })
  @ApiOkResponse({ type: AdminProductStatus })
  @ApiNotFoundResponse({ description: 'Khong tim thay san pham' })
  @ApiConflictResponse({ description: 'Phien ban cu: tai lai va xac nhan lai' })
  changeStatus(
    @Param() { id }: AdminProductIdParam,
    @Body() input: ChangeProductStatusDto,
  ): Promise<AdminProductStatus> {
    return this.products.changeStatus(id, input);
  }
}
