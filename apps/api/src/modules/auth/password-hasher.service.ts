import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';

import type { Env } from '../../infra/config/env.js';

export const BCRYPT_COST_FACTOR = 12;
/** Muc toi thieu bcrypt cho phep; chi dung khi NODE_ENV=test de kiem thu HTTP khong ton vai tram ms moi lan bam. */
export const BCRYPT_TEST_COST_FACTOR = 4;

/**
 * Cost theo NODE_ENV, khong theo bien moi truong rieng: khong co cach cau hinh nao ha duoc cost
 * tren development, staging hay production. Hash cost 12 da luu van verify dung o moi moi truong
 * vi bcrypt doc cost tu chinh chuoi hash.
 */
export const bcryptCost = (nodeEnv: Env['NODE_ENV']): number =>
  nodeEnv === 'test' ? BCRYPT_TEST_COST_FACTOR : BCRYPT_COST_FACTOR;

/** Keeps bcrypt behind an Auth-owned boundary so controllers never handle it directly. */
@Injectable()
export class PasswordHasherService {
  private readonly cost: number;

  constructor(config: ConfigService<Env, true>) {
    this.cost = bcryptCost(config.get('NODE_ENV', { infer: true }));
  }

  hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.cost);
  }

  verify(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }
}
