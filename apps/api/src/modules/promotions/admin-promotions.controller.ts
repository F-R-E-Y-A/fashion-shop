import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PageQuery } from '../../common/pagination/page.query.js';
import { RequireRoles, RoleCode } from '../auth/index.js';
import {
  CreatePromotionDto,
  PromotionListResponse,
  PromotionResponse,
  UpdatePromotionDto,
} from './dto/promotion.dto.js';
import { PromotionsService } from './promotions.service.js';

@ApiTags('admin-promotions')
@Controller('admin/promotions')
@RequireRoles(RoleCode.ADMIN)
export class AdminPromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách chương trình khuyến mãi (Admin - UC-10.1)' })
  @ApiOkResponse({ type: PromotionListResponse })
  async list(@Query() query: PageQuery): Promise<PromotionListResponse> {
    return this.promotionsService.listPromotions(query);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo chương trình khuyến mãi mới (Admin - UC-10.1)' })
  @ApiOkResponse({ type: PromotionResponse })
  async create(@Body() dto: CreatePromotionDto): Promise<PromotionResponse> {
    return this.promotionsService.createPromotion(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật chương trình khuyến mãi (Admin - UC-10.1)' })
  @ApiOkResponse({ type: PromotionResponse })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePromotionDto,
  ): Promise<PromotionResponse> {
    return this.promotionsService.updatePromotion(id, dto);
  }
}
