import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { formatPrice } from '@/core';
import { Empty, ErrorNote, Loading, Pager } from '@/ui';

import { listProducts, productKeys } from '../api/index.js';

/**
 * Trang MAU: goi that vao module mau ben may chu.
 *
 * Khuon de hai ban chep theo. Ba trang thai deu phai co mat: dang tai, loi, khong co du lieu.
 */
export function ProductListPage() {
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [page, setPage] = useState(1);

  const params = { page, pageSize: 12, search: submitted || undefined };
  const { data, isPending, isError, error } = useQuery({
    queryKey: productKeys.list(params),
    queryFn: () => listProducts(params),
  });

  return (
    <>
      <h1>Sản phẩm</h1>

      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSubmitted(search.trim());
        }}
      >
        <input
          type="search"
          value={search}
          placeholder="Tìm theo tên sản phẩm"
          aria-label="Tìm theo tên sản phẩm"
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="submit">Tìm</button>
      </form>

      {isPending && <Loading />}
      {isError && <ErrorNote error={error} />}
      {data && data.items.length === 0 && <Empty label="Không có sản phẩm nào khớp." />}

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

          <Pager
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            onChange={setPage}
            unit="sản phẩm"
          />
        </>
      )}
    </>
  );
}
