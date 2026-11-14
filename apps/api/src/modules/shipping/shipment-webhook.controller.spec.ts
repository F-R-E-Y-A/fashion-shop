import { UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShipmentWebhookController } from './shipment-webhook.controller.js';
import type { ShippingService } from './shipping.service.js';

describe('ShipmentWebhookController', () => {
  const originalSecret = process.env.SHIPPING_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.SHIPPING_WEBHOOK_SECRET = 'freya-test-carrier-secret';
  });

  afterEach(() => {
    if (originalSecret !== undefined) {
      process.env.SHIPPING_WEBHOOK_SECRET = originalSecret;
    } else {
      delete process.env.SHIPPING_WEBHOOK_SECRET;
    }
  });

  it('từ chối khi máy chủ chưa cấu hình biến môi trường SHIPPING_WEBHOOK_SECRET', async () => {
    delete process.env.SHIPPING_WEBHOOK_SECRET;

    const mockShippingService = {
      handleWebhook: vi.fn(),
    } as unknown as ShippingService;

    const controller = new ShipmentWebhookController(mockShippingService);

    await expect(
      controller.handleWebhook('freya-test-carrier-secret', {
        orderId: '00000000-0000-0000-0000-000000000001',
        status: 'IN_TRANSIT',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockShippingService.handleWebhook).not.toHaveBeenCalled();
  });

  it('từ chối khi thiếu header x-carrier-token', async () => {
    const mockShippingService = {
      handleWebhook: vi.fn(),
    } as unknown as ShippingService;

    const controller = new ShipmentWebhookController(mockShippingService);

    await expect(
      controller.handleWebhook(undefined, {
        orderId: '00000000-0000-0000-0000-000000000001',
        status: 'IN_TRANSIT',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockShippingService.handleWebhook).not.toHaveBeenCalled();
  });

  it('từ chối khi x-carrier-token sai secret', async () => {
    const mockShippingService = {
      handleWebhook: vi.fn(),
    } as unknown as ShippingService;

    const controller = new ShipmentWebhookController(mockShippingService);

    await expect(
      controller.handleWebhook('wrong-token', {
        orderId: '00000000-0000-0000-0000-000000000001',
        status: 'IN_TRANSIT',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockShippingService.handleWebhook).not.toHaveBeenCalled();
  });

  it('cho phép xử lý khi x-carrier-token đúng secret từ biến môi trường', async () => {
    const mockShippingService = {
      handleWebhook: vi.fn().mockResolvedValue({
        received: true,
        processed: true,
        orderId: '00000000-0000-0000-0000-000000000001',
        status: 'IN_TRANSIT',
      }),
    } as unknown as ShippingService;

    const controller = new ShipmentWebhookController(mockShippingService);

    const payload = {
      orderId: '00000000-0000-0000-0000-000000000001',
      status: 'IN_TRANSIT' as const,
    };

    const res = await controller.handleWebhook('freya-test-carrier-secret', payload);

    expect(res).toEqual({
      received: true,
      processed: true,
      orderId: '00000000-0000-0000-0000-000000000001',
      status: 'IN_TRANSIT',
    });
    expect(mockShippingService.handleWebhook).toHaveBeenCalledWith(payload);
  });
});
