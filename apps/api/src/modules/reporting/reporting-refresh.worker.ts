import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ReportingAggregatorService } from './reporting-aggregator.service.js';

export const DEFAULT_REPORTING_INTERVAL_MS = 5 * 60 * 1000; // 5 phut

@Injectable()
export class ReportingRefreshWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ReportingRefreshWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly aggregator: ReportingAggregatorService,
  ) {}

  onApplicationBootstrap(): void {
    const isEnabled = this.configService.get<string>('REPORTING_WORKER_ENABLED') === 'true';
    if (!isEnabled) {
      this.logger.log(
        'ReportingRefreshWorker dang o trang thai TAT (REPORTING_WORKER_ENABLED != true).',
      );
      return;
    }

    const intervalMs =
      Number(this.configService.get<string>('REPORTING_WORKER_INTERVAL_MS')) ||
      DEFAULT_REPORTING_INTERVAL_MS;

    this.logger.log(
      `ReportingRefreshWorker da bat. Chu ky cap nhat: ${intervalMs}ms (${intervalMs / 60000} phut).`,
    );

    this.timer = setInterval(() => {
      void this.triggerRefresh();
    }, intervalMs);
    // Cho phep Node thoat neu chi con worker timer nay chay
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.log('ReportingRefreshWorker da dung timer don dep tai nguyen.');
    }
  }

  /**
   * Thuc hien mot lan quet va cap nhat snapshot.
   * Su dung flag isRunning de ngan chan overlap cuc bo,
   * dong thoi dua vao advisory lock de ngan overlap giua cac instance khac nhau.
   */
  async triggerRefresh(): Promise<{ executed: boolean; success: boolean }> {
    if (this.isRunning) {
      this.logger.warn('Lan quet truoc chua hoan thanh. Bo qua luot nay.');
      return { executed: false, success: false };
    }

    this.isRunning = true;
    try {
      const result = await this.aggregator.refreshSnapshot();
      if (result.success) {
        this.logger.log(
          `Worker cap nhat bao cao thanh cong (version: ${result.snapshotVersion}, asOf: ${result.asOf})`,
        );
        return { executed: true, success: true };
      }
      if (result.skippedDueToLock) {
        this.logger.log('Worker bo qua luot quet vi instance khac dang nam giu advisory lock.');
        return { executed: false, success: true };
      }
      this.logger.error(`Worker tong hop snapshot that bai: ${result.error}`);
      return { executed: true, success: false };
    } catch (error) {
      this.logger.error('Loi khong ngo khi worker tong hop bao cao:', error);
      return { executed: true, success: false };
    } finally {
      this.isRunning = false;
    }
  }
}
