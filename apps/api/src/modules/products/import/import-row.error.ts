import type { ImportFailReason } from './import.types.js';

export class ImportRowError extends Error {
  constructor(
    readonly reason: ImportFailReason,
    message: string,
  ) {
    super(message);
    this.name = 'ImportRowError';
  }
}
