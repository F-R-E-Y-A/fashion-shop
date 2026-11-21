import { Injectable } from '@nestjs/common';

import type {
  CreateCarrierShipmentInput,
  CreateCarrierShipmentResult,
  ShippingCarrierGateway,
} from './shipping-carrier.js';

@Injectable()
export class MockCarrierGateway implements ShippingCarrierGateway {
  readonly code = 'MOCK';

  configured(): boolean {
    return true;
  }

  createOrder(input: CreateCarrierShipmentInput): Promise<CreateCarrierShipmentResult> {
    const carrierName = input.carrierName.trim() || 'GHN';
    const trackingNumber =
      input.customTrackingNumber?.trim() ||
      `${carrierName.toUpperCase()}-SBX-${input.orderCode.replace(/^FR/, '')}`;

    return Promise.resolve({
      carrierName,
      trackingNumber,
      isMock: true,
      carrierStatus: 'mock_ready_to_pick',
      statusNote: 'Vận đơn mô phỏng Sandbox nội bộ.',
      expectedDeliveryAt: null,
    });
  }
}
