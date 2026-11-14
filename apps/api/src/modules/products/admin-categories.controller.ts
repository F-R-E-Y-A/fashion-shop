import { Body, Controller, Get, Header, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { RequireRoles, RoleCode } from '../auth/index.js';
import { AdminCategoriesService } from './admin-categories.service.js';
import { AdminCategoryDetail, AdminCategoryNode } from './dto/admin-category.response.js';
import {
  AdminCategoryIdParam,
  AdminCategoryVisibilityResponse,
  ChangeCategoryVisibilityDto,
} from './dto/change-category-visibility.dto.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

@ApiTags('admin-categories')
@Controller('admin/categories')
@RequireRoles(RoleCode.ADMIN)
@ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
@ApiForbiddenResponse({ description: 'Cần vai trò ADMIN' })
@ApiBadRequestResponse({ description: 'Query/body/UUID không hợp lệ; tham số lạ bị từ chối' })
export class AdminCategoriesController {
  constructor(private readonly categories: AdminCategoriesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Cây danh mục quản trị, bao gồm cả danh mục ẩn, đếm sản phẩm trực tiếp và cả nhánh',
  })
  @ApiOkResponse({ type: [AdminCategoryNode] })
  tree(): Promise<AdminCategoryNode[]> {
    return this.categories.tree();
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Chi tiết danh mục quản trị theo UUID, thông tin cha–con và số đếm sản phẩm',
  })
  @ApiOkResponse({ type: AdminCategoryDetail })
  @ApiNotFoundResponse({ description: 'UUID hợp lệ nhưng danh mục không tồn tại' })
  detail(@Param() { id }: AdminCategoryIdParam): Promise<AdminCategoryDetail> {
    return this.categories.findById(id);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Tạo danh mục mới (mặc định ẩn isActive=false), idempotent theo UUID v4',
  })
  @ApiCreatedResponse({ type: AdminCategoryDetail })
  @ApiNotFoundResponse({ description: 'Danh mục cha không tồn tại' })
  @ApiConflictResponse({ description: 'Trùng slug hoặc trùng UUID với nội dung khác' })
  @ApiUnprocessableEntityResponse({
    description: 'Vi phạm cây 2 cấp hoặc danh mục cha đang có sản phẩm trực tiếp',
  })
  create(@Body() input: CreateCategoryDto): Promise<AdminCategoryDetail> {
    return this.categories.create(input);
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Cập nhật tên, thứ tự, danh mục cha với CAS (slug giữ bất biến)',
  })
  @ApiOkResponse({ type: AdminCategoryDetail })
  @ApiNotFoundResponse({ description: 'Không tìm thấy danh mục hoặc danh mục cha' })
  @ApiConflictResponse({ description: 'Xung đột phiên bản CAS: tải lại và xác nhận lại' })
  @ApiUnprocessableEntityResponse({
    description: 'Vi phạm cây 2 cấp, tự làm cha, hoặc cha mục tiêu đang có sản phẩm',
  })
  update(
    @Param() { id }: AdminCategoryIdParam,
    @Body() input: UpdateCategoryDto,
  ): Promise<AdminCategoryDetail> {
    return this.categories.update(id, input);
  }

  @Patch(':id/visibility')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Ẩn hoặc hiện danh mục, kiểm soát tương tranh lạc quan (CAS) bằng expectedUpdatedAt',
  })
  @ApiOkResponse({ type: AdminCategoryVisibilityResponse })
  @ApiNotFoundResponse({ description: 'Không tìm thấy danh mục' })
  @ApiConflictResponse({ description: 'Xung đột phiên bản: tải lại và xác nhận lại' })
  changeVisibility(
    @Param() { id }: AdminCategoryIdParam,
    @Body() input: ChangeCategoryVisibilityDto,
  ): Promise<AdminCategoryVisibilityResponse> {
    return this.categories.changeVisibility(id, input);
  }
}
