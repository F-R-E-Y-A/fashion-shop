import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { apiGet, formatPrice, type ProductList } from '../lib/api';

/**
 * Trang mau: goi that vao module mau ben may chu.
 *
 * Day la khuon de hai ban chep theo. Ba trang thai deu phai co mat:
 * dang tai, loi, va khong co du lieu. Thieu mot trong ba la thieu.
 */
export function ProductListPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['products', { page, search }],
    queryFn: () => apiGet<ProductList>('/products', { page, pageSize: 12, search }),
  });

  return (
    <>
      <h1>Sản phẩm</h1>

      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
        }}
      >
        <input
          type="search"
          value={search}
          placeholder="Tìm theo tên sản phẩm"
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="submit">Tìm</button>
      </form>

      {isPending && <p className="state">Đang tải...</p>}

      {isError && (
        <p className="state state--error">
          Không tải được danh sách. {error instanceof Error ? error.message : ''}
        </p>
      )}

      {data && data.items.length === 0 && <p className="state">Không có sản phẩm nào khớp.</p>}

      {data && data.items.length > 0 && (
        <>
          <ul className="grid">
            {data.items.map((product) => (
              <li key={product.id} className="card">
                <Link to={`/san-pham/${product.slug}`}>
                  <div className="card__image">{product.name.charAt(0)}</div>
                  <h2 className="card__name">{product.name}</h2>
                  <p className="card__meta">{product.categoryName}</p>
                  <p className="card__price">{formatPrice(product.price)}</p>
                </Link>
              </li>
            ))}
          </ul>

          <div className="pager">
            <button type="button" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>
              Trang trước
            </button>
            <span>
              Trang {data.page} trên {data.totalPages} · {data.total} sản phẩm
            </span>
            <button
              type="button"
              disabled={page >= data.totalPages}
              onClick={() => setPage((n) => n + 1)}
            >
              Trang sau
            </button>
          </div>
        </>
      )}
    </>
  );
}
