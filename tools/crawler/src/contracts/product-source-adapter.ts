import type { JsonObject, RawSourceProduct } from './raw-product.ts';

export interface DiscoveredProduct {
  url: string;
}

export interface DiscoveryOptions {
  limit?: number;
}

export interface FetchResult {
  body: string;
  status: number;
  attempts: number;
  latencyMs: number;
}

export interface ProductSourceAdapter {
  readonly source: string;
  discover(options?: DiscoveryOptions): Promise<DiscoveredProduct[]>;
  fetch(url: string): Promise<FetchResult>;
  parse(html: string, sourceUrl: string): RawSourceProduct;
}

export class CollectorError extends Error {
  readonly code: string;
  readonly stopRun: boolean;
  readonly httpStatus?: number;
  readonly attempts?: number;
  readonly latencyMs?: number;
  readonly details?: JsonObject;

  constructor(
    code: string,
    message: string,
    options: {
      stopRun?: boolean;
      httpStatus?: number;
      attempts?: number;
      latencyMs?: number;
      details?: JsonObject;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'CollectorError';
    this.code = code;
    this.stopRun = options.stopRun ?? false;
    this.httpStatus = options.httpStatus;
    this.attempts = options.attempts;
    this.latencyMs = options.latencyMs;
    this.details = options.details;
  }
}
