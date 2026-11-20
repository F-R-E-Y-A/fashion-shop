import 'reflect-metadata';

import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';

import { Test } from '@nestjs/testing';

import { AppModule } from '../../dist/app.module.js';
import { configureApp } from '../../dist/app.setup.js';
import { MailService } from '../../dist/infra/mail/mail.service.js';
import { ImageStorage } from '../../dist/infra/storage/image-storage.js';

class E2eFakeImageStorage extends ImageStorage {
  enabled = true;
  images = new Map();
  blobs = new Map();
  uploadBaseUrl = '';

  setUploadBaseUrl(url) {
    this.uploadBaseUrl = url;
  }

  createUploadTicket(folder, now = new Date()) {
    const key = `${folder}/${randomBytes(8).toString('hex')}`;
    return {
      uploadUrl: `${this.uploadBaseUrl}/upload`,
      fields: { public_id: key, signature: 'e2e-fake-signature' },
      key,
      expiresAt: new Date(now.getTime() + 3_600_000).toISOString(),
    };
  }

  inspect(key) {
    return Promise.resolve(this.images.get(key) ?? null);
  }

  deliveryUrl(key) {
    return `${this.uploadBaseUrl}/files/${encodeURIComponent(key)}`;
  }

  thumbnailUrl(key) {
    return `${this.uploadBaseUrl}/files/${encodeURIComponent(key)}`;
  }

  remove(keys) {
    for (const key of keys) {
      this.images.delete(key);
      this.blobs.delete(key);
    }
    return Promise.resolve();
  }

  putBlob(key, data, format) {
    this.blobs.set(key, { data, format });
    this.images.set(key, { key, format, bytes: data.length, width: 1, height: 1 });
  }
}

function contentTypeToFormat(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

function formatToMime(format) {
  if (format === 'png') return 'image/png';
  if (format === 'webp') return 'image/webp';
  return 'image/jpeg';
}

async function handleUploadRequest(req, res, storage) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqPath = req.url ?? '/';
  if (req.method === 'POST' && reqPath === '/upload') {
    const contentType = req.headers['content-type'] ?? '';
    const formData = await new Response(Readable.toWeb(req), {
      headers: { 'content-type': contentType },
    }).formData();
    const publicId = String(formData.get('public_id') ?? '').trim();
    const file = formData.get('file');
    if (!publicId || !(file instanceof Blob)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'INVALID_MULTIPART_UPLOAD' }));
      return;
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const format = contentTypeToFormat(file.type);
    storage.putBlob(publicId, buf, format);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ public_id: publicId, format, bytes: buf.length }));
    return;
  }

  if (req.method === 'GET' && reqPath.startsWith('/files/')) {
    const key = decodeURIComponent(reqPath.slice('/files/'.length));
    const blob = storage.blobs.get(key);
    if (!blob) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': formatToMime(blob.format),
      'Cache-Control': 'no-store',
    });
    res.end(blob.data);
    return;
  }

  res.writeHead(404);
  res.end();
}

async function main() {
  if (process.env.NODE_ENV !== 'test' || !process.env.DATABASE_URL) {
    throw new Error('fake-storage-api chi chay trong NODE_ENV=test voi DATABASE_URL test.');
  }

  const storage = new E2eFakeImageStorage();
  const uploadServer = createServer((req, res) => {
    void handleUploadRequest(req, res, storage).catch(() => {
      res.writeHead(500);
      res.end();
    });
  });

  await new Promise((resolve) => uploadServer.listen(0, '127.0.0.1', resolve));
  const addr = uploadServer.address();
  const uploadPort = typeof addr === 'object' && addr ? addr.port : 0;
  storage.setUploadBaseUrl(`http://127.0.0.1:${uploadPort}`);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue({ send: () => Promise.resolve() })
    .overrideProvider(ImageStorage)
    .useValue(storage)
    .compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  const apiPort = Number(process.env.API_PORT || process.env.PORT || 3102);
  await app.listen(apiPort, '127.0.0.1');
  process.stdout.write(`E2E_FAKE_STORAGE_READY:${apiPort}:${uploadPort}\n`);

  const shutdown = async () => {
    await app.close();
    uploadServer.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
