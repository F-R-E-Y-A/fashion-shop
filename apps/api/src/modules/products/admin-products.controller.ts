import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

import { CurrentUser, type CurrentUserType, RequireRoles, RoleCode } from '../auth/index.js';
import { UploadTicketResponse } from '../uploads/index.js';
import { AdminProductsService } from './admin-products.service.js';
import {
  AdminProductDetail,
  AdminProductIdParam,
  AdminProductPage,
  AdminProductVariant,
} from './dto/admin-product.response.js';
import { AdminVariantOptionsResponse } from './dto/admin-variant-options.response.js';
import { AdminProductContent, ChangeProductContentDto } from './dto/change-product-content.dto.js';
import { AdminProductStatus, ChangeProductStatusDto } from './dto/change-product-status.dto.js';
import { CreateProductVariantDto } from './dto/create-product-variant.dto.js';
import { ListAdminProductsQuery } from './dto/list-admin-products.query.js';
import {
  AdminProductImagesResponse,
  UpdateProductImagesDto,
} from './dto/update-product-images.dto.js';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto.js';

export class AdminVariantIdParam extends AdminProductIdParam {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'variantId phải là UUID' })
  variantId!: string;
}

@ApiTags('admin-products')
@Controller('admin/products')
@RequireRoles(RoleCode.ADMIN)
@ApiUnauthorizedResponse({ description: 'Chua dang nhap' })
@ApiForbiddenResponse({ description: 'Can vai ADMIN' })
@ApiBadRequestResponse({ description: 'Query/body/UUID khong hop le; tham so lap/la bi tu choi' })
export class AdminProductsController {
  constructor(private readonly products: AdminProductsService) {}

  @Get('variant-options')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Danh sach mau sac va kich co kha dung de tao bien the' })
  @ApiOkResponse({ type: AdminVariantOptionsResponse })
  variantOptions(): Promise<AdminVariantOptionsResponse> {
    return this.products.getVariantOptions();
  }

  @Post('upload-tickets')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Cap phieu ky san de ADMIN tai anh san pham thang len kho (purpose: product)',
  })
  @ApiOkResponse({ type: UploadTicketResponse })
  @ApiServiceUnavailableResponse({ description: 'UPLOADS_DISABLED: chua cau hinh CLOUDINARY_URL' })
  @ApiTooManyRequestsResponse({ description: 'RATE_LIMITED: qua 30 phieu moi gio' })
  createUploadTicket(@CurrentUser() user: CurrentUserType): Promise<UploadTicketResponse> {
    return this.products.createUploadTicket(user.id);
  }

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

  @Post(':id/variants')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Them bien the moi cho san pham (client-generated UUID, idempotent)' })
  @ApiCreatedResponse({ type: AdminProductVariant })
  @ApiNotFoundResponse({ description: 'Khong tim thay san pham, mau hoac co' })
  @ApiConflictResponse({
    description: 'Trung SKU, trung to hop mau/co, hoac trung id voi thong tin khac',
  })
  createVariant(
    @Param() { id }: AdminProductIdParam,
    @Body() input: CreateProductVariantDto,
  ): Promise<AdminProductVariant> {
    return this.products.createVariant(id, input);
  }

  @Patch(':id/variants/:variantId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Sua gia hoac bat/tat bien the voi CAS expectedUpdatedAt' })
  @ApiOkResponse({ type: AdminProductVariant })
  @ApiNotFoundResponse({ description: 'Khong tim thay san pham hoac bien the' })
  @ApiConflictResponse({ description: 'Token CAS khong khop (CONCURRENT_MODIFICATION)' })
  @ApiUnprocessableEntityResponse({
    description: 'Khong the tat bien the cuoi cung cua san pham dang mo ban',
  })
  updateVariant(
    @Param() { id, variantId }: AdminVariantIdParam,
    @Body() input: UpdateProductVariantDto,
  ): Promise<AdminProductVariant> {
    return this.products.updateVariant(id, variantId, input);
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
  @ApiUnprocessableEntityResponse({
    description: 'Khong the mo ban san pham khi khong co bien the hoat dong',
  })
  changeStatus(
    @Param() { id }: AdminProductIdParam,
    @Body() input: ChangeProductStatusDto,
  ): Promise<AdminProductStatus> {
    return this.products.changeStatus(id, input);
  }

  @Put(':id/images')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Luu nguyen tu bo anh co thu tu voi CAS imagesVersion; chuyen quyen quan ly anh sang admin',
  })
  @ApiOkResponse({ type: AdminProductImagesResponse })
  @ApiNotFoundResponse({ description: 'Khong tim thay san pham' })
  @ApiConflictResponse({ description: 'Bo anh da doi, tai lai truoc khi luu' })
  @ApiUnprocessableEntityResponse({
    description:
      'Qua gioi han 8 anh khi them moi, go anh cuoi cua san pham dang ban, hoac khoa anh khong hop le',
  })
  @ApiServiceUnavailableResponse({ description: 'Kho anh loi hoac chua bat khi co anh moi' })
  updateImages(
    @Param() { id }: AdminProductIdParam,
    @CurrentUser() user: CurrentUserType,
    @Body() input: UpdateProductImagesDto,
  ): Promise<AdminProductImagesResponse> {
    return this.products.updateImages(id, user.id, input);
  }
}
