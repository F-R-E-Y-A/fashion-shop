import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminReportingController } from './admin-reporting.controller.js';
import type { AdminReportSummaryResponse } from './dto/admin-report-summary.response.js';
import type { ReportingService } from './reporting.service.js';

describe('AdminReportingController (Issue #108)', () => {
  let controller: AdminReportingController;
  let mockReportingService: { getSummaryReport: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockReportingService = {
      getSummaryReport: vi.fn(),
    };
    controller = new AdminReportingController(mockReportingService as unknown as ReportingService);
  });

  it('goi dung phuong thuc getSummaryReport cua ReportingService', async () => {
    const mockResponse: AdminReportSummaryResponse = {
      status: 'READY',
      metadata: null,
      range: { from: '2026-10-14', to: '2026-11-12', timezone: 'Asia/Ho_Chi_Minh', days: 30 },
      summary: null,
      dailyMoney: [],
      ordersByStatus: [],
      topDeliveredProducts: [],
    };
    mockReportingService.getSummaryReport.mockResolvedValueOnce(mockResponse);

    const query = { from: '2026-10-14', to: '2026-11-12', top: 10 as const };
    const result = await controller.getSummaryReport(query);

    expect(mockReportingService.getSummaryReport).toHaveBeenCalledWith(query);
    expect(result).toBe(mockResponse);
  });
});
