import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, type CurrentUserType } from '../auth/index.js';
import { PromotionResponse } from './dto/promotion.dto.js';
import { ValidateVoucherDto } from './dto/validate-voucher.dto.js';
import { VoucherApplyResult, VoucherResponse } from './dto/voucher.response.js';
import { OptionalAuthGuard } from './optional-auth.guard.js';
import { PromotionsService } from './promotions.service.js';

@ApiTags('promotions')
@Controller('promotions')
@UseGuards(OptionalAuthGuard)
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Post('vouchers/apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Kiểm tra và áp dụng mã giảm giá cho giỏ hàng / đơn hàng (UC-07.2)',
    description:
      'Xác thực mã voucher, kiểm tra hạn mức, thời gian hiệu lực và tính toán số tiền thực tế được giảm.',
  })
  @ApiOkResponse({ type: VoucherApplyResult })
  async applyVoucher(
    @Body() dto: ValidateVoucherDto,
    @CurrentUser() user?: CurrentUserType,
  ): Promise<VoucherApplyResult> {
    return this.promotionsService.validateVoucher(dto.code, dto.subtotal, user?.id);
  }

  @Get('vouchers/available')
  @ApiOperation({
    summary: 'Danh sách các mã giảm giá đang hoạt động dành cho khách hàng',
    description: 'Trả về các mã voucher hợp lệ để người dùng có thể tham khảo và áp dụng nhanh.',
  })
  @ApiOkResponse({ type: [VoucherResponse] })
  async getAvailableVouchers(): Promise<VoucherResponse[]> {
    return this.promotionsService.getAvailableVouchers();
  }

  @Get('active')
  @ApiOperation({
    summary: 'Danh sách các chương trình khuyến mãi tự động đang hoạt động (UC-10.1)',
    description: 'Phục vụ hiển thị banner khuyến mãi, thông báo ưu đãi trên trang chủ và danh mục.',
  })
  @ApiOkResponse({ type: [PromotionResponse] })
  async getActivePromotions(): Promise<PromotionResponse[]> {
    return this.promotionsService.getActivePromotions();
  }
}
