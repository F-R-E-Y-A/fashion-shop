import { createHash, randomBytes } from 'node:crypto';

import {
  IMAGE_FORMATS,
  ImageStorage,
  REMOVE_BATCH_MAX,
  type StoredImage,
  type UploadTicket,
} from './image-storage.js';

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/** Cloudinary nhan timestamp trong chu ky toi da 1 gio. */
const TICKET_TTL_SECONDS = 60 * 60;
const REQUEST_TIMEOUT_MS = 8000;
/** Anh phat ra: gioi han canh dai, dinh dang va chat luong tu chon theo trinh duyet. */
const DELIVERY_TRANSFORM = 'c_limit,w_1600,h_1600,f_auto,q_auto';
/** O luoi 72 px CSS: 160 px du net tren man hinh mat do diem anh gap doi; cat giua cho vuong. */
const THUMBNAIL_TRANSFORM = 'c_fill,w_160,h_160,f_auto,q_auto';

/** `cloudinary://<api_key>:<api_secret>@<cloud_name>`, dang bien moi truong chuan cua Cloudinary. */
export function parseCloudinaryUrl(url: string): CloudinaryCredentials | null {
  const match = /^cloudinary:\/\/([^:@\s]+):([^@\s]+)@([A-Za-z0-9_-]+)$/u.exec(url.trim());
  if (!match) return null;
  return {
    apiKey: decodeURIComponent(match[1]!),
    apiSecret: decodeURIComponent(match[2]!),
    cloudName: match[3]!,
  };
}

/**
 * Chu ky tai len cua Cloudinary: tham so (tru file, cloud_name, resource_type, api_key) xep theo ten,
 * noi `ten=gia_tri` bang `&`, noi them api_secret roi bam SHA-1 hex. Kiem bang vi du trong tai lieu
 * Cloudinary o cloudinary-image-storage.spec.ts.
 */
export function signCloudinaryParams(
  params: Record<string, string | number>,
  apiSecret: string,
): string {
  const payload = Object.keys(params)
    .filter((key) => params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1')
    .update(payload + apiSecret)
    .digest('hex');
}

/** public_id co dau `/` (thu muc): ma hoa tung doan, giu dau `/`. */
const encodeKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');

export class CloudinaryImageStorage extends ImageStorage {
  readonly enabled = true;
  private readonly authorization: string;

  constructor(
    private readonly credentials: CloudinaryCredentials,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    super();
    const basic = Buffer.from(`${credentials.apiKey}:${credentials.apiSecret}`).toString('base64');
    this.authorization = `Basic ${basic}`;
  }

  /**
   * Ky public_id, overwrite=false va allowed_formats. Trinh duyet doi khoa (ghi vao thu muc nguoi
   * khac), doi dinh dang hay bo overwrite thi chu ky sai va Cloudinary tu choi. overwrite=false chan
   * dung lai phieu de thay anh da duoc duyet. Co file van phai kiem lai bang inspect sau khi tai.
   */
  createUploadTicket(folder: string, now: Date = new Date()): UploadTicket {
    const timestamp = Math.floor(now.getTime() / 1000);
    const key = `${folder}/${randomBytes(12).toString('hex')}`;
    const signed = {
      allowed_formats: IMAGE_FORMATS.join(','),
      overwrite: 'false',
      public_id: key,
      timestamp: String(timestamp),
    };
    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.credentials.cloudName}/image/upload`,
      fields: {
        ...signed,
        api_key: this.credentials.apiKey,
        signature: signCloudinaryParams(signed, this.credentials.apiSecret),
      },
      key,
      expiresAt: new Date((timestamp + TICKET_TTL_SECONDS) * 1000).toISOString(),
    };
  }

  async inspect(key: string): Promise<StoredImage | null> {
    const response = await this.fetcher(
      `${this.adminBase()}/resources/image/upload/${encodeKey(key)}`,
      {
        headers: { Authorization: this.authorization },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Cloudinary inspect tra ${response.status}`);
    const body = (await response.json()) as {
      public_id?: string;
      format?: string;
      bytes?: number;
      width?: number;
      height?: number;
    };
    return {
      key: body.public_id ?? key,
      format: (body.format ?? '').toLowerCase(),
      bytes: Number(body.bytes ?? 0),
      width: typeof body.width === 'number' ? body.width : null,
      height: typeof body.height === 'number' ? body.height : null,
    };
  }

  deliveryUrl(key: string): string {
    return this.variantUrl(DELIVERY_TRANSFORM, key);
  }

  thumbnailUrl(key: string): string {
    return this.variantUrl(THUMBNAIL_TRANSFORM, key);
  }

  /**
   * Moi lenh toi da 100 khoa; cac lo chay noi tiep vi gioi han la so lenh moi gio (goi Free 500), chay
   * song song chi lam het han muc nhanh hon. Phan hoi 2xx coi ca lo da xong: tai lieu khong mo ta gia
   * tri cho khoa khong ton tai, nen khong dua vao tung khoa. Khong gui `invalidate`: Cloudinary mac
   * dinh tat, phai mo yeu cau ho tro (ADR-056).
   */
  async remove(keys: readonly string[]): Promise<void> {
    for (let start = 0; start < keys.length; start += REMOVE_BATCH_MAX) {
      const query = keys
        .slice(start, start + REMOVE_BATCH_MAX)
        .map((key) => `public_ids[]=${encodeURIComponent(key)}`)
        .join('&');
      const response = await this.fetcher(`${this.adminBase()}/resources/image/upload?${query}`, {
        method: 'DELETE',
        headers: { Authorization: this.authorization },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Cloudinary remove tra ${response.status}`);
    }
  }

  private variantUrl(transform: string, key: string): string {
    return `https://res.cloudinary.com/${this.credentials.cloudName}/image/upload/${transform}/${encodeKey(key)}`;
  }

  private adminBase(): string {
    return `https://api.cloudinary.com/v1_1/${this.credentials.cloudName}`;
  }
}
