import type { ShipmentStatus } from './dto/shipment.dto.js';

export const CARRIER_MODES = ['AUTO', 'GHN', 'MOCK'] as const;
export type CarrierMode = (typeof CARRIER_MODES)[number];

export interface CarrierOrderItem {
  name: string;
  code: string;
  quantity: number;
  weightGrams: number;
  price: number;
}

export interface CreateCarrierShipmentInput {
  orderId: string;
  orderCode: string;
  carrierName: string;
  customTrackingNumber?: string;
  recipientName: string;
  phone: string;
  detailAddress: string;
  commune: string;
  province: string;
  codAmount: number;
  insuranceValue: number;
  items: CarrierOrderItem[];
}

export interface CreateCarrierShipmentResult {
  carrierName: string;
  trackingNumber: string;
  isMock: boolean;
  status?: ShipmentStatus;
  carrierStatus: string;
  statusNote: string;
  expectedDeliveryAt: string | null;
  occurredAt?: string;
}

export interface CarrierStatusEvent {
  trackingNumber: string;
  clientOrderCode?: string;
  status: ShipmentStatus;
  carrierStatus: string;
  note?: string;
  occurredAt?: string;
}

export interface ShippingCarrierGateway {
  readonly code: string;
  configured(): boolean;
  createOrder(input: CreateCarrierShipmentInput): Promise<CreateCarrierShipmentResult>;
  queryOrder?(trackingNumber: string): Promise<CarrierStatusEvent | null>;
  queryOrderByClientCode?(clientOrderCode: string): Promise<CreateCarrierShipmentResult | null>;
}
