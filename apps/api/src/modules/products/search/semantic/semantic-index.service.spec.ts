import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../../../../infra/config/env.js';
import type { CatalogRow } from '../catalog-engine.js';
import type { Embedder } from './embedder.js';
import { productText, SemanticIndexService } from './semantic-index.service.js';

const row = (id: string, name: string, extra: Partial<CatalogRow> = {}): CatalogRow => ({
  id,
  name,
  price: 49000,
  cat: 'ao-khoac',
  catName: 'Áo khoác',
  root: 'ao',
  rootName: 'Áo',
  audience: 'nu',
  colors: ['Đen'],
  sizes: ['M'],
  featured: false,
  description: null,
  ...extra,
});

const ROWS = [
  row('a', 'Áo Phao Nữ'),
  row('b', 'Áo Thun Nữ', { cat: 'ao-thun', catName: 'Áo thun' }),
];

/** Bo nhung gia: vector 2 chieu, "phao"/"lạnh" ve truc 0, con lai ve truc 1. Dem so lan goi. */
function fakeEmbedder(): Embedder & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    model: 'fake',
    calls,
    embed: vi.fn(async (texts: string[]) => {
      calls.push(texts);
      return texts.map((t) =>
        /phao|lạnh/iu.test(t) ? Float32Array.from([1, 0]) : Float32Array.from([0, 1]),
      );
    }),
  };
}

const config = (timeoutMs = 300) =>
  ({ get: () => timeoutMs }) as unknown as ConfigService<Env, true>;

describe('SemanticIndexService (ADR-048)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  it('UC-03.2/AC5 sau khi nhung catalog, cau gan nghia cho cosine cao nhat dung san pham', async () => {
    const index = new SemanticIndexService(fakeEmbedder(), config());
    await index.refresh(ROWS);
    const sim = await index.scores('áo mặc mùa lạnh', ROWS);
    expect(sim?.get('a')).toBeCloseTo(1);
    expect(sim?.get('b')).toBeCloseTo(0);
  });

  it('UC-03.2/AC7 SEARCH_SEMANTIC=off (khong co bo nhung) thi tra null', async () => {
    const index = new SemanticIndexService(null, config());
    expect(index.enabled).toBe(false);
    expect(await index.scores('áo', ROWS)).toBeNull();
  });

  it('UC-03.2/AC7 chua nhung xong catalog thi tra null va kich hoat nhung o nen', async () => {
    const embedder = fakeEmbedder();
    const index = new SemanticIndexService(embedder, config());
    expect(await index.scores('áo', ROWS)).toBeNull();
    await index.refresh(ROWS);
    expect(await index.scores('áo', ROWS)).not.toBeNull();
  });

  it('UC-03.2/AC7 bo nhung loi thi tra null, khong nem loi ra ngoai', async () => {
    const embedder = fakeEmbedder();
    const index = new SemanticIndexService(embedder, config());
    await index.refresh(ROWS);
    vi.mocked(embedder.embed).mockRejectedValueOnce(new Error('onnx hong'));
    await expect(index.scores('áo hỏng', ROWS)).resolves.toBeNull();
  });

  it('UC-03.2/AC7 qua SEARCH_SEMANTIC_TIMEOUT_MS thi tra null; vector cau van duoc luu cho lan sau', async () => {
    const embedder = fakeEmbedder();
    const index = new SemanticIndexService(embedder, config(20));
    await index.refresh(ROWS);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(embedder.embed).mockImplementationOnce(async () => {
      await gate;
      return [Float32Array.from([1, 0])];
    });
    expect(await index.scores('áo chậm', ROWS)).toBeNull();
    release();
    await gate;
    await Promise.resolve();
    const again = await index.scores('áo chậm', ROWS);
    expect(again?.get('a')).toBeCloseTo(1);
  });

  it('UC-03.2/AC5 chi nhung lai san pham doi van ban; cau lap lai dung cache', async () => {
    const embedder = fakeEmbedder();
    const index = new SemanticIndexService(embedder, config());
    await index.refresh(ROWS);
    await index.refresh(ROWS);
    expect(embedder.calls).toHaveLength(1);
    const changed = [ROWS[0], row('b', 'Áo Thun Nữ Mới')];
    await index.refresh(changed);
    expect(embedder.calls[1]).toHaveLength(1);
    await index.scores('áo', changed);
    await index.scores('áo', changed);
    expect(embedder.calls.filter((c) => c[0] === 'áo')).toHaveLength(1);
  });

  it('productText gom ten, danh muc, doi tuong, mau va mo ta', () => {
    const text = productText(row('x', 'Áo Phao', { description: ' Ấm  áp\nnhẹ ' }));
    expect(text).toBe('Áo Phao. Danh mục: Áo khoác, Áo. Dành cho nữ. Màu: Đen. Ấm áp nhẹ');
  });
});
