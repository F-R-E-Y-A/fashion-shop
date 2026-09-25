import { useQuery } from '@tanstack/react-query';

import { Loading } from '@/ui';

import { listProducts, productKeys } from '../api/index.js';

/**
 * Man quan tri toi gian cua phan he san pham.
 *
 * Theo luat chia viec: moi nguoi tu lam man quan tri cua chinh nhung bang minh so huu,
 * va dat no trong feature cua minh, khong gom thanh mot feature "admin" chung.
 * Man day du (them, sua, an san pham) thuoc nhom use case UC-04, chua giao dong viec.
 */
export function AdminProductsPage() {
  const params = { page: 1, pageSize: 1 };
  const { data, isPending } = useQuery({
    queryKey: productKeys.list(params),
    queryFn: () => listProducts(params),
  });

  if (isPending) return <Loading />;

  return (
    <div className="tiles">
      <div className="tile">
        <span className="tile__label">Sản phẩm đang bán</span>
        <strong className="tile__value">{data?.total ?? '—'}</strong>
      </div>
    </div>
  );
}
