/**
 * Bo nhung van ban thanh vector (ADR-048). Tach thanh interface de kiem thu thay bang ban gia tat
 * dinh (overrideProvider), con chay that thi dung TransformersEmbedder. Vector tra ve da chuan hoa
 * do dai 1, nen tich vo huong chinh la cosine.
 */
export interface Embedder {
  /** Ten mo hinh; doi mo hinh thi vector cu cua san pham phai tinh lai. */
  readonly model: string;
  /** passage: van ban san pham; query: cau khach go. Mo hinh e5 can tien to khac nhau cho hai loai. */
  embed(texts: string[], kind: 'query' | 'passage'): Promise<Float32Array[]>;
}

/** Token tiem bo nhung. Gia tri null nghia la tim kiem ngu nghia dang tat (SEARCH_SEMANTIC=off). */
export const EMBEDDER = Symbol('EMBEDDER');

export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
