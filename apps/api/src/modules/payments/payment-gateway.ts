export const gatewayCodes = ['VNPAY', 'MOMO', 'MOMO_ATM', 'COD'] as const;
export type GatewayCode = (typeof gatewayCodes)[number];
export type GatewayRequest = Record<string, string | number | boolean>;
export interface PaymentInput {
  reference: string;
  amount: string;
  expiresAt: Date;
  ip: string;
}
export interface PaymentEvent {
  gateway: GatewayCode;
  reference: string;
  state: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  receipt: string;
  raw: Record<string, string>;
}
export interface RefundRequest {
  reference: string;
  checkoutUrl: string;
  amount: string;
  actor: string;
}
export interface PaymentGateway {
  readonly code: GatewayCode;
  readonly label: string;
  readonly queryIntervalMs: number;
  configured(): boolean;
  /** Chuan bi local trong transaction; null nghia la can goi mang sau commit. */
  prepare(input: PaymentInput): string | null;
  request?(input: PaymentInput): GatewayRequest;
  createRemote(input: PaymentInput, request?: GatewayRequest): Promise<string>;
  notification(raw: Record<string, unknown>): PaymentEvent | null;
  matches(event: PaymentEvent, reference: string, amount: string): boolean;
  query(reference: string, checkoutUrl: string | null): Promise<PaymentEvent | null>;
  /** Hoan tien phia cong; tung adapter tu quyet dinh ho tro hay khong (VNPAY Refund API). */
  refund?(input: RefundRequest): Promise<{ requestId: string; payload: Record<string, string> }>;
}
