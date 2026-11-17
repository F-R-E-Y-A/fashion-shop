import { Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../infra/config/env.js';
import { mapGhnStatus } from './ghn-status.map.js';
import type {
  CarrierStatusEvent,
  CreateCarrierShipmentInput,
  CreateCarrierShipmentResult,
  ShippingCarrierGateway,
} from './shipping-carrier.js';

interface GhnEnvelope<T> {
  code?: number;
  message?: string;
  data?: T;
}

interface GhnProvinceV3 {
  province_id?: number;
  ProvinceID?: number;
  province_name?: string;
  ProvinceName?: string;
  name_extensions?: string[];
  NameExtension?: string[];
}

interface GhnWardV3 {
  ward_code?: string;
  WardCode?: string;
  ward_name?: string;
  WardName?: string;
  name_extensions?: string[];
  NameExtension?: string[];
}

interface CachedMasterData<T> {
  expiresAt: number;
  data: T;
}

const MASTER_DATA_TTL_MS = 60 * 60 * 1000;
const DEFAULT_GHN_URL = 'https://dev-online-gateway.ghn.vn/shiip/public-api';

@Injectable()
export class GhnCarrierGateway implements ShippingCarrierGateway {
  readonly code = 'GHN';
  private readonly logger = new Logger(GhnCarrierGateway.name);
  private provinceCache: CachedMasterData<GhnProvinceV3[]> | null = null;
  private readonly wardCache = new Map<number, CachedMasterData<GhnWardV3[]>>();

  constructor(@Optional() private readonly config?: ConfigService<Env, true>) {}

  configured(): boolean {
    const token = this.getConfig('GHN_TOKEN')?.trim();
    const shopId = String(this.getConfig('GHN_SHOP_ID') ?? '').trim();
    return Boolean(token && /^\d+$/u.test(shopId) && Number(shopId) > 0);
  }

  private getConfig<K extends keyof Env>(key: K): Env[K] | undefined {
    return this.config?.get(key, { infer: true });
  }

  private credentials(): { apiUrl: string; token: string; shopId: string } {
    if (!this.configured()) {
      throw new ServiceUnavailableException('Chưa cấu hình GHN Sandbox (GHN_TOKEN, GHN_SHOP_ID).');
    }
    const rawUrl = String(this.getConfig('GHN_API_URL') || DEFAULT_GHN_URL);
    return {
      apiUrl: this.trustedUrl(rawUrl).replace(/\/+$/u, ''),
      token: String(this.getConfig('GHN_TOKEN')).trim(),
      shopId: String(this.getConfig('GHN_SHOP_ID')).trim(),
    };
  }

  private trustedUrl(value: string): string {
    const parsed = new URL(value);
    const isTestLocal =
      this.getConfig('NODE_ENV') === 'test' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if (
      !isTestLocal &&
      (parsed.protocol !== 'https:' ||
        !['dev-online-gateway.ghn.vn', 'online-gateway.ghn.vn'].includes(parsed.hostname))
    ) {
      throw new ServiceUnavailableException('URL cổng vận chuyển GHN không hợp lệ.');
    }
    return parsed.toString();
  }

  async createOrder(input: CreateCarrierShipmentInput): Promise<CreateCarrierShipmentResult> {
    const { apiUrl, token, shopId } = this.credentials();
    const resolvedArea = await this.resolveReceiverArea(
      apiUrl,
      token,
      shopId,
      input.province,
      input.commune,
    );

    const totalWeight = Math.max(
      200,
      input.items.reduce(
        (sum, item) => sum + Math.max(100, item.weightGrams) * Math.max(1, item.quantity),
        0,
      ),
    );
    const itemSummary = input.items
      .map((item) => `${item.name} x${item.quantity}`)
      .join(', ')
      .slice(0, 180);

    const fromDistrictId = this.getConfig('GHN_FROM_DISTRICT_ID');
    const fromWardCode = String(this.getConfig('GHN_FROM_WARD_CODE') || '').trim();

    const payload: Record<string, unknown> = {
      payment_type_id: 1, // Tổng đơn đã tính gồm phí ship, shop chịu cước GHN và thu hộ cod_amount nếu COD
      note: `Đơn hàng ${input.orderCode} - F.R.E.Y.A.`,
      required_note: String(this.getConfig('GHN_REQUIRED_NOTE') || 'CHOXEMHANGKHONGTHU'),
      from_name: String(this.getConfig('GHN_FROM_NAME') || 'F.R.E.Y.A. Store'),
      from_phone: String(this.getConfig('GHN_FROM_PHONE') || '0900000000'),
      from_address: String(
        this.getConfig('GHN_FROM_ADDRESS') || '72 Le Thanh Ton, Phuong Ben Nghe',
      ),
      from_ward_name: String(this.getConfig('GHN_FROM_WARD_NAME') || 'Phuong Ben Nghe'),
      from_province_name: String(this.getConfig('GHN_FROM_PROVINCE_NAME') || 'Ho Chi Minh'),
      ...(fromDistrictId ? { from_district_id: Number(fromDistrictId) } : {}),
      ...(fromWardCode ? { from_ward_code: fromWardCode } : {}),
      client_order_code: input.orderCode,
      to_name: input.recipientName,
      to_phone: input.phone,
      to_address: input.detailAddress,
      to_province_name: resolvedArea.provinceName,
      to_ward_name: resolvedArea.wardName,
      is_new_to_address: true,
      cod_amount: Math.max(0, Math.round(input.codAmount)),
      content: itemSummary || `Đơn hàng thời trang ${input.orderCode}`,
      weight: totalWeight,
      length: 30,
      width: 25,
      height: 10,
      insurance_value: Math.min(5_000_000, Math.max(0, Math.round(input.insuranceValue))),
      service_type_id: Number(this.getConfig('GHN_SERVICE_TYPE_ID') || 2),
      items: input.items.map((item) => ({
        name: item.name.slice(0, 120),
        code: item.code.slice(0, 50),
        quantity: item.quantity,
        price: Math.max(0, Math.round(item.price)),
        length: 25,
        width: 20,
        height: 5,
        weight: Math.max(100, item.weightGrams),
      })),
    };

    const json = await this.requestJson<{
      order_code?: string;
      expected_delivery_time?: string;
    }>(`${apiUrl}/v2/shipping-order/create`, {
      method: 'POST',
      token,
      shopId,
      body: payload,
    });

    const trackingNumber = json.data?.order_code?.trim();
    if (!trackingNumber) {
      throw new ServiceUnavailableException('GHN Sandbox không trả về mã vận đơn hợp lệ.');
    }

    return {
      carrierName: 'GHN',
      trackingNumber,
      isMock: false,
      carrierStatus: 'ready_to_pick',
      statusNote: 'Đã tạo vận đơn thành công trên GHN Sandbox, chờ lấy hàng.',
      expectedDeliveryAt: json.data?.expected_delivery_time ?? null,
    };
  }

  async queryOrder(trackingNumber: string): Promise<CarrierStatusEvent | null> {
    const { apiUrl, token, shopId } = this.credentials();
    const encodedCode = encodeURIComponent(trackingNumber.trim());

    let detail: Record<string, unknown> | undefined;
    try {
      const res = await this.requestJson<Record<string, unknown>>(
        `${apiUrl}/v2/shipping-order/detail?order_code=${encodedCode}`,
        { method: 'GET', token, shopId },
      );
      detail = res.data;
    } catch {
      const res = await this.requestJson<Record<string, unknown>>(
        `${apiUrl}/v2/shipping-order/detail`,
        { method: 'POST', token, shopId, body: { order_code: trackingNumber.trim() } },
      );
      detail = res.data;
    }

    if (!detail) return null;
    const rawStatus = readStringField(detail, ['status', 'Status']);
    const mapped = mapGhnStatus(rawStatus);
    if (!mapped) return null;

    const note =
      readStringField(detail, ['reason', 'Reason', 'note', 'Description']) || mapped.defaultNote;

    return {
      trackingNumber: readStringField(detail, ['order_code', 'OrderCode']) || trackingNumber,
      clientOrderCode: readStringField(detail, ['client_order_code', 'ClientOrderCode']),
      status: mapped.status,
      carrierStatus: mapped.carrierStatus,
      note,
      occurredAt: readStringField(detail, ['updated_date', 'UpdatedDate']),
    };
  }

  parseWebhook(raw: Record<string, unknown>): CarrierStatusEvent | null {
    const expectedShopId = String(this.getConfig('GHN_SHOP_ID') ?? '').trim();
    const incomingShopId = raw.ShopID ?? raw.ShopId ?? raw.shop_id;
    if (
      expectedShopId &&
      incomingShopId !== undefined &&
      incomingShopId !== null &&
      String(incomingShopId).trim() !== expectedShopId
    ) {
      this.logger.warn(`Bỏ qua webhook GHN sai ShopID (${String(incomingShopId)})`);
      return null;
    }

    const trackingNumber = readStringField(raw, ['OrderCode', 'order_code', 'trackingNumber']);
    const rawStatus = readStringField(raw, ['Status', 'status']);
    if (!trackingNumber || !rawStatus) return null;

    const mapped = mapGhnStatus(rawStatus);
    if (!mapped) return null;

    const reason = readStringField(raw, ['Reason', 'reason']);
    const description = readStringField(raw, ['Description', 'description', 'note']);

    return {
      trackingNumber,
      clientOrderCode: readStringField(raw, ['ClientOrderCode', 'client_order_code']),
      status: mapped.status,
      carrierStatus: mapped.carrierStatus,
      note: reason || description || mapped.defaultNote,
      occurredAt: readStringField(raw, ['Time', 'time']),
    };
  }

  private async resolveReceiverArea(
    apiUrl: string,
    token: string,
    shopId: string,
    province: string,
    commune: string,
  ): Promise<{ provinceName: string; wardName: string }> {
    try {
      const provinces = await this.fetchV3Provinces(apiUrl, token, shopId);
      const matchedProvince = matchAreaName(
        province,
        provinces,
        (p) => p.province_name ?? p.ProvinceName ?? '',
        (p) => p.name_extensions ?? p.NameExtension ?? [],
      );
      if (matchedProvince) {
        const provinceId = matchedProvince.province_id ?? matchedProvince.ProvinceID;
        const resolvedProvinceName =
          matchedProvince.province_name ?? matchedProvince.ProvinceName ?? province;
        if (provinceId) {
          const wards = await this.fetchV3Wards(apiUrl, token, shopId, provinceId);
          const matchedWard = matchAreaName(
            commune,
            wards,
            (w) => w.ward_name ?? w.WardName ?? '',
            (w) => w.name_extensions ?? w.NameExtension ?? [],
          );
          if (matchedWard) {
            return {
              provinceName: resolvedProvinceName,
              wardName: matchedWard.ward_name ?? matchedWard.WardName ?? commune,
            };
          }
        }
        return { provinceName: resolvedProvinceName, wardName: commune };
      }
    } catch (error) {
      this.logger.warn(
        `Không tra cứu được Master Data GHN v3, dùng trực tiếp tên địa phương (${error instanceof Error ? error.message : 'unknown'}).`,
      );
    }
    return { provinceName: province, wardName: commune };
  }

  private async fetchV3Provinces(
    apiUrl: string,
    token: string,
    shopId: string,
  ): Promise<GhnProvinceV3[]> {
    const now = Date.now();
    if (this.provinceCache && this.provinceCache.expiresAt > now) {
      return this.provinceCache.data;
    }
    const res = await this.requestJson<GhnProvinceV3[]>(
      `${apiUrl}/v3/master-data/province/all?offset=0&limit=200`,
      { method: 'GET', token, shopId },
    );
    const list = Array.isArray(res.data) ? res.data : [];
    if (list.length > 0) {
      this.provinceCache = { expiresAt: now + MASTER_DATA_TTL_MS, data: list };
    }
    return list;
  }

  private async fetchV3Wards(
    apiUrl: string,
    token: string,
    shopId: string,
    provinceId: number,
  ): Promise<GhnWardV3[]> {
    const now = Date.now();
    const cached = this.wardCache.get(provinceId);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }
    const res = await this.requestJson<GhnWardV3[]>(
      `${apiUrl}/v3/master-data/ward/all-by-province-id?province_id=${provinceId}`,
      { method: 'GET', token, shopId },
    );
    const list = Array.isArray(res.data) ? res.data : [];
    if (list.length > 0) {
      this.wardCache.set(provinceId, { expiresAt: now + MASTER_DATA_TTL_MS, data: list });
    }
    return list;
  }

  private async requestJson<T>(
    url: string,
    options: {
      method: 'GET' | 'POST';
      token: string;
      shopId: string;
      body?: Record<string, unknown>;
    },
  ): Promise<GhnEnvelope<T>> {
    let response: Response;
    try {
      response = await fetch(this.trustedUrl(url), {
        method: options.method,
        headers: {
          'Content-Type': 'application/json',
          Token: options.token,
          ShopId: options.shopId,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        `Không thể kết nối GHN Sandbox: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const raw = (await response.json().catch(() => null)) as GhnEnvelope<T> | null;
    if (!response.ok || (raw && typeof raw.code === 'number' && raw.code !== 200)) {
      const reason = raw?.message || `HTTP ${response.status}`;
      throw new ServiceUnavailableException(`GHN Sandbox từ chối hoặc gặp lỗi: ${reason}`);
    }
    return raw ?? { code: 200 };
  }
}

function readStringField(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const val = source[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return undefined;
}

function normalizeVietnamesePlace(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/giu, 'd')
    .toLowerCase()
    .replace(/^(tinh|thanh pho|tp\.?|phuong|xa|thi tran|dac khu)\s+/u, '')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
}

function matchAreaName<T>(
  target: string,
  candidates: T[],
  getName: (item: T) => string,
  getExtensions: (item: T) => string[],
): T | undefined {
  const normTarget = normalizeVietnamesePlace(target);
  if (!normTarget) return undefined;
  return candidates.find((item) => {
    const names = [getName(item), ...getExtensions(item)];
    return names.some((candidate) => normalizeVietnamesePlace(candidate) === normTarget);
  });
}
