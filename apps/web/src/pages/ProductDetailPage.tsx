import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { apiGet, formatPrice, type Product } from '../lib/api';

export function ProductDetailPage() {
  const { slug = '' } = useParams();

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['product', slug],
    queryFn: () => apiGet<Product>(`/products/${slug}`),
    enabled: slug.length > 0,
  });

  if (isPending) return <p className="state">Đang tải...</p>;

  if (isError) {
    return (
      <>
        <p className="state state--error">{error instanceof Error ? error.message : 'Có lỗi'}</p>
        <Link to="/">Quay lại danh sách</Link>
      </>
    );
  }

  return (
    <article className="detail">
      <Link to="/" className="detail__back">
        Quay lại danh sách
      </Link>
      <div className="detail__image">{data.name.charAt(0)}</div>
      <div>
        <h1>{data.name}</h1>
        <p className="card__meta">{data.categoryName}</p>
        <p className="detail__price">{formatPrice(data.price)}</p>
        <p>{data.description}</p>
      </div>
    </article>
  );
}
