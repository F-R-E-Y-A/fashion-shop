import { Link, useSearchParams } from 'react-router-dom';

import { formatDateTime } from '@/core';
import { AdminForbidden, useAuth } from '@/features/account';
import { ErrorNote, Loading, Pager } from '@/ui';

import { inventoryKeys, type InventoryPage, quantity, readPage } from './inventory.api.js';
import styles from './Inventory.module.css';
import { inventoryError, useInventory } from './use-inventory.js';

export function AdminInventoryPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = readPage(params.get('page'));
  const { query, data, forbidden } = useInventory<InventoryPage>(
    inventoryKeys.list(user?.id ?? '', page),
    `/admin/inventory?page=${page}`,
  );
  if (forbidden) return <AdminForbidden />;
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Quản lý tồn kho</h1>
        <p>
          Tồn theo biến thể, bao gồm sản phẩm ngừng bán. Chưa nhập tồn không đồng nghĩa hết hàng.
        </p>
      </header>
      <button
        type="button"
        className={styles.refresh}
        disabled={query.isFetching}
        onClick={() => void query.refetch()}
      >
        {query.isFetching ? 'Đang cập nhật…' : 'Cập nhật dữ liệu'}
      </button>
      {query.isPending && <Loading label="Đang tải tồn kho…" />}
      {query.isError && (
        <ErrorNote label={inventoryError(query.error)} onRetry={() => void query.refetch()} />
      )}
      {data && (
        <>
          <p className={styles.note}>
            Dữ liệu lúc {formatDateTime(data.asOf)} · {data.total.toLocaleString('vi-VN')} biến thể.
            Tự cập nhật mỗi 30 giây.
          </p>
          {data.items.length ? (
            <div className={styles.tableWrap} aria-busy={query.isFetching}>
              <table className={styles.table}>
                <caption className={styles.caption}>
                  Tồn vật lý, lượng đang giữ và lượng có thể bán
                </caption>
                <thead>
                  <tr>
                    {['Biến thể', 'SKU', 'Tồn vật lý', 'Đang giữ', 'Khả dụng'].map((label) => (
                      <th key={label} scope="col">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.id}>
                      <td data-label="Biến thể">
                        <Link
                          className={styles.link}
                          to={`/admin/inventory/${row.id}?returnPage=${page}`}
                        >
                          {row.productName} · {row.colorName} / {row.sizeCode}
                        </Link>
                      </td>
                      <td data-label="SKU">{row.sku}</td>
                      <td data-label="Tồn vật lý">{quantity(row.quantityOnHand)}</td>
                      <td data-label="Đang giữ">{quantity(row.reservedQuantity)}</td>
                      <td data-label="Khả dụng">{quantity(row.availableQuantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p role="status">
              {data.total
                ? 'Trang này không có biến thể. Chọn trang trước để tiếp tục.'
                : 'Chưa có biến thể sản phẩm.'}
            </p>
          )}
          <Pager
            page={page}
            totalPages={data.totalPages}
            total={data.total}
            unit="biến thể"
            onChange={(next) => setParams({ page: String(next) })}
          />
        </>
      )}
    </div>
  );
}
