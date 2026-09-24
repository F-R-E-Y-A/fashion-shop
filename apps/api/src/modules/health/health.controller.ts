import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import type { Env } from '../../infra/config/env.js';

export interface HealthResponse {
  status: 'ok';
  version: string;
  gitSha: string | null;
  env: string;
  uptime: number;
  timestamp: string;
}

/**
 * Tin hieu con song kem BAN dang chay. Docker HEALTHCHECK, Render va cd-staging.yml doc duong dan nay;
 * gitSha cho phep CD doi toi khi dung commit vua gop da len staging roi moi smoke test.
 * Kiem tra sau (Postgres, hang doi...) thuoc HT-05 tuan 5.
 */
@ApiTags('health')
@Controller('healthz')
export class HealthController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  @Get()
  @ApiOperation({ summary: 'May chu con song hay khong, dang chay ban nao' })
  check(): HealthResponse {
    return {
      status: 'ok',
      version: this.config.get('APP_VERSION', { infer: true }),
      gitSha:
        this.config.get('GIT_SHA', { infer: true }) ??
        this.config.get('RENDER_GIT_COMMIT', { infer: true }) ??
        null,
      env: this.config.get('NODE_ENV', { infer: true }),
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
