import { ascii, lower } from './normalize-vi.js';

/**
 * Tu dien cua bo hieu truy van. Moi cum tu co ban viet CO DAU. Khach go co dau thi so khop ban
 * co dau; go khong dau thi so khop ban khong dau. `accentOnly` danh dau cum mot tu ma ban khong
 * dau trung voi tu khac nghia ("đỏ" va "đồ" deu thanh "do", "mát" va "mắt" deu thanh "mat"):
 * cum do chi duoc nhan khi khach go co dau.
 */
export type DictDim =
  'stop' | 'audience' | 'color' | 'category' | 'style' | 'occasion' | 'sort' | 'term';

export interface DictEntry {
  dim: DictDim;
  value: string;
  label: string;
  /** So tu cua cum. */
  len: number;
  low: string[];
  asc: string[];
  accentOnly: boolean;
  /** Nhom tu bat buoc cho style, occasion, term; khop mot tu trong nhom la du. */
  terms: string[] | null;
}

interface EntryOptions {
  accentOnly?: string[];
  terms?: string[];
}

function entriesOf(
  dim: DictDim,
  value: string,
  label: string,
  phrases: string[],
  opt: EntryOptions = {},
): DictEntry[] {
  return phrases.map((phrase) => {
    const parts = phrase.split(' ');
    return {
      dim,
      value,
      label,
      len: parts.length,
      low: parts.map(lower),
      asc: parts.map(ascii),
      accentOnly: (opt.accentOnly ?? []).includes(phrase),
      terms: opt.terms ?? null,
    };
  });
}

const BASE_DICT: DictEntry[] = [];
const add = (
  dim: DictDim,
  value: string,
  label: string,
  phrases: string[],
  opt: EntryOptions = {},
): void => {
  BASE_DICT.push(...entriesOf(dim, value, label, phrases, opt));
};

add('stop', '', '', ['thời trang', 'sản phẩm', 'phù hợp', 'như thế nào', 'bất kỳ']);

add('audience', 'nu', 'Nữ', [
  'nữ',
  'cho nữ',
  'phụ nữ',
  'con gái',
  'bạn gái',
  'cho nàng',
  'nàng',
  'chị em',
]);
add('audience', 'nam', 'Nam', [
  'nam',
  'cho nam',
  'đàn ông',
  'con trai',
  'bạn trai',
  'cho chàng',
  'chàng',
]);

add('color', 'den', 'Màu đen', ['đen', 'màu đen', 'black']);
add('color', 'trang', 'Màu trắng', ['trắng', 'màu trắng', 'white', 'trắng kem']);
add('color', 'navy', 'Màu navy', ['navy', 'tím than', 'xanh navy', 'xanh đen', 'xanh tím than']);
add('color', 'xanh-la', 'Xanh lá', ['xanh lá', 'xanh lá cây', 'rêu', 'xanh rêu', 'green']);
add('color', 'xanh-ngoc', 'Xanh ngọc', ['xanh ngọc', 'xanh mint', 'mint']);
add('color', 'xanh-duong', 'Xanh dương', [
  'xanh dương',
  'xanh',
  'xanh biển',
  'xanh coban',
  'xanh da trời',
  'xanh trời',
  'xanh lơ',
  'blue',
]);
add('color', 'hong', 'Màu hồng', ['hồng', 'màu hồng', 'pink', 'hồng đất']);
add('color', 'nau', 'Màu nâu', ['nâu', 'màu nâu', 'brown', 'màu cafe', 'cà phê']);
add('color', 'be', 'Màu be', ['be', 'màu be', 'kem', 'beige']);
add('color', 'vang', 'Màu vàng', ['vàng', 'màu vàng', 'yellow']);
add('color', 'xam', 'Màu xám', ['xám', 'ghi', 'màu ghi', 'màu xám', 'grey', 'gray']);
add('color', 'cam', 'Màu cam', ['cam', 'màu cam', 'orange']);
add('color', 'do', 'Màu đỏ', ['đỏ', 'đỏ đô', 'màu đỏ', 'red'], { accentOnly: ['đỏ'] });
add('color', 'tim', 'Màu tím', ['tím', 'màu tím', 'purple'], { accentOnly: ['tím'] });

