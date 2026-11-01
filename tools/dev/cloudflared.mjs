import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const version = '2026.10.1';
const checksum = '4d2490e74082c5d48dbfedaf92576fa5bd1702379ab88eb7faa0cfbe8dc891b6';

export async function cloudflared() {
  if (process.env.CLOUDFLARED_BIN) return process.env.CLOUDFLARED_BIN;
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error('Cài cloudflared từ Cloudflare và đặt CLOUDFLARED_BIN tới executable.');
  const directory = path.join(os.tmpdir(), 'freya-dev-tools');
  const filename = path.join(directory, `cloudflared-${version}-windows-amd64.exe`);
  let bytes = await readFile(filename).catch(() => null);
  if (!bytes) {
    console.log(`Tải cloudflared ${version} từ GitHub chính thức của Cloudflare…`);
    const response = await fetch(
      `https://github.com/cloudflare/cloudflared/releases/download/${version}/cloudflared-windows-amd64.exe`,
    );
    if (!response.ok) throw new Error(`Không tải được cloudflared: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== checksum)
      throw new Error('SHA256 cloudflared không khớp bản phát hành.');
    await mkdir(directory, { recursive: true });
    await writeFile(filename, bytes);
  }
  if (createHash('sha256').update(bytes).digest('hex') !== checksum)
    throw new Error('Executable cloudflared trong cache không hợp lệ.');
  return filename;
}
