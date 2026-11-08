import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../../../infra/config/env.js';
import type { CatalogRow } from '../catalog-engine.js';
import { cosine, EMBEDDER, type Embedder } from './embedder.js';

const QUERY_CACHE = 256;

interface Stored {
  hash: string;
  vec: Float32Array;
}

/** Van ban dai dien mot san pham khi nhung: ten, danh muc, doi tuong, mau, mo ta (da cat 600 ky tu). */
export function productText(row: CatalogRow): string {
  const audience = row.audience === 'nu' ? 'nữ' : row.audience === 'nam' ? 'nam' : '';
  return [
    row.name,
    `Danh mục: ${row.catName}${row.rootName !== row.catName ? `, ${row.rootName}` : ''}`,
    audience && `Dành cho ${audience}`,
    row.colors.length ? `Màu: ${row.colors.join(', ')}` : '',
    (row.description ?? '').replace(/\s+/g, ' ').trim(),
  ]
    .filter(Boolean)
    .join('. ');
}

/**
 * Chi muc vector san pham trong bo nho (ADR-048). Vai tram san pham thi so cosine voi tung san pham
 * duoi 1 ms, chua can pgvector. Vector gan voi bam cua (mo hinh + van ban): san pham doi ten, mo ta
 * hay mau thi lan nap catalog sau tu tinh lai, khong can lang nghe su kien.
 *
 * Moi loi deu dong mo (fail-open): tat, chua nhung xong catalog, mo hinh loi hay qua han thi tra null
 * va CatalogSearchService xep theo luat nhu truoc (ADR-019).
 */
@Injectable()
export class SemanticIndexService {
  private readonly logger = new Logger(SemanticIndexService.name);
  private readonly vectors = new Map<string, Stored>();
  private readonly queries = new Map<string, Float32Array>();
  private indexing: Promise<void> | null = null;
  private readonly timeoutMs: number;

  constructor(
    @Inject(EMBEDDER) private readonly embedder: Embedder | null,
    config: ConfigService<Env, true>,
  ) {
    this.timeoutMs = config.get('SEARCH_SEMANTIC_TIMEOUT_MS', { infer: true });
  }

  get enabled(): boolean {
    return this.embedder !== null;
  }

  /**
   * Nhung cac san pham chua co vector hoac da doi van ban. Chay nen, moi luc mot luot; tra ve
   * promise de khoi dong va kiem thu cho duoc khi can.
   */
  refresh(rows: readonly CatalogRow[]): Promise<void> {
    const embedder = this.embedder;
    if (!embedder || this.indexing) return this.indexing ?? Promise.resolve();
    const todo = rows
      .map((row) => {
        const text = productText(row);
        const hash = createHash('sha1').update(`${embedder.model}\n${text}`).digest('hex');
        return { id: row.id, text, hash };
      })
      .filter((r) => this.vectors.get(r.id)?.hash !== r.hash);
    if (!todo.length) return Promise.resolve();

    const started = Date.now();
    this.indexing = embedder
      .embed(
        todo.map((r) => r.text),
        'passage',
      )
      .then((vecs) => {
        todo.forEach((r, i) => this.vectors.set(r.id, { hash: r.hash, vec: vecs[i] }));
        this.logger.log(`Da nhung ${todo.length} san pham trong ${Date.now() - started} ms`);
      })
      .catch((error: unknown) => {
        this.logger.warn(`Khong nhung duoc san pham, tim theo luat: ${(error as Error).message}`);
      })
      .finally(() => {
        this.indexing = null;
      });
    return this.indexing;
  }

  /**
   * Diem cosine giua cau q va moi san pham trong rows. Null khi khong dung duoc: luc do xep theo luat.
   * Thieu vector cua bat ky san pham nao cung tra null, de khong xep lech nhung san pham da co vector.
   */
  async scores(q: string, rows: readonly CatalogRow[]): Promise<Map<string, number> | null> {
    if (!this.embedder || !q.trim()) return null;
    if (rows.some((r) => !this.vectors.has(r.id))) {
      void this.refresh(rows);
      return null;
    }
    const vec = await this.queryVector(q.trim().toLowerCase());
    if (!vec) return null;
    const out = new Map<string, number>();
    for (const r of rows) out.set(r.id, cosine(vec, this.vectors.get(r.id)!.vec));
    // Mot san pham co the doi van ban giua hai lan nap: tinh lai o nen cho lan sau.
    void this.refresh(rows);
    return out;
  }

  /**
   * Vector cua cau truy van, co cache: trang 2 dung lai dung vector cua trang 1, khong luc lai luc
   * khong. Qua han thi tra null nhung van luu vector khi nhung xong.
   */
  private async queryVector(q: string): Promise<Float32Array | null> {
    const hit = this.queries.get(q);
    if (hit) {
      this.queries.delete(q);
      this.queries.set(q, hit);
      return hit;
    }
    const pending = this.embedder!.embed([q], 'query').then(([vec]) => {
      this.queries.set(q, vec);
      if (this.queries.size > QUERY_CACHE) this.queries.delete(this.queries.keys().next().value!);
      return vec;
    });
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), this.timeoutMs);
    });
    try {
      return await Promise.race([pending, timeout]);
    } catch (error) {
      this.logger.warn(`Khong nhung duoc cau tim kiem, tim theo luat: ${(error as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
      pending.catch(() => undefined);
    }
  }
}
