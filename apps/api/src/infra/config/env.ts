import { z } from 'zod';

/**
 * Bien moi truong cua may chu, kiem NGAY LUC KHOI DONG.
 * Thieu hay sai thi dung va in dung ten bien, thay vi chay roi loi o mot cho khong lien quan.
 * ConfigModule.forRoot({ validate: validateEnv }) goi ham nay; them bien moi thi them o day
 * va o .env.example trong cung pull request.
 */
// looseObject chu khong phai object: z.object() CAT BO moi khoa khong khai bao, nen
// ConfigService.get('<bien chua khai>') se tra ve undefined du .env co bien do.
// Kiem chung: z.object({A}).parse({A,B}) -> {A}. Dung looseObject de bien la van di qua,
// van kiem chat cac bien da khai. Them bien moi thi van phai khai o day de co kiem va co kieu.
export const envSchema = z
  .looseObject({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    /** Cong do nen tang cap (Render, Azure). Khi co thi uu tien hon API_PORT. */
    PORT: z.coerce.number().int().positive().optional(),
    API_PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z
      .string()
      .min(1, 'thieu chuoi ket noi')
      .refine(
        (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
        'phai bat dau bang postgresql://',
      ),
    /** Cac goc web duoc goi API, cach nhau bang dau phay. Staging dien dung dia chi web cua no. */
    CORS_ORIGINS: z.string().default('http://localhost:5174'),
    /** Bat buoc tu moi truong; khong co default de khong bao gio dua production secret vao ma nguon. */
    JWT_ACCESS_SECRET: z.string().min(32, 'phai dai it nhat 32 ky tu'),
    /** Chuoi thoi luong nguyen duong: 15m, 1h, 30d... */
    JWT_ACCESS_TTL: z
      .string()
      .regex(/^[1-9]\d*[smhd]$/u, 'phai co dang 15m, 1h hoac 30d')
      .default('15m'),
    REFRESH_TOKEN_TTL: z
      .string()
      .regex(/^[1-9]\d*[smhd]$/u, 'phai co dang 15m, 1h hoac 30d')
      .default('30d'),
    /** Dung de tron OTP truoc khi bam HMAC-SHA256; bat buoc, khong co default de khong lo tren prod. */
    OTP_PEPPER: z.string().min(32, 'phai dai it nhat 32 ky tu'),
    /** May chu SMTP gui email xac thuc. Local dung Mailpit (xem docker-compose.yml). */
    SMTP_HOST: z.string().min(1, 'thieu SMTP_HOST'),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .default(false),
    /** Bo trong khi may chu SMTP khong doi xac thuc (Mailpit local). */
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().min(1, 'thieu SMTP_FROM'),
    /**
     * Redis dung chung cho moi ban sao cua API, giu bo dem gioi han toc do. Bat buoc: gioi han
     * dang nhap/OTP la co che bao mat, khong duoc luu trong bo nho tien trinh (moi ban sao mot so dem
     * rieng thi tang ban sao la vo hieu gioi han). Chi kiem dinh dang; ket noi duoc thu luc chay.
     */
    REDIS_URL: z
      .string()
      .min(1, 'thieu REDIS_URL')
      .refine(
        (value) => value.startsWith('redis://') || value.startsWith('rediss://'),
        'phai bat dau bang redis:// hoac rediss://',
      ),
    /** Tron danh tinh (email, userId) truoc khi dung lam khoa Redis va khoa OTP; khong luu email tho. */
    RATE_LIMIT_PEPPER: z.string().min(32, 'phai dai it nhat 32 ky tu'),
    /**
     * So proxy tin cay dung truoc API (0 = khach noi thang, khong tin X-Forwarded-For). Gioi han
     * theo IP dung req.ip nen phai dung: dat sai thi hoac moi nguoi dung chung mot IP cua proxy (bi
     * gioi han lan nhau), hoac ke tan cong gia mao IP bang X-Forwarded-For. Bat buoc khai bao ro o
     * staging/production, xem superRefine ben duoi.
     */
    TRUST_PROXY_HOPS: z
      .string()
      .regex(/^\d{1,2}$/u, 'phai la so nguyen 0-99')
      .transform(Number)
      .optional(),
    APP_VERSION: z.string().default('0.0.0-dev'),
    /** Ma commit dang chay: CI truyen GIT_SHA khi dung image; Render tu cap RENDER_GIT_COMMIT. */
    GIT_SHA: z.string().optional(),
    RENDER_GIT_COMMIT: z.string().optional(),
  })
  .superRefine((env, context) => {
    if (
      (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging') &&
      env.TRUST_PROXY_HOPS === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['TRUST_PROXY_HOPS'],
        message:
          'phai khai bao ro o staging/production (0 neu khong co reverse proxy, 1 neu sau mot proxy tin cay)',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (result.success) return result.data;

  const lines = result.error.issues.map(
    (issue) => `  - ${issue.path.join('.') || '(goc)'}: ${issue.message}`,
  );
  throw new Error(
    `Cau hinh moi truong khong hop le, may chu khong khoi dong:\n${lines.join('\n')}\n` +
      'Chep .env.example thanh .env o goc kho ma roi sua lai.',
  );
}

export const corsOrigins = (value: string): string[] =>
  value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
