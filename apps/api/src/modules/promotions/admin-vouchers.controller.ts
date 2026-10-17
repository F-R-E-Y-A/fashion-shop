import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequireRoles, RoleCode } from '../auth/index.js';
import { CreateVoucherDto } from './dto/create-voucher.dto.js';
import { ListVouchersQuery } from './dto/list-vouchers.query.js';
import { UpdateVoucherDto } from './dto/update-voucher.dto.js';
import { VoucherListResponse, VoucherResponse } from './dto/voucher.response.js';
import { PromotionsService } from './promotions.service.js';

@ApiTags('admin-vouchers')
@Controller('admin/vouchers')
@RequireRoles(RoleCode.ADMIN)
export class AdminVouchersController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách mã giảm giá có phân trang và bộ lọc (Admin - UC-10.2)' })
  @ApiOkResponse({ type: VoucherListResponse })
  async list(@Query() query: ListVouchersQuery): Promise<VoucherListResponse> {
    return this.promotionsService.listVouchers(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết mã giảm giá (Admin - UC-10.2)' })
  @ApiOkResponse({ type: VoucherResponse })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<VoucherResponse> {
    return this.promotionsService.getVoucherById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo mới mã giảm giá (Admin - UC-10.2)' })
  @ApiOkResponse({ type: VoucherResponse })
  async create(@Body() dto: CreateVoucherDto): Promise<VoucherResponse> {
    return this.promotionsService.createVoucher(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật mã giảm giá (Admin - UC-10.2)' })
  @ApiOkResponse({ type: VoucherResponse })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVoucherDto,
  ): Promise<VoucherResponse> {
    return this.promotionsService.updateVoucher(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Xóa hoặc chuyển trạng thái ngưng hoạt động của mã giảm giá (Admin - UC-10.2)',
  })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<{ ok: boolean; message: string }> {
    return this.promotionsService.deleteVoucher(id);
  }
}
