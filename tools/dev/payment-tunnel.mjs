import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import { cloudflared } from './cloudflared.mjs';

const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), '../..');
const cache = path.join(
  os.tmpdir(),
  'freya-payment-' + createHash('sha256').update(root).digest('hex').slice(0, 12),
);
const stateFile = path.join(cache, 'connection.json');
const old = JSON.parse(await readFile(stateFile, 'utf8').catch(() => 'null'));
function owned(pid, fragment) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    const args =
      process.platform === 'win32'
        ? execFileSync(
            'powershell.exe',
            [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CommandLine`,
            ],
            { windowsHide: true, encoding: 'utf8' },
          )
        : execFileSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8' });
    return args.includes(fragment);
  } catch {
    return false;
  }
}
if (process.argv.includes('--status')) {
  console.log(
    JSON.stringify({ ...old, running: !!old && owned(old.pid, script), stateFile }, null, 2),
  );
} else if (process.argv.includes('--stop')) {
  if (old && owned(old.childPid, old.binary)) process.kill(old.childPid);
  if (old && owned(old.pid, script)) process.kill(old.pid);
  console.log(
    'Đã dừng tunnel của repo này. URL cũ không còn dùng được; key trong .env được giữ nguyên.',
  );
} else {
  if (old && owned(old.pid, script))
    throw new Error(
      'Tunnel đang chạy. Dùng npm run payment:tunnel:status hoặc payment:tunnel:stop.',
    );
  const envFile = path.join(root, '.env');
  const settings = dotenv.parse(await readFile(envFile, 'utf8'));
  const webPort = settings.WEB_PORT || '5174';
  const binary = await cloudflared();
  await mkdir(cache, { recursive: true });
  const child = spawn(
    binary,
    [
      'tunnel',
      '--no-autoupdate',
      '--protocol',
      'http2',
      '--url',
      `http://127.0.0.1:${webPort}`,
      '--http-host-header',
      `localhost:${webPort}`,
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let configured = false;
  let tail = '';
  let writing = Promise.resolve();
  const configure = async (origin) => {
    const returnUrl = origin + '/thanh-toan/ket-qua';
    const update = {
      VITE_API_URL: '/api',
      CORS_ORIGINS: [
        ...new Set([...(settings.CORS_ORIGINS || 'http://localhost:5174').split(','), origin]),
      ].join(','),
      VNPAY_RETURN_URL: returnUrl,
      MOMO_RETURN_URL: returnUrl,
      MOMO_IPN_URL: origin + '/api/payments/momo/ipn',
    };
    let content = await readFile(envFile, 'utf8');
    for (const [key, value] of Object.entries(update)) {
      const pattern = new RegExp('^' + key + '=.*$', 'm');
      content = pattern.test(content)
        ? content.replace(pattern, key + '=' + value)
        : content.trimEnd() + '\n' + key + '=' + value + '\n';
    }
    for (const key of ['MOMO_PARTNER_CODE', 'MOMO_ACCESS_KEY', 'MOMO_SECRET_KEY'])
      if (!(key in settings)) content = content.trimEnd() + '\n' + key + '=\n';
    await writeFile(envFile, content);
    const state = {
      pid: process.pid,
      childPid: child.pid,
      binary,
      startedAt: new Date().toISOString(),
      websiteUrl: origin,
      returnUrl,
      vnpayIpn: origin + '/api/payments/vnpay/ipn',
      momoIpn: update.MOMO_IPN_URL,
    };
    await writeFile(stateFile, JSON.stringify(state, null, 2));
    console.log(JSON.stringify({ ...state, stateFile }, null, 2));
    console.log(
      'Đã cập nhật URL trong .env, giữ nguyên secret. Khởi động lại API để nhận cấu hình mới.',
    );
    console.log(
      'Mở websiteUrl và đăng nhập trên địa chỉ đó khi thử thanh toán. Giữ tunnel chạy suốt phiên.',
    );
  };
  const output = (chunk) => {
    const text = chunk.toString();
    tail = (tail + text).slice(-16000);
    const origin = tail.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/u)?.[0];
    if (origin && !configured) {
      configured = true;
      writing = configure(origin).catch((error) => {
        console.error(error.message);
        child.kill();
        process.exitCode = 1;
      });
    }
    if (text.includes('Registered tunnel connection')) console.log('TUNNEL_CONNECTED=true');
  };
  child.stdout.on('data', output);
  child.stderr.on('data', output);
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('exit', async (code) => {
    await writing;
    if (!configured || code) {
      console.error(tail);
      process.exitCode = code || 1;
    }
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill());
}
