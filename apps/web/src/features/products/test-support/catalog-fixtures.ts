import type {
  CatalogFacets,
  CategoryNode,
  Product,
  ProductPage,
  SearchInterpretation,
  SuggestResponse,
} from '../api/index.js';

/** Du lieu mau dung chung cho kiem thu giao dien tim kiem va bo loc. */

export const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'Áo Polo Nữ Coolmax',
  slug: 'ao-polo-nu-coolmax',
  description: null,
  price: '89000',
  listPrice: null,
  imageUrl: '/polo.jpg',
  brandName: null,
  categoryName: 'Áo polo',
  categorySlug: 'ao-polo',
  hoverImageUrl: null,
  colorSwatches: [],
  colorCount: 0,
  ...overrides,
});

/** "polo nữ trắng dưới 100k": tu 0 polo, 1 nữ, 2 trắng, 3-4 "dưới 100k". */
export const interpretation: SearchInterpretation = {
  categorySlugs: ['ao-polo'],
  audience: 'nu',
  colorFamilies: ['trang'],
  sizes: [],
  minPrice: null,
  maxPrice: 99999,
  sort: null,
  termGroups: [['polo']],
  ignored: [],
  chips: [
    { kind: 'category', value: 'ao-polo', label: 'Áo polo', source: 'polo', tokens: [0] },
    { kind: 'audience', value: 'nu', label: 'Nữ', source: 'nữ', tokens: [1] },
    { kind: 'color', value: 'trang', label: 'Màu trắng', source: 'trắng', tokens: [2] },
    {
      kind: 'price',
      value: '-99999',
      label: 'Dưới 100.000 ₫',
      source: 'dưới 100k',
      tokens: [3, 4],
    },
  ],
};

export const facets: CatalogFacets = {
  audience: [
    { value: 'nu', count: 9 },
    { value: 'nam', count: 4 },
  ],
  categories: [
    { slug: 'ao', name: 'Áo', parentSlug: null, count: 10 },
    { slug: 'ao-polo', name: 'Áo polo', parentSlug: 'ao', count: 6 },
    { slug: 'quan', name: 'Quần', parentSlug: null, count: 3 },
  ],
  colors: [
    { family: 'den', label: 'Đen', hex: '#1d1814', count: 5 },
    { family: 'trang', label: 'Trắng', hex: '#f6f3ee', count: 7 },
    { family: 'hong', label: 'Hồng', hex: '#d98f9c', count: 0 },
  ],
  sizes: [
    { code: 'S', count: 4 },
    { code: 'M', count: 8 },
  ],
  price: [
    { id: 'duoi-50k', label: 'Dưới 50.000 ₫', min: null, max: 49999, count: 2 },
    { id: '100k-300k', label: '100.000 – 300.000 ₫', min: 100000, max: 299999, count: 5 },
    { id: 'tu-500k', label: 'Từ 500.000 ₫', min: 500000, max: null, count: 0 },
  ],
};

export const productPage = (items: Product[], extra: Partial<ProductPage> = {}): ProductPage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  totalPages: 1,
  ...extra,
});

export const categoryTree: CategoryNode[] = [
  {
    id: 'c-ao',
    name: 'Áo',
    slug: 'ao',
    productCount: 10,
    children: [{ id: 'c-polo', name: 'Áo polo', slug: 'ao-polo', productCount: 6, children: [] }],
  },
  { id: 'c-quan', name: 'Quần', slug: 'quan', productCount: 3, children: [] },
  { id: 'c-rong', name: 'Đồ rỗng', slug: 'do-rong', productCount: 0, children: [] },
];

export const suggestion: SuggestResponse = {
  interpretation,
  total: 6,
  relaxed: [],
  products: [product(), product({ id: 'p2', name: 'Áo Polo Nam', slug: 'ao-polo-nam' })],
  categories: [{ slug: 'ao-polo', name: 'Áo polo', count: 6 }],
  queries: [{ text: 'áo polo nữ', count: 4 }],
};

export const jsonResponse = (body: unknown, status = 200): Response =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

export const errorBody = (statusCode: number, path: string) => ({
  statusCode,
  code: 'ERROR',
  message: 'Loi tam thoi',
  path,
  timestamp: new Date().toISOString(),
});
