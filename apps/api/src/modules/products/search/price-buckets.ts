/**
 * Moc gia cho bo loc. Chi dung de dem (facet) va dat nhan; bo loc that dung minPrice/maxPrice.
 * Doi tuong 29/09/2026: 79 san pham duoi 100k, 5 trong 100-300k, 2 trong 300-500k, 1 tren 500k.
 */
export interface PriceBucket {
  id: string;
  label: string;
  min: number | null;
  max: number | null;
}

export const PRICE_BUCKETS: readonly PriceBucket[] = [
  { id: 'duoi-50k', label: 'Dưới 50.000 ₫', min: null, max: 49999 },
  { id: '50k-100k', label: '50.000 – 100.000 ₫', min: 50000, max: 99999 },
  { id: '100k-300k', label: '100.000 – 300.000 ₫', min: 100000, max: 299999 },
  { id: '300k-500k', label: '300.000 – 500.000 ₫', min: 300000, max: 499999 },
  { id: 'tu-500k', label: 'Từ 500.000 ₫', min: 500000, max: null },
];

const priceFormat = new Intl.NumberFormat('vi-VN');

/** Chi de dat nhan chip ("Dưới 100.000 ₫"); giao dien khong tu tinh lai gia. */
export const formatPrice = (n: number): string => `${priceFormat.format(n)} ₫`;
