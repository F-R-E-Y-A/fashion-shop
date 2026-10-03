import { ascii } from './normalize-vi.js';

/**
 * Ho mau hien thi cho khach. Bang mau nguon co hon 50 ten (yody-*) voi hex trung hoac thieu,
 * nen gom ve 14 ho co hex rieng. `khac` chi danh cho ten khong nhan ra duoc.
 */
export const FAMILIES = {
  den: { label: 'Đen', hex: '#1d1814' },
  trang: { label: 'Trắng', hex: '#f6f3ee' },
  'xanh-duong': { label: 'Xanh dương', hex: '#44709c' },
  navy: { label: 'Navy', hex: '#23304d' },
  'xanh-la': { label: 'Xanh lá', hex: '#66733f' },
  'xanh-ngoc': { label: 'Xanh ngọc', hex: '#76c0b4' },
  hong: { label: 'Hồng', hex: '#d98f9c' },
  nau: { label: 'Nâu', hex: '#7b5337' },
  be: { label: 'Be', hex: '#d9c8a9' },
  vang: { label: 'Vàng', hex: '#dfb84c' },
  xam: { label: 'Xám', hex: '#9c9994' },
  cam: { label: 'Cam', hex: '#d97a3f' },
  do: { label: 'Đỏ', hex: '#a8342c' },
  tim: { label: 'Tím', hex: '#6f4a7e' },
  khac: { label: 'Khác', hex: '#b8aa98' },
} as const;

export type ColorFamily = keyof typeof FAMILIES;

export const COLOR_FAMILY_KEYS = Object.keys(FAMILIES) as ColorFamily[];

export const isColorFamily = (value: string): value is ColorFamily =>
  Object.prototype.hasOwnProperty.call(FAMILIES, value);

// Thu tu quan trong: "xanh den" phai thanh navy truoc khi luat "xanh" bat no thanh xanh duong.
const FAMILY_RULES: Array<[RegExp, ColorFamily]> = [
  [/^(xanh den|xanh tim than|tim than|navy|xanh navy)\b/, 'navy'],
  [/^(xanh ngoc|xanh mint|mint)\b/, 'xanh-ngoc'],
  [/^(xanh la|xanh luc|xanh vo do|xanh reu|reu)\b/, 'xanh-la'],
  [/^xanh\b/, 'xanh-duong'],
  [/^den\b/, 'den'],
  [/^trang\b/, 'trang'],
  [/^hong\b/, 'hong'],
  [/^(nau|cafe|ca phe)\b/, 'nau'],
  [/^(be|kem)\b/, 'be'],
  [/^vang\b/, 'vang'],
  [/^(xam|ghi)\b/, 'xam'],
  [/^cam\b/, 'cam'],
  [/^do\b/, 'do'],
  [/^tim\b/, 'tim'],
];

export function colorFamily(colorName: string): ColorFamily {
  // "Kẻ xanh", "Kẻ đen" la vai ke soc: xep theo mau nen.
  const a = ascii(colorName)
    .trim()
    .replace(/^ke\s+/, '');
  for (const [re, family] of FAMILY_RULES) if (re.test(a)) return family;
  return 'khac';
}
