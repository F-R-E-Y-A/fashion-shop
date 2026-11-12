/**
 * Kho anh do nguoi dung tai len (ADR-055). Cua "infra": khong biet danh gia hay san pham, chi biet
 * thu muc, khoa va gioi han. Trinh duyet tai THANG len kho bang phieu ky san, nen file khong di qua
 * may chu 512 MB; may chu chi ky phieu, kiem anh da len va tra URL phat.
 */

/** Dinh dang va co toi da nhan vao; kho that kiem lai sau khi tai (inspect). */
export const IMAGE_FORMATS = ['jpg', 'png', 'webp'] as const;
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** Cloudinary nhan toi da 100 public_id moi lenh xoa (Admin API "Delete resources by public ID"). */
export const REMOVE_BATCH_MAX = 100;

export interface UploadTicket {
  /** Dia chi trinh duyet POST multipart toi. */
  uploadUrl: string;
  /** Truong form gui kem file, da ky; doi bat ky truong nao thi kho tu choi. */
  fields: Record<string, string>;
  /**
   * Khoa (public_id) do may chu dat san va ky: mot phieu mot anh. Khong phu thuoc cach kho xu ly
   * thu muc (Cloudinary "fixed" hay "dynamic folders"), va trinh duyet khong tu chon duoc khoa.
   */
  key: string;
  expiresAt: string;
}

export interface StoredImage {
  key: string;
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
}

export abstract class ImageStorage {
  /** false: chua cau hinh kho, moi thao tac tai anh phai bi tu choi o tang tren. */
  abstract readonly enabled: boolean;

  /** Phieu tai MOT anh vao thu muc; goi khi enabled=false la loi lap trinh. */
  abstract createUploadTicket(folder: string, now?: Date): UploadTicket;

  /** Thong tin anh da tai; null khi khoa khong ton tai. Kho loi thi nem loi (khong nuot). */
  abstract inspect(key: string): Promise<StoredImage | null>;

  /** URL cong khai, da thu nho va doi dinh dang hop trinh duyet. */
  abstract deliveryUrl(key: string): string;

  /** Ban vuong nho cho luoi anh; kho tu cat va nen, trinh duyet khong tai ban lon chi de ve o nho. */
  abstract thumbnailUrl(key: string): string;

  /**
   * Xoa theo khoa, bo qua khoa khong ton tai; tu chia lo REMOVE_BATCH_MAX khoa moi lenh. Nem loi khi
   * kho tu choi: nguoi goi giu hang doi de thu lai, khong coi la da xoa.
   */
  abstract remove(keys: readonly string[]): Promise<void>;
}

/** Ban tat: khong co kho anh. Thao tac doc tra rong de tang tren tu quyet dinh bao loi gi. */
export class DisabledImageStorage extends ImageStorage {
  readonly enabled = false;

  createUploadTicket(): UploadTicket {
    throw new Error('Kho anh chua cau hinh (CLOUDINARY_URL)');
  }

  inspect(): Promise<StoredImage | null> {
    return Promise.resolve(null);
  }

  deliveryUrl(key: string): string {
    return key;
  }

  thumbnailUrl(key: string): string {
    return key;
  }

  remove(): Promise<void> {
    return Promise.resolve();
  }
}
