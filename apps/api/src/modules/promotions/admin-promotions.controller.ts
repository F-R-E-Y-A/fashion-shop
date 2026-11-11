import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequireRoles, RoleCode } from '../auth/index.js';
import { ListPromotionsQuery } from './dto/list-promotions.query.js';
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
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Danh sách chương trình khuyến mãi (Admin - UC-10.1)' })
  @ApiOkResponse({ type: PromotionListResponse })
  async list(@Query() query: ListPromotionsQuery): Promise<PromotionListResponse> {
    return this.promotionsService.listPromotions(query);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo chương trình khuyến mãi mới (Admin - UC-10.1)' })
  @ApiOkResponse({ type: PromotionResponse })
  async create(@Body() dto: CreatePromotionDto): Promise<PromotionResponse> {
    return this.promotionsService.createPromotion(dto);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Chi tiết chương trình khuyến mãi (Admin - UC-10.1)' })
  @ApiOkResponse({ type: PromotionResponse })
  async getById(@Param('id', ParseUUIDPipe) id: string): Promise<PromotionResponse> {
    return this.promotionsService.getPromotionById(id);
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

  @Delete(':id')
  @ApiOperation({ summary: 'Ngưng kích hoạt chương trình khuyến mãi (Admin - UC-10.1)' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.promotionsService.deletePromotion(id);
  }
}
