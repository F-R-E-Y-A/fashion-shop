export interface RateLimitResult {
  /** true khi lan dem nay van nam trong gioi han. */
  allowed: boolean;
  /** So lan da dem trong cua so hien tai, KE CA lan nay. */
  count: number;
  limit: number;
  /** Bao lau nua cua so het, tinh bang giay (>= 1); dung cho header Retry-After khi bi chan. */
  retryAfterSeconds: number;
}

/**
 * Bo dem cua so co dinh, dung chung cho moi ban sao cua API. Cua "infra": khong biet danh tinh,
 * tinh nang hay chinh sach mo/chan; noi goi truyen khoa da bam va tu quyet dinh khi kho bi loi
 * (implementation nem loi thay vi tu nuot loi).
 */
export abstract class RateLimiter {
  /**
   * Dem NGUYEN TU mot lan vao `key` roi tra ket qua. Dem truoc, kiem sau (khong "doc roi ghi"), nen
   * N request song song chi co dung `limit` request dau duoc `allowed`, khong request nao lot qua
   * khe giua luc doc va luc ghi.
   */
  abstract consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;

  /** Xoa bo dem, vd khi dang nhap thanh cong. */
  abstract reset(key: string): Promise<void>;
}
