import {
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ShipmentWebhookDto } from './dto/shipment.dto.js';
import { ShippingService } from './shipping.service.js';

@ApiTags('shipping-webhook')
@Controller('shipping')
export class ShipmentWebhookController {
  constructor(private readonly shippingService: ShippingService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Webhook nhận cập nhật trạng thái vận chuyển từ hãng (GHN, GHTK, Viettel Post)',
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
    const expectedSecret = process.env.SHIPPING_WEBHOOK_SECRET;

    if (!expectedSecret || !carrierToken || carrierToken !== expectedSecret) {
      throw new UnauthorizedException(
        'Xác thực webhook thất bại: Thiếu hoặc sai header x-carrier-token của hãng vận chuyển.',
      );
    }

    return this.shippingService.handleWebhook(payload);
  }
}
