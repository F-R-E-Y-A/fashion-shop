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
import { CreateVoucherDto } from './dto/create-voucher.dto.js';
import { ListVouchersQuery } from './dto/list-vouchers.query.js';
import { UpdateVoucherDto } from './dto/update-voucher.dto.js';
import { VoucherListResponse, VoucherResponse } from './dto/voucher.response.js';
import { PromotionsService } from './promotions.service.js';

@ApiTags('admin-vouchers')
@Controller('admin/vouchers')
@RequireRoles(RoleCode.ADMIN)
@ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
@ApiForbiddenResponse({ description: 'Cần vai trò ADMIN' })
@ApiBadRequestResponse({ description: 'Tham số hoặc dữ liệu không hợp lệ' })
export class AdminVouchersController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Danh sách mã giảm giá có phân trang và bộ lọc (Admin - UC-10.2)' })
  @ApiOkResponse({ type: VoucherListResponse })
  async list(@Query() query: ListVouchersQuery): Promise<VoucherListResponse> {
    return this.promotionsService.listVouchers(query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Xem chi tiết mã giảm giá (Admin - UC-10.2)' })
  @ApiOkResponse({ type: VoucherResponse })
  @ApiNotFoundResponse({ description: 'Không tìm thấy mã giảm giá' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<VoucherResponse> {
    return this.promotionsService.getVoucherById(id);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Tạo mới mã giảm giá (Admin - UC-10.2)' })
  @ApiOkResponse({ type: VoucherResponse })
  @ApiConflictResponse({ description: 'Mã giảm giá đã tồn tại' })
  async create(@Body() dto: CreateVoucherDto): Promise<VoucherResponse> {
    return this.promotionsService.createVoucher(dto);
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Cập nhật mã giảm giá (Admin - UC-10.2)' })
  @ApiOkResponse({ type: VoucherResponse })
  @ApiNotFoundResponse({ description: 'Không tìm thấy mã giảm giá' })
  @ApiConflictResponse({ description: 'Xung đột phiên bản (CAS) hoặc mã code đã tồn tại' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVoucherDto,
  ): Promise<VoucherResponse> {
    return this.promotionsService.updateVoucher(id, dto);
  }

  @Delete(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Xóa hoặc chuyển trạng thái ngưng hoạt động của mã giảm giá (Admin - UC-10.2)',
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy mã giảm giá' })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<{ ok: boolean; message: string }> {
    return this.promotionsService.deleteVoucher(id);
  }
}
