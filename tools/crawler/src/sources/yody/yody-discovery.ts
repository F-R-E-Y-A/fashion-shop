import { CollectorError, type DiscoveredProduct } from '../../contracts/product-source-adapter.ts';

const YODY_HOSTS = new Set(['yody.vn', 'www.yody.vn']);

function decodeXmlText(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

export function canonicalizeYodyProductUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch (error) {
    throw new CollectorError('INVALID_PRODUCT_URL', `Invalid product URL: ${value}`, {
      cause: error,
    });
  }

  if (!YODY_HOSTS.has(url.hostname.toLowerCase()) || !url.pathname.startsWith('/product/')) {
    throw new CollectorError('INVALID_PRODUCT_URL', `Not a YODY product URL: ${value}`);
  }

  const pathname = url.pathname.replace(/\/+$/, '');
  if (pathname === '/product') {
    throw new CollectorError('INVALID_PRODUCT_URL', `Missing YODY product handle: ${value}`);
  }

  return `https://yody.vn${pathname}`;
}

export function parseYodyProductSitemap(xml: string, limit?: number): DiscoveredProduct[] {
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0)) {
    throw new CollectorError('INVALID_LIMIT', 'Discovery limit must be a positive integer');
  }

  const discovered: DiscoveredProduct[] = [];
  const seen = new Set<string>();
  const locations = xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/giu);

  for (const match of locations) {
    const rawUrl = decodeXmlText(match[1] ?? '');
    let url: string;
    try {
      url = canonicalizeYodyProductUrl(rawUrl);
    } catch (error) {
      if (error instanceof CollectorError && error.code === 'INVALID_PRODUCT_URL') continue;
      throw error;
    }
    if (seen.has(url)) continue;

    seen.add(url);
    discovered.push({ url });
    if (limit !== undefined && discovered.length >= limit) break;
  }

  if (discovered.length === 0) {
    throw new CollectorError(
      'SITEMAP_FORMAT_CHANGED',
      'YODY product sitemap contained no valid product URLs',
      { stopRun: true },
    );
  }

  return discovered;
}
