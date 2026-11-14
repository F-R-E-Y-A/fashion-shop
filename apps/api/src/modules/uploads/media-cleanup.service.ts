import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../infra/config/env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ImageStorage, REMOVE_BATCH_MAX } from '../../infra/storage/image-storage.js';

/** Phieu het han sau 1 gio; anh tai xong ma 24 gio chua gan vao danh gia thi coi la mo coi. */
export const PENDING_GRACE_MS = 24 * 60 * 60 * 1000;
/** Lo da nhan ma worker chet hay kho loi giua chung: qua han thue thi luot sau nhan lai. */
export const CLAIM_LEASE_MS = 30 * 60 * 1000;
const TICK_MS = 15 * 60 * 1000;
/**
 * Moi luot toi da 5 lo = 5 lenh xoa (500 anh). Goi Free cua Cloudinary cho 500 lenh Admin API moi gio
 * va lenh kiem anh khi gui danh gia dung chung han muc: 4 luot moi gio ton toi da 20 lenh.
 */
const MAX_BATCHES_PER_SWEEP = 5;
/** Lo thu lai tu lan nay tro di thi canh bao: kho loi keo dai hoac khoa khong xoa duoc. */
const WARN_AFTER_ATTEMPTS = 3;

export interface SweepResult {
  removed: number;
  failed: number;
}

interface ClaimedRow {
  id: string;
  storage_key: string;
  attempts: number;
}

/**
 * Don anh mo coi tren kho theo lo (ADR-056). Nhan lo bang UPDATE ... FOR UPDATE SKIP LOCKED: nhieu
 * may chu hay hai luot chong nhau chay SONG SONG van nhan lo rieng, khong xoa trung. Lo nhan xong da
 * commit truoc khi goi kho, khong giu giao dich qua mot lenh HTTP.
 */
@Injectable()
export class MediaCleanupService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private readonly logger = new Logger(MediaCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ImageStorage,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit() {
    // Kiem thu goi sweep() truc tiep. Kho tat thi khong co phieu nao, cung khong co gi de don.
    if (this.config.get('NODE_ENV', { infer: true }) === 'test' || !this.storage.enabled) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const result = await this.sweep();
      if (result.removed > 0 || result.failed > 0) {
        this.logger.log(`Don anh: xoa ${result.removed}, cho thu lai ${result.failed}`);
      }
    } catch (error) {
      this.logger.error(`Don anh loi: ${(error as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  /**
   * Mot luot don: nhan lo toi da 100 khoa (mot lenh xoa cua Cloudinary), xoa tren kho, roi xoa dong.
   * Kho loi thi dung luot, lo giu DELETING toi het han thue. Kho tat thi khong lam gi: xoa dong ma
   * khong xoa duoc anh se de anh mo coi vinh vien.
   */
  async sweep(now: Date = new Date()): Promise<SweepResult> {
    const result: SweepResult = { removed: 0, failed: 0 };
    if (!this.storage.enabled) return result;
    for (let batch = 0; batch < MAX_BATCHES_PER_SWEEP; batch += 1) {
      const claimed = await this.claim(now);
      if (claimed.length === 0) break;
      try {
        await this.storage.remove(claimed.map((row) => row.storage_key));
      } catch (error) {
        result.failed += claimed.length;
        const attempts = Math.max(...claimed.map((row) => row.attempts));
        const message = `Kho anh tu choi xoa ${claimed.length} anh (lan ${attempts}): ${(error as Error).message}`;
        if (attempts >= WARN_AFTER_ATTEMPTS) this.logger.warn(message);
        else this.logger.log(message);
        break;
      }
      await this.prisma.mediaUpload.deleteMany({
        where: { id: { in: claimed.map((row) => row.id) }, status: 'DELETING' },
      });
      result.removed += claimed.length;
      if (claimed.length < REMOVE_BATCH_MAX) break;
    }
    return result;
  }

  /**
   * Mot cau lenh, tu commit: chon dong den han (DISCARDED; PENDING qua 24 gio; DELETING qua han thue),
   * khoa va bo qua dong luot khac dang khoa, doi sang DELETING. Gan anh (UploadsService.attach) chi lay
   * dong PENDING nen khong the gan anh dang bi xoa.
   */
  private claim(now: Date): Promise<ClaimedRow[]> {
    const pendingBefore = new Date(now.getTime() - PENDING_GRACE_MS);
    const leaseBefore = new Date(now.getTime() - CLAIM_LEASE_MS);
    return this.prisma.$queryRaw<ClaimedRow[]>`
      UPDATE media_uploads
      SET status = 'DELETING', claimed_at = ${now}, attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM media_uploads
        WHERE status = 'DISCARDED'
          OR (status = 'PENDING' AND created_at < ${pendingBefore})
          OR (status = 'DELETING' AND claimed_at < ${leaseBefore})
        ORDER BY created_at
        LIMIT ${REMOVE_BATCH_MAX}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, storage_key, attempts`;
  }
}
