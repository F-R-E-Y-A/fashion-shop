import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReportingAggregatorService } from './reporting-aggregator.service.js';
import { ReportingRefreshWorker } from './reporting-refresh.worker.js';

describe('ReportingRefreshWorker', () => {
  let worker: ReportingRefreshWorker;
  let configService: ConfigService;
  let aggregator: Partial<ReportingAggregatorService>;

  beforeEach(() => {
    vi.restoreAllMocks();
    configService = new ConfigService();
    aggregator = {
      refreshSnapshot: vi.fn().mockResolvedValue({
        success: true,
        snapshotVersion: '1',
        asOf: new Date().toISOString(),
      }),
    };
    worker = new ReportingRefreshWorker(configService, aggregator as ReportingAggregatorService);
  });

  it('stays idle when REPORTING_WORKER_ENABLED is not true', () => {
    vi.spyOn(configService, 'get').mockReturnValue('false');
    worker.onApplicationBootstrap();
    expect(aggregator.refreshSnapshot).not.toHaveBeenCalled();
    worker.onApplicationShutdown();
  });

  it('starts interval timer when enabled and cleans up on shutdown', () => {
    vi.useFakeTimers();
    vi.spyOn(configService, 'get').mockImplementation((key: string) => {
      if (key === 'REPORTING_WORKER_ENABLED') return 'true';
      if (key === 'REPORTING_WORKER_INTERVAL_MS') return '60000';
      return null;
    });

    worker.onApplicationBootstrap();
    expect(aggregator.refreshSnapshot).not.toHaveBeenCalled();

    // Advance 60 seconds
    vi.advanceTimersByTime(60000);
    expect(aggregator.refreshSnapshot).toHaveBeenCalledTimes(1);

    // Shutdown clears timer
    worker.onApplicationShutdown();
    vi.advanceTimersByTime(60000);
    expect(aggregator.refreshSnapshot).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('prevents overlapping refresh runs', async () => {
    let resolveRefresh: (val: unknown) => void = () => {};
    const pendingPromise = new Promise((resolve) => {
      resolveRefresh = resolve;
    });

    aggregator.refreshSnapshot = vi.fn().mockReturnValue(pendingPromise);

    const firstRun = worker.triggerRefresh();
    const secondRun = await worker.triggerRefresh();

    expect(secondRun).toEqual({ executed: false, success: false });

    resolveRefresh({ success: true, snapshotVersion: '1' });
    const firstResult = await firstRun;
    expect(firstResult).toEqual({ executed: true, success: true });
  });

  it('handles advisory lock skip gracefully', async () => {
    aggregator.refreshSnapshot = vi.fn().mockResolvedValue({
      success: false,
      skippedDueToLock: true,
    });

    const result = await worker.triggerRefresh();
    expect(result).toEqual({ executed: false, success: true });
  });

  it('handles aggregator failure and logs error without crashing', async () => {
    aggregator.refreshSnapshot = vi.fn().mockResolvedValue({
      success: false,
      error: 'Data evidence failed',
    });

    const result = await worker.triggerRefresh();
    expect(result).toEqual({ executed: true, success: false });
  });
});
