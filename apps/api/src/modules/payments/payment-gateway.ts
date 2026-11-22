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
  /** Hoan dung toan bo so tien da thu, lan dau: VNPAY 02; con lai la 03. */
  full: boolean;
  /** Ma giao dich cua cong luc thu tien (VNPAY vnp_TransactionNo, MoMo transId), neu da ghi nhan. */
  transactionNo?: string;
  /**
   * Ma lenh hoan ben cong, da ghi vao intent TRUOC khi goi (MoMo orderId/requestId). Cong co
   * refundStatus bat buoc nhan ma nay de tra lai lenh khi refund timeout hay tra ma chua ro.
   */
  refundId?: string;
}
/** Ket qua tra lenh hoan: chi SUCCEEDED moi duoc ghi so; con lai admin doi chieu roi chot tay. */
export type RefundStatus =
  | { state: 'SUCCEEDED'; payload: Record<string, string> }
  | { state: 'UNCONFIRMED'; detail: string };
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
  /** Hoan tien phia cong; tung adapter tu quyet dinh ho tro hay khong (VNPAY, MoMo Refund API). */
  refund?(input: RefundRequest): Promise<{ requestId: string; payload: Record<string, string> }>;
  /** Tra lenh hoan theo refundId da gui (MoMo /refund/query); khong co thi admin chot tay. */
  refundStatus?(input: { refundId: string; amount: string }): Promise<RefundStatus>;
}
