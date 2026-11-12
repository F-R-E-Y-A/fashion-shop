import { Controller, Get, Header, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { RequireRoles, RoleCode } from '../auth/index.js';
import { AdminReportQueryDto } from './dto/admin-report-query.dto.js';
import { AdminReportSummaryResponse } from './dto/admin-report-summary.response.js';
import { ReportingService } from './reporting.service.js';

@ApiTags('admin-reporting')
@Controller('admin/reports')
@RequireRoles(RoleCode.ADMIN)
@ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
@ApiForbiddenResponse({ description: 'Cần quyền ADMIN' })
@ApiBadRequestResponse({ description: 'Tham số bộ lọc không hợp lệ' })
export class AdminReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('summary')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminReportSummaryResponse })
  getSummaryReport(@Query() query: AdminReportQueryDto): Promise<AdminReportSummaryResponse> {
    return this.reportingService.getSummaryReport(query);
  }
}