// Slug cua cay danh muc da seed (prisma/seed/catalog.seed.ts). Danh muc moi thi them dong o day.
add('category', 'ao-so-mi', 'Áo sơ mi', ['áo sơ mi', 'sơ mi', 'somi', 'sơmi', 'shirt']);
add('category', 'ao-thun', 'Áo thun', [
  'áo thun',
  'áo phông',
  'thun',
  'phông',
  't-shirt',
  'tshirt',
  'áo tee',
]);
add('category', 'ao-khoac', 'Áo khoác', ['áo khoác', 'khoác', 'áo gió', 'jacket']);
add('category', 'quan-short', 'Quần short', [
  'quần short',
  'quần đùi',
  'quần sooc',
  'quần shorts',
  'short',
  'shorts',
  'quần ngắn',
]);
add('category', 'quan-dai', 'Quần dài', ['quần dài']);
add('category', 'that-lung', 'Thắt lưng', ['thắt lưng', 'dây lưng', 'dây nịt', 'belt']);
add('category', 'mu', 'Mũ', ['mũ', 'nón', 'mũ lưỡi trai']);
add('category', 'ao', 'Áo', ['áo']);
add('category', 'quan', 'Quần', ['quần']);
add('category', 'phu-kien', 'Phụ kiện', ['phụ kiện']);

// Kieu dang khong phai danh muc trong DB (polo nam trong "Ao thun"), nen la mot nhom tu bat buoc.
add('style', 'polo', 'Kiểu polo', ['áo polo', 'polo', 'pôlô'], { terms: ['polo'] });
add('style', 'quan-tay', 'Quần tây', ['quần tây', 'quần âu', 'quần công sở', 'quần vải'], {
  terms: ['quần tây', 'quần âu'],
});
add('style', 'jeans', 'Jeans', ['quần jeans', 'quần jean', 'quần bò', 'jeans', 'jean', 'denim'], {
  terms: ['jeans', 'jean'],
});
add('style', 'airycool', 'Airycool', ['airycool', 'airy cool'], {
  terms: ['airycool', 'airy cool'],
});

// Dip mac: cum tu kich hoat mot nhom tu mo rong, khop mot tu trong nhom la du.
add(
  'occasion',
  'cong-so',
  'Dịp: công sở',
  ['đi làm', 'công sở', 'văn phòng', 'đi họp', 'thanh lịch', 'lịch sự'],
  { terms: ['sơ mi', 'công sở', 'quần tây', 'quần âu', 'polo', 'thanh lịch'] },
);
add(
  'occasion',
  'mua-he',
  'Dịp: ngày hè',
  ['mùa hè', 'mát mẻ', 'thoáng mát', 'ngày hè', 'trời nóng', 'đi biển', 'mùa nóng', 'mát'],
  {
    accentOnly: ['mát'],
    terms: [
      'thoáng',
      'thấm hút',
      'airycool',
      'airy cool',
      'coolmax',
      'tay ngắn',
      'lụa',
      'short',
      'mát',
      'cool',
    ],
  },
);
add(
  'occasion',
  'the-thao',
  'Dịp: thể thao',
  ['thể thao', 'tập gym', 'gym', 'chạy bộ', 'vận động', 'tập luyện'],
  {
    terms: ['thể thao', 'airycool', 'airy cool', 'coolmax', 'performance', 'thấm hút'],
  },
);
add(
  'occasion',
  'cuoi-tuan',
  'Dịp: cuối tuần',
  ['cuối tuần', 'dạo phố', 'đi chơi', 'năng động', 'cá tính', 'đi cafe', 'đi cà phê'],
  {
    terms: [
      'thun',
      'phông',
      'jeans',
      'short',
      'baggy',
      'in hình',
      'in chữ',
      'năng động',
      'cá tính',
    ],
  },
);
add('occasion', 'chong-nang', 'Chống nắng', ['chống nắng', 'chống tia uv', 'chống uv', 'uv'], {
  terms: ['chống tia uv', 'uv', 'chống nắng'],
});
add('occasion', 'khu-mui', 'Khử mùi', ['khử mùi', 'kháng khuẩn', 'không mùi'], {
  terms: ['khử mùi', 'kháng khuẩn'],
});
add(
  'occasion',
  'dang-rong',
  'Dáng rộng',
  ['rộng', 'dáng rộng', 'oversize', 'thoải mái', 'rộng rãi', 'suông', 'dáng suông'],
  { terms: ['suông', 'ống rộng', 'baggy', 'oversize', 'rộng'] },
);
add('occasion', 'dang-om', 'Dáng ôm', ['ôm', 'ôm dáng', 'slim', 'slimfit', 'tôn dáng', 'body'], {
  terms: ['slimfit', 'slim', 'ôm', 'tôn dáng'],
});

