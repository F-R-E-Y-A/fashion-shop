import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CategoriesService } from './categories.service.js';
import { CategoryDetailResponse, CategoryNodeResponse } from './dto/category.response.js';
import { ProductSlugParam } from './dto/product-slug.param.js';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Cây danh mục đang hiện' })
  @ApiOkResponse({ type: CategoryNodeResponse, isArray: true })
  tree(): Promise<CategoryNodeResponse[]> {
    return this.categories.tree();
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Danh mục theo slug' })
  @ApiOkResponse({ type: CategoryDetailResponse })
  detail(@Param() { slug }: ProductSlugParam): Promise<CategoryDetailResponse> {
    return this.categories.findBySlug(slug);
  }
}
