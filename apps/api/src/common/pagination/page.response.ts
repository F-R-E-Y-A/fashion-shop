/**
 * Hinh dang tra ve cua MOI duong dan liet ke. Giao dien chi phai hieu dung mot hinh dang nay.
 * Lop response cua tung phan he (vi du ProductListResponse) khai bao lai cac truong nay
 * bang @ApiProperty de Swagger sinh dac ta; toPage() dam bao gia tri luon khop.
 */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PageInput {
  page: number;
  pageSize: number;
}

/** So dong bo qua cho Prisma `skip`. */
export const skipOf = (query: PageInput): number => (query.page - 1) * query.pageSize;

/** totalPages toi thieu la 1 de giao dien khong bao gio hien "trang 1 tren 0". */
export function toPage<T>(items: T[], total: number, query: PageInput): Page<T> {
  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
