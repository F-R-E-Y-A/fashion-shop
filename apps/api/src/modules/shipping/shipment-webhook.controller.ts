import { Body, Controller, Header, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

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
  })
  @ApiOkResponse({ description: 'Đã nhận và xử lý sự kiện webhook' })
  async handleWebhook(@Body() payload: ShipmentWebhookDto) {
    return this.shippingService.handleWebhook(payload);
  }
}
