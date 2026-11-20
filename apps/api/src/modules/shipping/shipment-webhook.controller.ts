import { timingSafeEqual } from 'node:crypto';

import {
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Optional,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { Env } from '../../infra/config/env.js';
import { ShipmentWebhookDto } from './dto/shipment.dto.js';
import { ShippingService } from './shipping.service.js';

@ApiTags('shipping-webhook')
@Controller('shipping')
export class ShipmentWebhookController {
  constructor(
    private readonly shippingService: ShippingService,
    @Optional() private readonly config?: ConfigService<Env, true>,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Webhook nhận cập nhật trạng thái vận chuyển từ hãng (chuẩn nội bộ / dự phòng)',
    description:
      'Yêu cầu xác thực chữ ký/token của hãng vận chuyển qua header x-carrier-token để đảm bảo an toàn.',
  })
  @ApiHeader({
    name: 'x-carrier-token',
    description: 'Mã token bí mật xác thực nguồn gửi của đối tác vận chuyển',
    required: true,
  })
  @ApiOkResponse({ description: 'Đã nhận và xử lý sự kiện webhook hợp lệ' })
  @ApiUnauthorizedResponse({ description: 'Token xác thực nguồn gửi không hợp lệ hoặc bị thiếu' })
  async handleWebhook(
    @Headers('x-carrier-token') carrierToken: string | undefined,
    @Body() payload: ShipmentWebhookDto,
  ) {
    this.verifyToken(carrierToken);
    return this.shippingService.handleWebhook(payload);
  }

  @Post('webhook/ghn')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Webhook nhận Order Status Callback trực tiếp từ Giao Hàng Nhanh (GHN)',
    description:
      'Nhận payload chuẩn của GHN (OrderCode, ClientOrderCode, Status, Reason, Description) và xác thực token qua header x-carrier-token, token hoặc query ?token=.',
  })
  @ApiOkResponse({ description: 'Đã nhận và đối soát sự kiện từ GHN' })
  @ApiUnauthorizedResponse({ description: 'Token xác thực nguồn gửi không hợp lệ hoặc bị thiếu' })
  async handleGhnWebhook(
    @Headers('x-carrier-token') carrierToken: string | undefined,
    @Headers('token') altToken: string | undefined,
    @Query('token') queryToken: string | undefined,
    @Body() rawPayload: Record<string, unknown>,
  ) {
    this.verifyToken(carrierToken || altToken || queryToken);
    return this.shippingService.handleGhnWebhook(rawPayload);
  }

  private verifyToken(incomingToken: string | undefined) {
    const expectedSecret =
      this.config?.get('SHIPPING_WEBHOOK_SECRET', { infer: true }) ||
      process.env.SHIPPING_WEBHOOK_SECRET;

    if (!expectedSecret || !incomingToken) {
      throw new UnauthorizedException(
        'Xác thực webhook thất bại: Thiếu hoặc sai token xác thực của hãng vận chuyển.',
      );
    }

    const expectedBuf = Buffer.from(expectedSecret, 'utf8');
    const incomingBuf = Buffer.from(incomingToken, 'utf8');
    if (expectedBuf.length !== incomingBuf.length || !timingSafeEqual(expectedBuf, incomingBuf)) {
      throw new UnauthorizedException(
        'Xác thực webhook thất bại: Thiếu hoặc sai token xác thực của hãng vận chuyển.',
      );
    }
  }
}
