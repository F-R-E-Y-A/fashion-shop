import { Body, Controller, Get, Header, Param, Patch } from '@nestjs/common';
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
import { AdminCategoriesService } from './admin-categories.service.js';
import { AdminCategoryDetail, AdminCategoryNode } from './dto/admin-category.response.js';
import {
  AdminCategoryIdParam,
  AdminCategoryVisibilityResponse,
  ChangeCategoryVisibilityDto,
} from './dto/change-category-visibility.dto.js';

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
