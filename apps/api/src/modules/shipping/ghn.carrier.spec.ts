import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../../infra/config/env.js';
import { GhnCarrierGateway } from './ghn.carrier.js';

function makeConfig(values: Partial<Record<keyof Env, unknown>> = {}): ConfigService<Env, true> {
  return {
    get: vi.fn((key: keyof Env) => values[key]),
  } as unknown as ConfigService<Env, true>;
}

describe('GhnCarrierGateway', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('configured() kiểm tra đủ GHN_TOKEN và GHN_SHOP_ID là số nguyên dương', () => {
    expect(new GhnCarrierGateway(makeConfig()).configured()).toBe(false);
    expect(
      new GhnCarrierGateway(makeConfig({ GHN_TOKEN: 'tok', GHN_SHOP_ID: 'abc' })).configured(),
    ).toBe(false);
    expect(
      new GhnCarrierGateway(
        makeConfig({ GHN_TOKEN: 'tok-123', GHN_SHOP_ID: '190001' }),
      ).configured(),
    ).toBe(true);
  });

  it('createOrder giải địa chỉ 2 cấp qua Master Data v3 và gửi is_new_to_address=true', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            data: [{ province_id: 202, province_name: 'Hồ Chí Minh', name_extensions: ['HCM'] }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            data: [
              {
                ward_code: '20101',
                ward_name: 'Phường Bến Nghé',
                name_extensions: ['Ben Nghe'],
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            data: {
              order_code: 'L4GHN888',
              expected_delivery_time: '2026-11-20T09:00:00Z',
            },
          }),
          { status: 200 },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    const gateway = new GhnCarrierGateway(
      makeConfig({
        NODE_ENV: 'test',
        GHN_API_URL: 'https://dev-online-gateway.ghn.vn/shiip/public-api',
        GHN_TOKEN: 'sandbox-tok',
        GHN_SHOP_ID: '190001',
      }),
    );

    const res = await gateway.createOrder({
      orderId: 'o1',
      orderCode: 'FR2611160001',
      carrierName: 'GHN',
      recipientName: 'Nguyễn Văn A',
      phone: '0909123456',
      detailAddress: '72 Lê Thánh Tôn',
      commune: 'Phường Bến Nghé',
      province: 'Thành phố Hồ Chí Minh',
      codAmount: 350000,
      insuranceValue: 350000,
      items: [{ name: 'Áo sơ mi', code: 'v1', quantity: 1, weightGrams: 300, price: 350000 }],
    });

    expect(res.trackingNumber).toBe('L4GHN888');
    expect(res.isMock).toBe(false);
    expect(res.carrierStatus).toBe('ready_to_pick');
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const createCall = fetchMock.mock.calls[2]!;
    const payload = JSON.parse(String(createCall[1]?.body)) as Record<string, unknown>;
    expect(payload.is_new_to_address).toBe(true);
    expect(payload.to_province_name).toBe('Hồ Chí Minh');
    expect(payload.to_ward_name).toBe('Phường Bến Nghé');
    expect(payload.cod_amount).toBe(350000);
  });

  it('createOrder chặn URL giả mạo ngoài whitelist GHN (trừ localhost khi test)', async () => {
    const gateway = new GhnCarrierGateway(
      makeConfig({
        NODE_ENV: 'production',
        GHN_API_URL: 'http://169.254.169.254/latest',
        GHN_TOKEN: 'tok',
        GHN_SHOP_ID: '190001',
      }),
    );

    await expect(
      gateway.createOrder({
        orderId: 'o1',
        orderCode: 'FR1',
        carrierName: 'GHN',
        recipientName: 'A',
        phone: '090',
        detailAddress: '1',
        commune: 'P',
        province: 'HCM',
        codAmount: 0,
        insuranceValue: 0,
        items: [],
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('parseWebhook kiểm tra ShopID khớp cấu hình và ánh xạ đúng trạng thái GHN', () => {
    const gateway = new GhnCarrierGateway(makeConfig({ GHN_SHOP_ID: '190001' }));

    expect(
      gateway.parseWebhook({ ShopID: 999999, OrderCode: 'L4GHN', Status: 'delivering' }),
    ).toBeNull();

    const parsed = gateway.parseWebhook({
      ShopID: 190001,
      OrderCode: 'L4GHN888',
      ClientOrderCode: 'FR2611160001',
      Status: 'delivery_fail',
      Reason: 'Khách hẹn lại ngày giao',
    });

    expect(parsed).toEqual({
      trackingNumber: 'L4GHN888',
      clientOrderCode: 'FR2611160001',
      status: 'FAILED',
      carrierStatus: 'delivery_fail',
      note: 'Khách hẹn lại ngày giao',
      occurredAt: undefined,
    });
  });
});
