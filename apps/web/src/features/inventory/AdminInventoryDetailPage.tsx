import { Link, useParams, useSearchParams } from 'react-router-dom';

import { formatDateTime } from '@/core';
import { AdminForbidden, useAuth } from '@/features/account';
import { ErrorNote, Loading, Pager } from '@/ui';

import {
  type InventoryDetail,
  inventoryKeys,
  movementLabel,
  quantity,
  readPage,
} from './inventory.api.js';
import styles from './Inventory.module.css';
import { inventoryError, useInventory } from './use-inventory.js';

export function AdminInventoryDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = readPage(params.get('page'));
  const returnPage = readPage(params.get('returnPage'));
  const { query, data, forbidden } = useInventory<InventoryDetail>(
    inventoryKeys.detail(user?.id ?? '', id, page),
    `/admin/inventory/${encodeURIComponent(id)}?page=${page}`,
  );
  if (forbidden) return <AdminForbidden />;
  return (
    <div className={styles.page}>
      <Link className={styles.back} to={`/admin/inventory?page=${returnPage}`}>
        ← Về tồn kho
      </Link>
      <header className={styles.header}>
        <h1 className={styles.title}>Chi tiết tồn kho</h1>
      </header>
      <button
        type="button"
        className={styles.refresh}
        disabled={query.isFetching}
        onClick={() => void query.refetch()}
      >
        {query.isFetching ? 'Đang cập nhật…' : 'Cập nhật dữ liệu'}
      </button>
      {query.isPending && <Loading label="Đang tải chi tiết tồn kho…" />}
      {query.isError && (
        <ErrorNote label={inventoryError(query.error)} onRetry={() => void query.refetch()} />
      )}
      {data && (
        <>
          <section className={styles.panel} aria-label="Thông tin biến thể">
            <h2>{data.productName}</h2>
            <p>
              {data.colorName} / {data.sizeCode} · SKU: {data.sku}
            </p>
            <dl className={styles.quantities}>
              <div>
                <dt>Tồn vật lý</dt>
                <dd>{quantity(data.quantityOnHand)}</dd>
              </div>
              <div>
                <dt>Đang giữ</dt>
                <dd>{quantity(data.reservedQuantity)}</dd>
              </div>
              <div>
                <dt>Khả dụng</dt>
                <dd>{quantity(data.availableQuantity)}</dd>
              </div>
            </dl>
            <p className={styles.note}>
              Dữ liệu lúc {formatDateTime(data.asOf)}. Đang giữ chỉ gồm hàng chưa nhả và chưa hết
              hạn. Tự cập nhật mỗi 30 giây.
            </p>
          </section>
          <section aria-labelledby="movement-title">
            <h2 id="movement-title">Lịch sử biến động</h2>
            <p className={styles.note}>
              Lịch sử ghi thay đổi tồn vật lý; thao tác giữ/nhả hàng không phải biến động tồn vật
              lý. Chưa có số dư sau từng lần thay đổi.
            </p>
            {data.movements.items.length ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Thời điểm</th>
                      <th scope="col">Loại biến động</th>
                      <th scope="col">Thay đổi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.movements.items.map((row) => (
                      <tr key={row.id}>
                        <td data-label="Thời điểm">{formatDateTime(row.createdAt)}</td>
                        <td data-label="Loại biến động">{movementLabel(row.movementType)}</td>
                        <td data-label="Thay đổi">
                          {row.quantityDelta > 0 ? '+' : ''}
                          {row.quantityDelta.toLocaleString('vi-VN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p role="status">
                {data.movements.total
                  ? 'Trang này không có biến động.'
                  : 'Chưa có biến động tồn kho.'}
              </p>
            )}
            <Pager
              page={page}
              totalPages={data.movements.totalPages}
              total={data.movements.total}
              unit="biến động"
              onChange={(next) => setParams({ page: String(next), returnPage: String(returnPage) })}
            />
          </section>
        </>
      )}
    </div>
  );
}
