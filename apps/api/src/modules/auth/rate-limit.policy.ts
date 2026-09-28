export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

/**
 * Khi kho dem (Redis) loi:
 *  - ALLOW (mo): cho request di tiep, chi ghi log. Dung khi co chot chan doc lap khac, hoac khi viec
 *    chan ca tinh nang do su co ha tang gay hai hon ke tan cong.
 *  - DENY (chan): tra 503. Dung cho endpoint gui email den DIA CHI CUA NGUOI KHAC ma khong co ranh
 *    gioi nao khac giua cac danh tinh: mo cua luc Redis chet la mo cua cho spam/mail-bombing.
 */
export type OnStoreError = 'ALLOW' | 'DENY';

export interface EndpointRateLimit {
  /** Gioi han theo danh tinh da chuan hoa + bam (email, userId). */
  identity?: RateLimitRule;
  /** Gioi han theo IP khach (req.ip, da bam). */
  ip?: RateLimitRule;
  onStoreError: OnStoreError;
}

const FIFTEEN_MINUTES = 15 * 60;
const ONE_HOUR = 60 * 60;

/**
 * MOT cho duy nhat khai bao con so gioi han. Ly do tung muc: docs/features/auth/LOG.md (ADR-013).
 * Cac chot chan khac van con nguyen, KHONG bi thay the boi bang nay: toi da 5 lan nhap sai tren moi
 * OTP (bang otp_codes), cooldown 60 giay cua OTP, va phat hien replay refresh token.
 */
export const RATE_LIMIT_POLICY = {
  /** Dem MOI lan thu (dem truoc, thanh cong thi xoa) nen thuc chat la "5 lan sai / 15 phut". */
  LOGIN: {
    identity: { limit: 5, windowSeconds: FIFTEEN_MINUTES },
    ip: { limit: 50, windowSeconds: FIFTEEN_MINUTES },
    // Chan luc Redis chet = khong ai dang nhap duoc; bcrypt da la mot lop lam cham co san.
    onStoreError: 'ALLOW',
  },
  REGISTER: {
    ip: { limit: 10, windowSeconds: ONE_HOUR },
    // Moi lan dang ky gui mot email den dia chi tuy y; khong co gioi han nao khac giua cac danh tinh.
    onStoreError: 'DENY',
  },
  RESEND_VERIFICATION: {
    identity: { limit: 3, windowSeconds: FIFTEEN_MINUTES },
    ip: { limit: 30, windowSeconds: FIFTEEN_MINUTES },
    onStoreError: 'DENY',
  },
  FORGOT_PASSWORD: {
    identity: { limit: 3, windowSeconds: FIFTEEN_MINUTES },
    ip: { limit: 30, windowSeconds: FIFTEEN_MINUTES },
    onStoreError: 'DENY',
  },
  // Chi la tran khoi luong theo IP: chan chinh la 5 lan sai tren moi OTP trong Postgres.
  VERIFY_EMAIL: { ip: { limit: 30, windowSeconds: FIFTEEN_MINUTES }, onStoreError: 'ALLOW' },
  RESET_PASSWORD: { ip: { limit: 30, windowSeconds: FIFTEEN_MINUTES }, onStoreError: 'ALLOW' },
  // Danh tinh la userId cua nguoi da xac thuc; can token hop le moi toi duoc day.
  CHANGE_PASSWORD: {
    identity: { limit: 5, windowSeconds: FIFTEEN_MINUTES },
    onStoreError: 'ALLOW',
  },
} as const satisfies Record<string, EndpointRateLimit>;

export type RateLimitedEndpoint = keyof typeof RATE_LIMIT_POLICY;
