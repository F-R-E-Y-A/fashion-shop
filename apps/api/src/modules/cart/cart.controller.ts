import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';

import { CartService } from './cart.service.js';
import { AddToCartDto, UpdateCartItemDto } from './dto/cart.dto.js';
import { CartResponse } from './dto/cart.response.js';

/**
 * Dinh danh gio hang truyen qua header:
 * - x-user-id: UUID nguoi dung (khi da dang nhap)
 * - x-guest-token: UUID ngau nhien (khi chua dang nhap, luu trong cookie phia frontend)
 *
 * Sprint 2 chua co auth middleware nen dung header thu cong.
 * Sprint 3 se doi sang lay tu JWT token.
 */
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(
    @Headers('x-user-id') userId?: string,
    @Headers('x-guest-token') guestToken?: string,
  ): Promise<CartResponse> {
    return this.cartService.getCart(userId, guestToken);
  }

  @Post('items')
  addItem(
    @Body() dto: AddToCartDto,
    @Headers('x-user-id') userId?: string,
    @Headers('x-guest-token') guestToken?: string,
  ): Promise<CartResponse> {
    return this.cartService.addItem(dto.variantId, dto.quantity, userId, guestToken);
  }

  @Patch('items/:variantId')
  updateItem(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateCartItemDto,
    @Headers('x-user-id') userId?: string,
    @Headers('x-guest-token') guestToken?: string,
  ): Promise<CartResponse> {
    return this.cartService.updateItem(variantId, dto.quantity, userId, guestToken);
  }

  @Delete('items/:variantId')
  removeItem(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Headers('x-user-id') userId?: string,
    @Headers('x-guest-token') guestToken?: string,
  ): Promise<CartResponse> {
    return this.cartService.removeItem(variantId, userId, guestToken);
  }

  @Delete()
  async clearCart(
    @Headers('x-user-id') userId?: string,
    @Headers('x-guest-token') guestToken?: string,
  ): Promise<{ ok: boolean }> {
    await this.cartService.clearCart(userId, guestToken);
    return { ok: true };
  }

  @Post('merge')
  mergeCarts(
    @Headers('x-guest-token') guestToken: string,
    @Headers('x-user-id') userId: string,
  ): Promise<CartResponse> {
    return this.cartService.mergeCarts(guestToken, userId);
  }
}
