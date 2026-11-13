import { describe, expect, it, vi } from 'vitest';

import {
  CloudinaryImageStorage,
  parseCloudinaryUrl,
  signCloudinaryParams,
} from './cloudinary-image-storage.js';

const credentials = { cloudName: 'demo', apiKey: 'key123', apiSecret: 'secret456' };

describe('Cloudinary: ky phieu tai len va doc anh (ADR-055)', () => {
  it('ky dung vi du trong tai lieu Cloudinary (tham so xep theo ten, SHA-1)', () => {
    const signature = signCloudinaryParams(
      {
        timestamp: 1315060510,
        public_id: 'sample_image',
        eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop',
      },
      'abcd',
    );
    expect(signature).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });

  it('doc CLOUDINARY_URL; sai dang thi null', () => {
    expect(parseCloudinaryUrl('cloudinary://key123:secret456@demo')).toEqual(credentials);
    expect(parseCloudinaryUrl('https://demo.cloudinary.com')).toBeNull();
    expect(parseCloudinaryUrl('')).toBeNull();
  });

  it('phieu mot anh: ky public_id, overwrite=false, allowed_formats; doi khoa thi chu ky sai', () => {
    const storage = new CloudinaryImageStorage(credentials);
    const ticket = storage.createUploadTicket('freya/reviews/u1', new Date(1_700_000_000_000));
    expect(ticket.uploadUrl).toBe('https://api.cloudinary.com/v1_1/demo/image/upload');
    expect(ticket.key).toMatch(/^freya\/reviews\/u1\/[0-9a-f]{24}$/);
    expect(ticket.fields).toMatchObject({
      api_key: 'key123',
      timestamp: '1700000000',
      public_id: ticket.key,
      overwrite: 'false',
      allowed_formats: 'jpg,png,webp',
    });
    const signed = {
      allowed_formats: 'jpg,png,webp',
      overwrite: 'false',
      public_id: ticket.key,
      timestamp: '1700000000',
    };
    expect(ticket.fields.signature).toBe(signCloudinaryParams(signed, 'secret456'));
    for (const forged of [
      { ...signed, public_id: 'freya/reviews/u2/x' },
      { ...signed, overwrite: 'true' },
    ]) {
      expect(ticket.fields.signature).not.toBe(signCloudinaryParams(forged, 'secret456'));
    }
    expect(storage.createUploadTicket('freya/reviews/u1').key).not.toBe(ticket.key);
    expect(ticket.fields).not.toHaveProperty('api_secret');
    expect(JSON.stringify(ticket)).not.toContain('secret456');
  });

  it('inspect: 404 la null, 200 doc dinh dang va co, loi khac nem', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(
        Response.json({
          public_id: 'freya/reviews/u1/a',
          format: 'JPG',
          bytes: 1234,
          width: 10,
          height: 20,
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 500 }));
    const storage = new CloudinaryImageStorage(credentials, fetcher as unknown as typeof fetch);
    expect(await storage.inspect('freya/reviews/u1/missing')).toBeNull();
    expect(await storage.inspect('freya/reviews/u1/a')).toEqual({
      key: 'freya/reviews/u1/a',
      format: 'jpg',
      bytes: 1234,
      width: 10,
      height: 20,
    });
    await expect(storage.inspect('freya/reviews/u1/a')).rejects.toThrow('500');
    const [url, init] = fetcher.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(
      'https://api.cloudinary.com/v1_1/demo/resources/image/upload/freya/reviews/u1/a',
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('key123:secret456').toString('base64')}`,
    );
  });

  it('URL phat giu dau / cua thu muc va gan bien doi thu nho', () => {
    const storage = new CloudinaryImageStorage(credentials);
    expect(storage.deliveryUrl('freya/reviews/u1/a b')).toBe(
      'https://res.cloudinary.com/demo/image/upload/c_limit,w_1600,h_1600,f_auto,q_auto/freya/reviews/u1/a%20b',
    );
    expect(storage.thumbnailUrl('freya/reviews/u1/a b')).toBe(
      'https://res.cloudinary.com/demo/image/upload/c_fill,w_160,h_160,f_auto,q_auto/freya/reviews/u1/a%20b',
    );
  });
});

describe('Cloudinary: xoa anh theo lo (ADR-056)', () => {
  const keysOf = (url: string) => new URL(url).searchParams.getAll('public_ids[]');

  it('250 khoa thanh 3 lenh DELETE noi tiep 100, 100, 50; khong gui invalidate', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ deleted: {}, partial: false }));
    const storage = new CloudinaryImageStorage(credentials, fetcher as unknown as typeof fetch);
    const keys = Array.from({ length: 250 }, (_, index) => `freya/reviews/u1/k${index}`);
    await storage.remove(keys);
    const calls = fetcher.mock.calls as [string, RequestInit][];
    expect(calls.map(([url]) => keysOf(url).length)).toEqual([100, 100, 50]);
    expect(calls.flatMap(([url]) => keysOf(url))).toEqual(keys);
    for (const [url, init] of calls) {
      expect(init.method).toBe('DELETE');
      expect(url.startsWith('https://api.cloudinary.com/v1_1/demo/resources/image/upload?')).toBe(
        true,
      );
      expect(new URL(url).searchParams.has('invalidate')).toBe(false);
    }
  });

  it('lo loi thi nem va dung, khong goi lo sau; danh sach rong khong goi kho', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ deleted: {} }))
      .mockResolvedValueOnce(new Response('{}', { status: 420 }));
    const storage = new CloudinaryImageStorage(credentials, fetcher as unknown as typeof fetch);
    const keys = Array.from({ length: 300 }, (_, index) => `freya/reviews/u1/k${index}`);
    await expect(storage.remove(keys)).rejects.toThrow('420');
    expect(fetcher).toHaveBeenCalledTimes(2);
    await storage.remove([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
