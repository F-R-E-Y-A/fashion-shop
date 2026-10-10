/** Chu co dinh cua trang chu. Chep dung tu ban mau thiet ke (design/README.md muc 6). */

export const HERO = {
  sub: 'Thời trang cho nam và nữ, dành cho những lần xuất hiện mang dấu ấn riêng.',
  placeholder: 'polo nữ trắng dưới 100k',
  imageAlt: 'Người mẫu mặc sơ mi lụa kem và quần tây ống rộng đi trong nắng chiều',
  /** Kich thuoc that cua hero.webp, de trinh duyet giu cho truoc khi anh tai xong. */
  width: 1672,
  height: 941,
} as const;

export const HERO_HINTS = [
  'Sơ mi trắng đi làm',
  'Polo nữ thoáng mát dưới 100k',
  'Quần tây nữ ống rộng',
  'Áo khoác nam',
] as const;

export const MARQUEE_ITEMS = [
  'Polo',
  'Sơ mi',
  'Quần tây',
  'Áo thun',
  'Áo khoác',
  'Jeans',
  'Quần short',
  'Thắt lưng',
] as const;

/** Anh danh muc goc theo slug; danh muc khac khong co anh thi hien nen espresso. */
export const CATEGORY_IMAGES: Record<string, { src: string; alt: string }> = {
  ao: {
    src: '/images/home/category-ao.webp',
    alt: 'Chân dung người mẫu mặc sơ mi lụa kem trong ánh chiều',
  },
  quan: {
    src: '/images/home/category-quan.webp',
    alt: 'Quần tây ống rộng màu than cùng bộ với sơ mi kem',
  },
  'phu-kien': {
    src: '/images/home/category-phu-kien.webp',
    alt: 'Túi xách da đen đặt cạnh dải lụa hổ phách',
  },
};

export const OCCASIONS = [
  { title: 'Công sở', q: 'đồ đi làm công sở', line: 'Sơ mi, quần tây, polo gọn gàng' },
  { title: 'Ngày hè', q: 'áo mát mẻ mùa hè', line: 'Thoáng khí, thấm hút, tay ngắn' },
  { title: 'Thể thao', q: 'đồ thể thao', line: 'Airycool, Coolmax, thấm hút' },
  { title: 'Cuối tuần', q: 'dạo phố cuối tuần', line: 'Áo thun, jeans, dáng baggy' },
] as const;

/** Mo ta chat lieu bam mo ta that trong Catalog; khong them y nao ngoai do. */
export const MATERIALS = [
  {
    name: 'Cotton',
    q: 'cotton',
    line: 'Mềm, thấm hút, thoáng mát. Có cả cotton organic trong Catalog.',
  },
  {
    name: 'Pique mắt chim',
    q: 'pique',
    line: 'Mặt vải dệt nổi hạt nhỏ, hay gặp ở áo polo, pha cotton, polyester và spandex.',
  },
  {
    name: 'Airycool',
    q: 'airycool',
    line: 'Vải thế hệ mới, thoáng khí và thấm hút tốt cho mùa hè.',
  },
  { name: 'Lụa', q: 'lụa', line: 'Mặt vải mịn, sáng bóng nhẹ như lụa; giữ phom, ít nhăn.' },
] as const;

/** Duong dan tim kiem cho mot cau. */
export const searchLink = (q: string) => `/tim-kiem?q=${encodeURIComponent(q)}`;
