import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import {
  AuthGuard,
  CurrentUser,
  type CurrentUserType,
  RequireRoles,
  RoleCode,
} from '../auth/index.js';
import {
  CreateShipmentDto,
  ShipmentResponse,
  UpdateShipmentStatusDto,
} from './dto/shipment.dto.js';
import { ShippingService } from './shipping.service.js';

@ApiTags('admin-shipping')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@RequireRoles(RoleCode.ADMIN)
@Controller('admin/orders')
export class AdminShipmentController {
  constructor(private readonly shippingService: ShippingService) {}

  @Get(':id/shipment')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ShipmentResponse })
  getShipment(@Param('id', ParseUUIDPipe) id: string): Promise<ShipmentResponse> {
    return this.shippingService.getShipment(id);
  }

  @Post(':id/shipment')
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ type: ShipmentResponse })
  createShipment(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateShipmentDto,
  ): Promise<ShipmentResponse> {
    return this.shippingService.createShipment(id, dto, user.id);
  }

  @Patch(':id/shipment/status')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ShipmentResponse })
  updateShipmentStatus(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShipmentStatusDto,
  ): Promise<ShipmentResponse> {
    return this.shippingService.updateShipmentStatus(id, dto.status, user.id, dto.note);
  }
}