add('sort', 'price_asc', 'Rẻ trước', [
  'rẻ nhất',
  'giá rẻ',
  'rẻ',
  'bình dân',
  'tiết kiệm',
  'giá tốt',
]);
add('sort', 'price_desc', 'Đắt trước', ['đắt nhất', 'cao cấp', 'giá cao']);
add('sort', 'newest', 'Mới nhất', ['mới nhất', 'mới về', 'hàng mới', 'mới ra', 'mới']);

// Cum tu mo ta phai giu nguyen cum, neu tach ra thi "lưng thun" thanh danh muc Ao thun.
for (const phrase of [
  'lưng thun',
  'mắt chim',
  'cổ tròn',
  'cổ bẻ',
  'tay ngắn',
  'tay dài',
  'tay lỡ',
  'lưng cao',
  'ống rộng',
  'ống đứng',
  'in hình',
  'kẻ sọc',
  'da bò',
  'cổ nơ',
  'không tay',
  'xẻ tà',
]) {
  add('term', phrase, `“${phrase}”`, [phrase], { terms: [phrase] });
}

/**
 * Dip mac them tu bang search_configurations, khoa "synonyms.v1":
 * { "occasions": [{ "value": "dam-cuoi", "label": "Dịp: đám cưới", "triggers": ["đám cưới"], "terms": ["sơ mi", "lụa"] }] }
 */
export interface ExtraOccasion {
  value: string;
  label: string;
  triggers: string[];
  terms: string[];
}

const isNonEmptyStrings = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((item) => typeof item === 'string' && item.trim() !== '');

export function isExtraOccasion(value: unknown): value is ExtraOccasion {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.value === 'string' &&
    o.value !== '' &&
    typeof o.label === 'string' &&
    isNonEmptyStrings(o.triggers) &&
    isNonEmptyStrings(o.terms)
  );
}

/** Muc sai hinh dang bi bo qua; tu dien trong ma luon con nguyen. Cum dai duoc xet truoc cum ngan. */
export function buildDictionary(extraOccasions: unknown[] = []): DictEntry[] {
  const list = [...BASE_DICT];
  for (const o of extraOccasions) {
    if (!isExtraOccasion(o)) continue;
    list.push(
      ...entriesOf(
        'occasion',
        o.value,
        o.label,
        o.triggers.map((t) => lower(t).trim()),
        { terms: o.terms.map((t) => lower(t).trim()) },
      ),
    );
  }
  return list.sort((a, b) => b.len - a.len);
}

export const DEFAULT_DICTIONARY: readonly DictEntry[] = buildDictionary();

const STOP = [
  'tôi',
  'mình',
  'em',
  'anh',
  'chị',
  'muốn',
  'cần',
  'tìm',
  'kiếm',
  'mua',
  'cho',
  'một',
  'cái',
  'chiếc',
  'bộ',
  'đồ',
  'mặc',
  'đi',
  'để',
  'với',
  'và',
  'hoặc',
  'có',
  'màu',
  'giá',
  'loại',
  'kiểu',
  'hàng',
  'nào',
  'gì',
  'nhé',
  'ạ',
  'ơi',
  'đẹp',
  'xinh',
  'size',
  'cỡ',
  'sz',
  'số',
  'hợp',
  'ngày',
  'lúc',
  'khi',
  'những',
  'các',
  'là',
  'rất',
  'thật',
  'trong',
  'của',
  'nhất',
  'hơn',
  'dáng',
  'vải',
  'chất',
  'mẫu',
  'nhiều',
  'nên',
  'được',
  'ra',
  'về',
];
// Ban khong dau cua cac tu nay trung tu co nghia (cỡ/cổ, bộ/bò, tìm/tím, để/đế, số/sơ, vải/vai),
// nen chi coi la tu dung khi khach go co dau.
const AMBIGUOUS_ASCII = new Set(['co', 'bo', 'tim', 'de', 'so', 'vai']);
const STOP_ACCENT = new Set(STOP.map(lower));
const STOP_ASCII = new Set(STOP.map(ascii).filter((w) => !AMBIGUOUS_ASCII.has(w)));

/** `low` la ban chu thuong co dau; `asc` la ban khong dau cua cung mot tu. */
export const isStopWord = (hasAccentForm: boolean, low: string, asc: string): boolean =>
  hasAccentForm ? STOP_ACCENT.has(low) : STOP_ASCII.has(asc);
