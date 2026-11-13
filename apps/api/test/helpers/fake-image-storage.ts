import {
  ImageStorage,
  type StoredImage,
  type UploadTicket,
} from '../../src/infra/storage/image-storage.js';

/**
 * Kho anh trong bo nho cho kiem thu HTTP: khong goi Cloudinary. `put` gia lap trinh duyet da tai
 * anh len bang phieu; `failInspect`, `failRemove` gia lap kho loi mang. `removeCalls` ghi tung lo xoa;
 * `holdRemove` giu lenh xoa cho toi khi goi ham tra ve, de hai luot don chong len nhau that.
 */
export class FakeImageStorage extends ImageStorage {
  readonly enabled = true;
  readonly images = new Map<string, StoredImage>();
  readonly removed: string[] = [];
  readonly removeCalls: string[][] = [];
  failInspect = false;
  failRemove = false;
  private gate: Promise<void> | null = null;
  private issued = 0;

  createUploadTicket(folder: string, now: Date = new Date()): UploadTicket {
    this.issued += 1;
    const key = `${folder}/img${this.issued}`;
    return {
      uploadUrl: 'https://upload.test/image/upload',
      fields: { public_id: key, signature: 'test' },
      key,
      expiresAt: new Date(now.getTime() + 3_600_000).toISOString(),
    };
  }

  inspect(key: string): Promise<StoredImage | null> {
    if (this.failInspect) return Promise.reject(new Error('kho anh gia lap loi'));
    return Promise.resolve(this.images.get(key) ?? null);
  }

  deliveryUrl(key: string): string {
    return `https://cdn.test/${key}.jpg`;
  }

  thumbnailUrl(key: string): string {
    return `https://cdn.test/thumb/${key}.jpg`;
  }

  async remove(keys: readonly string[]): Promise<void> {
    this.removeCalls.push([...keys]);
    if (this.gate) await this.gate;
    if (this.failRemove) throw new Error('kho anh gia lap loi khi xoa');
    for (const key of keys) {
      this.images.delete(key);
      this.removed.push(key);
    }
  }

  /** Lenh xoa tu gio phai cho; goi ham tra ve de tha tat ca. */
  holdRemove(): () => void {
    let release!: () => void;
    this.gate = new Promise((resolve) => {
      release = resolve;
    });
    return () => {
      this.gate = null;
      release();
    };
  }

  put(key: string, image: Partial<StoredImage> = {}): void {
    this.images.set(key, { key, format: 'jpg', bytes: 120_000, width: 800, height: 800, ...image });
  }

  reset(): void {
    this.images.clear();
    this.removed.length = 0;
    this.removeCalls.length = 0;
    this.failInspect = false;
    this.failRemove = false;
    this.gate = null;
    this.issued = 0;
  }
}
