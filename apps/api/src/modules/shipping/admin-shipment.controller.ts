import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser, type CurrentUserType, RequireRoles, RoleCode } from '../auth/index.js';
import {
  CarrierConfigResponse,
  CreateShipmentDto,
  ShipmentResponse,
  UpdateShipmentStatusDto,
} from './dto/shipment.dto.js';
import { ShippingService } from './shipping.service.js';

@ApiTags('admin-shipping')
@ApiBearerAuth()
@RequireRoles(RoleCode.ADMIN)
@Controller('admin/orders')
export class AdminShipmentController {
  constructor(private readonly shippingService: ShippingService) {}

  @Get('shipping/config')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Kiểm tra cấu hình kết nối GHN Sandbox và chế độ dự phòng' })
  @ApiOkResponse({ type: CarrierConfigResponse })
  getCarrierConfig(): CarrierConfigResponse {
    return this.shippingService.getCarrierConfig();
  }

  @Get(':id/shipment')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Xem thông tin vận đơn của đơn hàng' })
  @ApiOkResponse({ type: ShipmentResponse })
  getShipment(@Param('id', ParseUUIDPipe) id: string): Promise<ShipmentResponse> {
    return this.shippingService.getShipment(id);
  }

  @Post(':id/shipment')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Tạo vận đơn (ưu tiên GHN Sandbox nếu cấu hình, dự phòng mô phỏng)' })
  @ApiCreatedResponse({ type: ShipmentResponse })
  createShipment(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateShipmentDto,
  ): Promise<ShipmentResponse> {
    return this.shippingService.createShipment(id, dto, user.id);
  }

  @Post(':id/shipment/sync')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Đồng bộ trực tiếp trạng thái vận đơn thật từ GHN Sandbox' })
  @ApiOkResponse({ type: ShipmentResponse })
  syncShipment(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShipmentResponse> {
    return this.shippingService.syncShipmentFromCarrier(id, user.id);
  }

  @Patch(':id/shipment/status')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Cập nhật trạng thái vận đơn (dùng cho chế độ mô phỏng / dự phòng)' })
  @ApiOkResponse({ type: ShipmentResponse })
  updateShipmentStatus(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShipmentStatusDto,
  ): Promise<ShipmentResponse> {
    return this.shippingService.updateShipmentStatus(id, dto.status, user.id, dto.note, {
      manualSimulation: true,
    });
  }
}
