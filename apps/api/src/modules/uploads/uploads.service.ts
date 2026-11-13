import { createHmac } from 'node:crypto';

import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Prisma } from '../../generated/prisma/client.js';
import type { Env } from '../../infra/config/env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RateLimiter, type RateLimitResult } from '../../infra/rate-limit/rate-limiter.js';
import {
  IMAGE_FORMATS,
  IMAGE_MAX_BYTES,
  ImageStorage,
  type StoredImage,
} from '../../infra/storage/image-storage.js';
import type {
  UploadConfigResponse,
  UploadPurpose,
  UploadTicketResponse,
} from './dto/upload.dto.js';

/** Moi nguoi mot thu muc: khoa cua nguoi khac khong bao gio qua duoc buoc kiem tien to. */
export const REVIEW_MEDIA_ROOT = 'freya/reviews';
/** Phieu moi gio moi tai khoan: mot danh gia toi da 5 anh, du cho vai lan thu lai. */
const TICKETS_PER_HOUR = 30;
/** Cloudinary bao JPEG la jpg; nhan ca jpeg cho kho khac. */
const ACCEPTED_FORMATS = new Set<string>([...IMAGE_FORMATS, 'jpeg']);

export interface ResolvedMedia {
  key: string;
  url: string;
  thumbnailUrl: string;
}

