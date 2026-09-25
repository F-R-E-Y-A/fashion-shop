import type {
  DiscoveryOptions,
  FetchResult,
  ProductSourceAdapter,
} from '../../contracts/product-source-adapter.ts';
import type { RawSourceProduct } from '../../contracts/raw-product.ts';
import { parseYodyProductSitemap } from './yody-discovery.ts';
import { fetchTextWithPolicy } from './yody-fetch.ts';
import { parseYodyProductHtml } from './yody-parser.ts';

const PRODUCT_SITEMAP = 'https://yody.vn/sitemap_products_1.xml';

export class YodySourceAdapter implements ProductSourceAdapter {
  readonly source = 'YODY';
  readonly discoveryUrl = PRODUCT_SITEMAP;

  async discover(options: DiscoveryOptions = {}) {
    const result = await fetchTextWithPolicy(this.discoveryUrl);
    return parseYodyProductSitemap(result.body, options.limit);
  }

  fetch(url: string): Promise<FetchResult> {
    return fetchTextWithPolicy(url);
  }

  parse(html: string, sourceUrl: string): RawSourceProduct {
    return parseYodyProductHtml(html, sourceUrl);
  }
}
