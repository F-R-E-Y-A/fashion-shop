import type { Embedder } from './embedder.js';

/** Hinh dang toi thieu cua pipeline feature-extraction ma lop nay dung. */
type FeatureExtractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: true },
) => Promise<{ tolist(): number[][] }>;

const BATCH = 16;

/**
 * Mo hinh embedding da ngon ngu chay ngay trong tien trinh API bang transformers.js (ONNX Runtime),
 * khong goi dich vu ngoai, khong can khoa API. Mac dinh Xenova/multilingual-e5-small ban luong tu
 * hoa q8: do ngay 06/11 tren 87 san pham, nhung mot cau p95 7,5 ms, RSS them ~500 MB (ADR-048).
 *
 * Thu vien chi duoc nap (dynamic import) khi lan dau can nhung, nen SEARCH_SEMANTIC=off khong ton
 * RAM va khong dong toi ONNX Runtime. Chua thu bat SEARCH_SEMANTIC=local trong image Docker alpine
 * (ND-17): ONNX Runtime ban dung san co the can glibc (suy luan).
 */
export class TransformersEmbedder implements Embedder {
  private extractor: Promise<FeatureExtractor> | null = null;

  constructor(
    readonly model: string,
    private readonly cacheDir?: string,
  ) {}

  /** Nap mo hinh som (khi khoi dong) de lan tim dau tien khong phai cho. */
  load(): Promise<FeatureExtractor> {
    this.extractor ??= (async () => {
      const lib = await import('@huggingface/transformers');
      if (this.cacheDir) lib.env.cacheDir = this.cacheDir;
      const pipe = await lib.pipeline('feature-extraction', this.model, { dtype: 'q8' });
      return pipe as unknown as FeatureExtractor;
    })();
    // Nap loi (mat mang, thieu mo hinh) thi cho phep thu lai o lan sau thay vi giu loi mai mai.
    this.extractor.catch(() => {
      this.extractor = null;
    });
    return this.extractor;
  }

  async embed(texts: string[], kind: 'query' | 'passage'): Promise<Float32Array[]> {
    const extract = await this.load();
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const batch = texts.slice(i, i + BATCH).map((t) => `${kind}: ${t}`);
      const tensor = await extract(batch, { pooling: 'mean', normalize: true });
      for (const row of tensor.tolist()) out.push(Float32Array.from(row));
    }
    return out;
  }
}
