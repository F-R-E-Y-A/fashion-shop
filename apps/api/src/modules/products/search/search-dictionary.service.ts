import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { buildDictionary, DEFAULT_DICTIONARY, type DictEntry } from './dictionary.js';

/** Khoa trong bang search_configurations. Dinh dang: xem ExtraOccasion o dictionary.ts. */
export const SYNONYMS_KEY = 'synonyms.v1';
const TTL_MS = 60_000;

/**
 * Tu dien cua bo hieu truy van = tu dien trong ma + cac dip mac them tu DB. Them dip mac moi
 * (vd "đám cưới") bang mot dong trong search_configurations, khong can deploy; doc lai sau toi da
 * 60 giay. Khong co dong, JSON sai hinh dang hoac DB loi thi dung tu dien trong ma.
 */
@Injectable()
export class SearchDictionaryService {
  private readonly logger = new Logger(SearchDictionaryService.name);
  private cached: { at: number; dict: readonly DictEntry[] } | null = null;
  private warned = false;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<readonly DictEntry[]> {
    const now = Date.now();
    if (this.cached && now - this.cached.at < TTL_MS) return this.cached.dict;
    const dict = await this.load();
    this.cached = { at: now, dict };
    return dict;
  }

  /** Bo qua bo nho dem; dung khi vua sua search_configurations (va trong kiem thu). */
  invalidate(): void {
    this.cached = null;
  }

  private async load(): Promise<readonly DictEntry[]> {
    try {
      const row = await this.prisma.searchConfiguration.findUnique({
        where: { configurationKey: SYNONYMS_KEY },
      });
      if (!row) return DEFAULT_DICTIONARY;
      const value = row.configurationValue;
      const occasions =
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as { occasions?: unknown }).occasions
          : undefined;
      if (!Array.isArray(occasions)) {
        this.warnOnce(`${SYNONYMS_KEY} khong co mang "occasions", dung tu dien trong ma`);
        return DEFAULT_DICTIONARY;
      }
      return buildDictionary(occasions);
    } catch (error) {
      this.warnOnce(
        `Khong doc duoc ${SYNONYMS_KEY} (${(error as Error).message}), dung tu dien trong ma`,
      );
      return DEFAULT_DICTIONARY;
    }
  }

  private warnOnce(message: string): void {
    if (this.warned) return;
    this.warned = true;
    this.logger.warn(message);
  }
}
