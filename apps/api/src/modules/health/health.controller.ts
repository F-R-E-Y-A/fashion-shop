import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Chi la tin hieu con song, dung cho Docker va nen tang trien khai.
 * Kiem tra sau gom Postgres, Redis, may tim kiem va do tre hang doi
 * thuoc ve HT-05 tuan 5, vi luc do moi co he thong de kiem.
 */
@ApiTags('health')
@Controller('healthz')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'May chu con song hay khong' })
  check(): { status: string; uptime: number; timestamp: string } {
    return {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
