import type { Embedder } from '../../src/modules/products/search/semantic/embedder.js';

/**
 * Bo nhung gia, tat dinh, cho kiem thu HTTP (ADR-048): moi chieu la mot "khai niem" gom vai tu
 * khoa; van ban chua tu nao thi tang chieu do. Khong tai mo hinh, chay tuc thi, nen CI khong can mang.
 */
const CONCEPTS: string[][] = [
  ['lanh', 'am ap', 'mua dong', 'khoac', 'phao', 'gio', 'tweed'],
  ['the thao', 'gym', 'chay bo', 'short'],
  ['cong so', 'di lam', 'van phong', 'quan tay', 'so mi'],
  ['bien', 'mua he', 'mat', 'linen'],
];

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/đ/giu, 'd')
    .toLowerCase();

export class KeywordEmbedder implements Embedder {
  readonly model = 'keyword-test';
  calls = 0;
  failing = false;

  async embed(texts: string[]): Promise<Float32Array[]> {
    this.calls += 1;
    if (this.failing) throw new Error('bo nhung gia dang hong');
    return texts.map((t) => {
      const text = fold(t);
      const v = [...CONCEPTS.map((words) => words.filter((w) => text.includes(w)).length), 0.2];
      const norm = Math.hypot(...v);
      return Float32Array.from(v.map((x) => x / norm));
    });
  }
}
