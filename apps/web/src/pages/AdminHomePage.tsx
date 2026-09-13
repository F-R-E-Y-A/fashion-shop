import { useQuery } from '@tanstack/react-query';

import { apiGet, type ProductList } from '../lib/api';

/**
 * Trang quan tri toi gian, chi de chung minh khung quan tri chay duoc.
 * Cac man quan tri that nam trong phan he cua tung nguoi, theo bang chia viec.
 */
export function AdminHomePage() {
  const { data } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => apiGet<ProductList>('/products', { page: 1, pageSize: 1 }),
  });

  return (
    <>
      <h1>Tổng quan</h1>
      <div className="tiles">
        <div className="tile">
          <span className="tile__label">Sản phẩm đang bán</span>
          <strong className="tile__value">{data ? data.total : '—'}</strong>
        </div>
      </div>
      <p className="state">
        Khung quản trị đã chạy. Mỗi người tự thêm màn quản trị của phân hệ mình phụ trách,
        theo cột Quản trị trong bảng chia việc.
      </p>
    </>
  );
}
