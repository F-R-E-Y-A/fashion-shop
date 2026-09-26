import { Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';

export const BCRYPT_COST_FACTOR = 12;

/** Keeps bcrypt behind an Auth-owned boundary so controllers never handle it directly. */
@Injectable()
export class PasswordHasherService {
  hash(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_COST_FACTOR);
  }

  verify(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }
}
