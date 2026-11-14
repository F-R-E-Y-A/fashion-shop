import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard, CurrentUser, type CurrentUserType } from '../auth/index.js';
import { CartService } from './cart.service.js';
import { AddToCartDto, UpdateCartItemDto } from './dto/cart.dto.js';
import { CartResponse } from './dto/cart.response.js';
import { OptionalAuthGuard } from './optional-auth.guard.js';

/**
 * Quan ly gio hang:
 * - Nguoi dung da dang nhap: tu dong nhan dien qua JWT Bearer token va decorator @CurrentUser().
 * - Khach vang lai chua dang nhap: nhan dien qua header x-guest-token (UUID luu o phia client).
 * - Client khong the tu gui hay gia mao user_id qua header nua (dam bao bao mat).
 */
@Controller('cart')
@UseGuards(OptionalAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(
    @CurrentUser() user?: CurrentUserType,
    @Headers('x-guest-token') guestToken?: string,
  ): Promise<CartResponse> {
    return this.cartService.getCart(user?.id, guestToken);
  }

  @Post('items')
  addItem(
    @Body() dto: AddToCartDto,
    @CurrentUser() user?: CurrentUserType,
    @Headers('x-guest-token') guestToken?: string,
  ): Promise<CartResponse> {
    return this.cartService.addItem(dto.variantId, dto.quantity, user?.id, guestToken);
  }

  @Patch('items/:variantId')
  updateItem(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateCartItemDto,
    @CurrentUser() user?: CurrentUserType,
    @Headers('x-guest-token') guestToken?: string,
  ): Promise<CartResponse> {
    if (dto.toVariantId !== undefined) {
      if (dto.quantity !== undefined || dto.isSelected !== undefined) {
        throw new BadRequestException('Đổi phân loại không đi kèm số lượng hay trạng thái chọn.');
      }
      return this.cartService.switchVariant(variantId, dto.toVariantId, user?.id, guestToken);
    }
    return this.cartService.updateItem(
      variantId,
      dto.quantity,
      user?.id,
      guestToken,
      dto.isSelected,
    );
  }

  @Delete('items/:variantId')
  removeItem(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @CurrentUser() user?: CurrentUserType,
    @Headers('x-guest-token') guestToken?: string,
  ): Promise<CartResponse> {
    return this.cartService.removeItem(variantId, user?.id, guestToken);
  }

  @Delete()
  async clearCart(
    @CurrentUser() user?: CurrentUserType,
    @Headers('x-guest-token') guestToken?: string,
  ): Promise<{ ok: boolean }> {
    await this.cartService.clearCart(user?.id, guestToken);
    return { ok: true };
  }

  @Post('merge')
  @UseGuards(AuthGuard)
  mergeCarts(
    @Headers('x-guest-token') guestToken: string,
    @CurrentUser() user: CurrentUserType,
  ): Promise<CartResponse> {
    return this.cartService.mergeCarts(guestToken, user.id);
  }
}