/**
 * Cap phieu tai anh va kiem anh truoc khi phan he khac gan vao du lieu (ADR-055). Phan he goi
 * (reviews) chi nhan URL da kiem, khong tu tin khoa do trinh duyet gui len. Moi anh chua gan nam
 * trong so `media_uploads` (ADR-056) de MediaCleanupService don theo lo.
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ImageStorage,
    private readonly limiter: RateLimiter,
    private readonly config: ConfigService<Env, true>,
  ) {}

  get enabled(): boolean {
    return this.storage.enabled;
  }

  uploadConfig(): UploadConfigResponse {
    return {
      enabled: this.storage.enabled,
      maxBytes: IMAGE_MAX_BYTES,
      formats: [...IMAGE_FORMATS],
    };
  }

  /** Moi muc dich mot thu muc goc; them muc dich moi (anh san pham) thi them nhanh o day. */
  async ticket(userId: string, purpose: UploadPurpose): Promise<UploadTicketResponse> {
    this.assertEnabled();
    await this.enforceRate(userId);
    const root = { review: REVIEW_MEDIA_ROOT }[purpose];
    const ticket = this.storage.createUploadTicket(`${root}/${userId}`);
    // Ghi so truoc khi tra phieu: anh nao len kho bang phieu nay cung co dong de don neu bi bo.
    await this.prisma.mediaUpload.create({ data: { storageKey: ticket.key, ownerId: userId } });
    return { ...ticket, maxBytes: IMAGE_MAX_BYTES, formats: [...IMAGE_FORMATS] };
  }

  /**
   * Kiem moi khoa: dung thu muc cua nguoi nay, da co tren kho, dung dinh dang va co. Kiem tien to cho
   * ca lo truoc, roi hoi kho SONG SONG: N anh mot luot cho thay vi N luot noi tiep. So lenh Admin API
   * khong doi (mot lenh mot anh), chi giam thoi gian cho. Anh sai dinh dang hay qua co vao hang xoa.
   */
  async resolveReviewMedia(userId: string, keys: readonly string[]): Promise<ResolvedMedia[]> {
    if (keys.length === 0) return [];
    this.assertEnabled();
    if (new Set(keys).size !== keys.length) throw invalidMedia('Một ảnh bị gửi hai lần.');
    const prefix = `${REVIEW_MEDIA_ROOT}/${userId}/`;
    if (keys.some((key) => !key.startsWith(prefix) || key.length === prefix.length)) {
      throw invalidMedia('Ảnh không thuộc phiên tải lên của bạn.');
    }
    const images = await Promise.all(keys.map((key) => this.inspect(key)));
    if (images.some((image) => image === null)) {
      throw invalidMedia('Ảnh chưa tải lên xong hoặc đã bị xoá.');
    }
    const rejected = keys.filter((_, index) => {
      const image = images[index]!;
      return !ACCEPTED_FORMATS.has(image.format) || image.bytes > IMAGE_MAX_BYTES;
    });
    if (rejected.length > 0) {
      await this.queueRemoval(this.prisma, userId, rejected);
      throw invalidMedia('Ảnh phải là JPG, PNG hoặc WebP và không quá 5 MB.');
    }
    return keys.map((key) => ({
      key,
      url: this.storage.deliveryUrl(key),
      thumbnailUrl: this.storage.thumbnailUrl(key),
    }));
  }

  /**
   * Goi TRONG giao dich cua phan he gan anh: lay dong PENDING cua tung khoa bang mot lenh DELETE co
   * dieu kien. Worker da nhan dong (DELETING) hay da don thi thieu dong, 422 va giao dich rollback:
   * khong bao gio gan anh dang bi xoa.
   */
  async attach(
    userId: string,
    keys: readonly string[],
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    if (keys.length === 0) return;
    const taken = await transaction.mediaUpload.deleteMany({
      where: { storageKey: { in: [...keys] }, ownerId: userId, status: 'PENDING' },
    });
    if (taken.count !== keys.length) {
      throw invalidMedia('Ảnh đã quá hạn hoặc đang được dọn, hãy tải lại ảnh.');
    }
  }

  /** Goi TRONG giao dich: anh go khoi du lieu vao hang xoa; rollback thi khong anh nao bi xoa nham. */
  async release(
    userId: string,
    keys: readonly string[],
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    await this.queueRemoval(transaction, userId, keys);
  }

  /** Dong PENDING doi sang DISCARDED; khoa chua co dong (anh gan truoc khi co so) thi them dong. */
  private async queueRemoval(
    client: Prisma.TransactionClient,
    userId: string,
    keys: readonly string[],
  ): Promise<void> {
    if (keys.length === 0) return;
    await client.mediaUpload.updateMany({
      where: { storageKey: { in: [...keys] }, status: 'PENDING' },
      data: { status: 'DISCARDED' },
    });
    await client.mediaUpload.createMany({
      data: keys.map((storageKey) => ({
        storageKey,
        ownerId: userId,
        status: 'DISCARDED' as const,
      })),
      skipDuplicates: true,
    });
  }

  private async inspect(key: string): Promise<StoredImage | null> {
    try {
      return await this.storage.inspect(key);
    } catch (error) {
      this.logger.warn(`Kho anh loi khi kiem anh: ${(error as Error).message}`);
      throw new ServiceUnavailableException({
        error: 'UPLOADS_UNAVAILABLE',
        message: 'Kho ảnh đang lỗi, hãy thử lại sau ít phút.',
      });
    }
  }

  private assertEnabled(): void {
    if (!this.storage.enabled) {
      throw new ServiceUnavailableException({
        error: 'UPLOADS_DISABLED',
        message: 'Máy chủ chưa bật tải ảnh.',
      });
    }
  }

  /** Redis loi thi cho qua: chu ky van het han sau 1 gio va moi anh van bi kiem truoc khi gan. */
  private async enforceRate(userId: string): Promise<void> {
    const digest = createHmac('sha256', this.config.get('RATE_LIMIT_PEPPER', { infer: true }))
      .update(`user:${userId}`)
      .digest('hex');
    let result: RateLimitResult;
    try {
      result = await this.limiter.consume(`upload-ticket:user:${digest}`, TICKETS_PER_HOUR, 3600);
    } catch {
      return;
    }
    if (!result.allowed) {
      throw new HttpException(
        {
          error: 'RATE_LIMITED',
          message: 'Bạn tải ảnh quá nhiều, hãy thử lại sau.',
          retryAfterSeconds: result.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}

function invalidMedia(message: string): UnprocessableEntityException {
  return new UnprocessableEntityException({ error: 'INVALID_MEDIA', message });
}
