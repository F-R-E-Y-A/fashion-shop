import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../../infra/config/env.js';
import { GhnCarrierGateway } from './ghn.carrier.js';
import { mapGhnStatus } from './ghn-status.map.js';

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

  it('createOrder giải địa chỉ 2 cấp qua Master Data v3 (_id, name, extension_names) và gửi is_new_to_address=true', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            data: [{ _id: 202, name: 'Hồ Chí Minh', extension_names: ['HCM', 'TP.HCM'] }],
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
                _id: '20101',
                name: 'Phường Bến Nghé',
                extension_names: ['Ben Nghe'],
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
      commune: 'Ben Nghe',
      province: 'TP.HCM',
      codAmount: 350000,
      insuranceValue: 350000,
      items: [{ name: 'Áo sơ mi', code: 'v1', quantity: 1, weightGrams: 300, price: 350000 }],
    });

    expect(res.trackingNumber).toBe('L4GHN888');
    expect(res.isMock).toBe(false);
    expect(res.carrierStatus).toBe('ready_to_pick');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('province_id=202');

    const createCall = fetchMock.mock.calls[2]!;
    const payload = JSON.parse(String(createCall[1]?.body)) as Record<string, unknown>;
    expect(payload.is_new_to_address).toBe(true);
    expect(payload.to_province_name).toBe('Hồ Chí Minh');
    expect(payload.to_ward_name).toBe('Phường Bến Nghé');
    expect(payload.cod_amount).toBe(350000);
  });

  it('queryOrderByClientCode khôi phục trạng thái + updated_date, chỉ trả null khi ORDER_NOT_FOUND/404 và ném lỗi khi HTTP 400 khác (CLIENT_NOT_OWNER_OF_SHOP)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            data: {
              order_code: 'L4GHN777',
              client_order_code: 'FR2611190001',
              status: 'delivered',
              leadtime: '2026-11-22T10:00:00Z',
              updated_date: '2026-11-20T01:05:00Z',
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 400,
            code_message: 'ORDER_NOT_FOUND',
            message: 'ORDER_NOT_FOUND - không tìm thấy đơn hàng',
          }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 400,
            code_message: 'CLIENT_NOT_OWNER_OF_SHOP',
            message: 'Client không thuộc shop này',
          }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 400,
            code_message: '',
            message: 'ORDER_NOT_FOUND - không tìm thấy đơn',
          }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 404,
            code_message: 'SHOP_NOT_FOUND',
            message: 'Shop không tồn tại',
          }),
          { status: 404 },
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

    const recovered = await gateway.queryOrderByClientCode('FR2611190001');
    expect(recovered).toEqual(
      expect.objectContaining({
        trackingNumber: 'L4GHN777',
        isMock: false,
        status: 'DELIVERED',
        carrierStatus: 'delivered',
        expectedDeliveryAt: '2026-11-22T10:00:00Z',
        occurredAt: '2026-11-20T01:05:00Z',
      }),
    );

    const missing = await gateway.queryOrderByClientCode('FR2611199999');
    expect(missing).toBeNull();

    // R2-P1.2: HTTP 400 với code_message=CLIENT_NOT_OWNER_OF_SHOP KHÔNG được coi là "không tìm thấy"
    await expect(gateway.queryOrderByClientCode('FR2611198888')).rejects.toThrow(
      ServiceUnavailableException,
    );

    // code_message rỗng nhưng message chứa ORDER_NOT_FOUND (có dấu gạch dưới) -> nhận là không tìm thấy
    expect(await gateway.queryOrderByClientCode('FR2611197777')).toBeNull();

    // 404 kèm code_message không phải nhóm ORDER_NOT_FOUND (SHOP_NOT_FOUND) -> phải ném lỗi
    await expect(gateway.queryOrderByClientCode('FR2611196666')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('mapGhnStatus giữ picking ở PENDING, chỉ chuyển IN_TRANSIT từ picked, và đưa scrap/cancel vào FAILED thay vì RETURNED', () => {
    expect(mapGhnStatus('picking')?.status).toBe('PENDING');
    expect(mapGhnStatus('money_collect_picking')?.status).toBe('PENDING');
    expect(mapGhnStatus('picked')?.status).toBe('IN_TRANSIT');
    expect(mapGhnStatus('scrap')?.status).toBe('FAILED');
    expect(mapGhnStatus('cancel')?.status).toBe('FAILED');
    expect(mapGhnStatus('returned')?.status).toBe('RETURNED');
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
    expect(gateway.parseWebhook(null as unknown as Record<string, unknown>)).toBeNull();
    expect(gateway.parseWebhook([] as unknown as Record<string, unknown>)).toBeNull();

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
