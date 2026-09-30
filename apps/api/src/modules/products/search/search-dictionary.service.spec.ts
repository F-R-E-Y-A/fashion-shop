import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { DEFAULT_DICTIONARY } from './dictionary.js';
import { parseQuery } from './parse-query.js';
import { SearchDictionaryService, SYNONYMS_KEY } from './search-dictionary.service.js';

function make() {
  const findUnique = vi.fn();
  const prisma = { searchConfiguration: { findUnique } };
  const service = new SearchDictionaryService(prisma as unknown as PrismaService);
  return { findUnique, service };
}

const row = (configurationValue: unknown) => ({
  configurationKey: SYNONYMS_KEY,
  configurationValue,
});

describe('SearchDictionaryService (UC-03.2, tu dien mo rong)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('khong co dong cau hinh thi dung tu dien trong ma', async () => {
    const { findUnique, service } = make();
    findUnique.mockResolvedValue(null);
    expect(await service.get()).toBe(DEFAULT_DICTIONARY);
    expect(findUnique).toHaveBeenCalledWith({ where: { configurationKey: SYNONYMS_KEY } });
  });

  it('them dip mac tu DB: cau chua hieu se duoc hieu', async () => {
    const { findUnique, service } = make();
    findUnique.mockResolvedValue(
      row({
        occasions: [
          {
            value: 'dam-cuoi',
            label: 'Dịp: đám cưới',
            triggers: ['đám cưới'],
            terms: ['sơ mi', 'lụa'],
          },
        ],
      }),
    );
    const dict = await service.get();
    expect(parseQuery('đồ đi đám cưới', dict).groups.map((g) => g.value)).toEqual(['dam-cuoi']);
  });

  it('JSON sai hinh dang thi dung tu dien trong ma va chi canh bao mot lan', async () => {
    const { findUnique, service } = make();
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    findUnique.mockResolvedValue(row({ occasions: 'khong phai mang' }));
    expect(await service.get()).toBe(DEFAULT_DICTIONARY);
    service.invalidate();
    expect(await service.get()).toBe(DEFAULT_DICTIONARY);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('DB loi thi dung tu dien trong ma, khong nem loi', async () => {
    const { findUnique, service } = make();
    findUnique.mockRejectedValue(new Error('mat ket noi'));
    expect(await service.get()).toBe(DEFAULT_DICTIONARY);
  });

  it('nho tam 60 giay; invalidate() doc lai', async () => {
    const { findUnique, service } = make();
    findUnique.mockResolvedValue(null);
    await service.get();
    await service.get();
    expect(findUnique).toHaveBeenCalledTimes(1);
    service.invalidate();
    await service.get();
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});
