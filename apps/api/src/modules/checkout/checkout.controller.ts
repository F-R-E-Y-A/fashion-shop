import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
import { CheckoutService } from './checkout.service.js';
import {
  AdminOrderPageResponse,
  AdminOrderResponse,
  CancelRefundDto,
  DeliveryFailedDto,
  ListAdminOrdersQuery,
} from './dto/admin-orders.dto.js';
import {
  CreateCheckoutDto,
  PreviewDto,
  ReconcileDto,
  RefundDto,
  ResolveRefundDto,
  RetryPaymentDto,
} from './dto/checkout.dto.js';
import { IpnResponse, OrderResponse, QuoteResponse } from './dto/checkout.response.js';
import { OrderAdminService } from './order-admin.service.js';
import { SettlementService } from './settlement.service.js';

@ApiTags('checkout')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}
  @ApiCreatedResponse({ type: QuoteResponse })
  @Post('preview')
  @Header('Cache-Control', 'no-store')
  preview(@CurrentUser() user: CurrentUserType, @Body() input: PreviewDto) {
    return this.checkout.preview(user.id, input.addressId);
  }
  @ApiCreatedResponse({ type: OrderResponse })
  @Post('orders')
  @Header('Cache-Control', 'no-store')
  create(@CurrentUser() user: CurrentUserType, @Body() input: CreateCheckoutDto, @Ip() ip: string) {
    return this.checkout.create(user, input, ip);
  }
}

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly settlement: SettlementService,
  ) {}
  @ApiOkResponse({ type: [OrderResponse] })
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@CurrentUser() user: CurrentUserType) {
    return (await this.checkout.orders.list(user.id)).map((order) => this.checkout.view(order));
  }
  @ApiOkResponse({ type: OrderResponse })
  @Get('by-payment/:reference')
  @Header('Cache-Control', 'no-store')
  async byPayment(@CurrentUser() user: CurrentUserType, @Param('reference') reference: string) {
    const payment = await this.checkout.payments.byReference(reference);
    return this.checkout.view(
      await this.checkout.orders.get(
        payment?.orderId ?? '00000000-0000-4000-8000-000000000000',
        user.id,
      ),
    );
  }
  @ApiOkResponse({ type: OrderResponse })
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async get(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.checkout.view(await this.checkout.orders.get(id, user.id));
  }
  @ApiCreatedResponse({ type: OrderResponse })
  @Post(':id/cancel')
  @Header('Cache-Control', 'no-store')
  cancel(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.checkout.cancel(id, user.id);
  }
  @ApiCreatedResponse({ type: OrderResponse })
  @Post(':id/payments')
  @Header('Cache-Control', 'no-store')
  retry(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: RetryPaymentDto,
    @Ip() ip: string,
  ) {
    return this.checkout.retry(id, user.id, input.idempotencyKey, ip);
  }
  @ApiCreatedResponse({ type: OrderResponse })
  @Post(':id/reconcile')
  @Header('Cache-Control', 'no-store')
  async reconcile(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() notice: ReconcileDto = {},
  ) {
    const order = await this.checkout.orders.get(id, user.id);
    for (const payment of order.payments)
      if (payment.reference) {
        const concluded = notice.params
          ? await this.settlement.returnNotice(payment.reference, notice.params)
          : false;
        if (!concluded) await this.settlement.reconcile(payment.reference);
      }
    return this.checkout.view(await this.checkout.orders.get(id, user.id));
  }
}

@ApiTags('payments')
@Controller('payments/vnpay')
export class VnpayController {
  constructor(private readonly settlement: SettlementService) {}
  @ApiOkResponse({ type: IpnResponse })
  @Get('ipn')
  @Header('Cache-Control', 'no-store')
  ipn(@Query() query: Record<string, unknown>) {
    return this.settlement.ipn(query);
  }
}

@ApiTags('payments')
@Controller('payments/momo')
export class MomoController {
  constructor(private readonly settlement: SettlementService) {}
  @Post('ipn')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async ipn(@Body() body: Record<string, unknown>) {
    await this.settlement.momoIpn(body);
  }
}

/** Hoan tien la thao tac van hanh: chi ADMIN, ghi day vung payment_transactions. */
@ApiTags('admin-payments')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@RequireRoles(RoleCode.ADMIN)
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly checkout: CheckoutService) {}
  @ApiCreatedResponse({ type: OrderResponse })
  @Post(':id/refund')
  @Header('Cache-Control', 'no-store')
  refund(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: RefundDto,
  ) {
    return this.checkout.refundPayment(id, user.id, input);
  }
  @ApiCreatedResponse({ type: OrderResponse })
  @Post(':id/refund/resolve')
  @Header('Cache-Control', 'no-store')
  resolveRefund(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ResolveRefundDto,
  ) {
    return this.checkout.resolveRefund(id, user.id, input);
  }
}

/** Man quan tri don hang (ADR-038): danh sach moi khach va cac buoc shop bam tay. */
@ApiTags('admin-orders')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@RequireRoles(RoleCode.ADMIN)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly admin: OrderAdminService) {}
  @ApiOkResponse({ type: AdminOrderPageResponse })
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: ListAdminOrdersQuery) {
    return this.admin.list({
      statuses: query.status,
      attention: query.attention,
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
    });
  }
  @ApiOkResponse({ type: AdminOrderResponse })
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.detail(id);
  }
  @ApiCreatedResponse({ type: AdminOrderResponse })
  @Post(':id/confirm-cod')
  @Header('Cache-Control', 'no-store')
  confirmCod(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.confirmCod(id, user.id);
  }
  @ApiCreatedResponse({ type: AdminOrderResponse })
  @Post(':id/start-processing')
  @Header('Cache-Control', 'no-store')
  startProcessing(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.startProcessing(id, user.id);
  }
  @ApiCreatedResponse({ type: AdminOrderResponse })
  @Post(':id/cancel-refund')
  @Header('Cache-Control', 'no-store')
  cancelRefund(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CancelRefundDto,
  ) {
    return this.admin.cancelRefund(id, user.id, input.reason);
  }
  @ApiCreatedResponse({ type: AdminOrderResponse })
  @Post(':id/delivered')
  @Header('Cache-Control', 'no-store')
  delivered(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.markDelivered(id, user.id);
  }
  @ApiCreatedResponse({ type: AdminOrderResponse })
  @Post(':id/delivery-failed')
  @Header('Cache-Control', 'no-store')
  deliveryFailed(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: DeliveryFailedDto,
  ) {
    return this.admin.deliveryFailed(id, user.id, input.reason);
  }
}
