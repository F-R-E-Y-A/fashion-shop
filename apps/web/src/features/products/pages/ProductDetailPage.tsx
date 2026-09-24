import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { formatPrice } from '@/core';
import { ErrorNote, Loading } from '@/ui';

import { getProductBySlug, productKeys } from '../api/index.js';

export function ProductDetailPage() {
  const { slug = '' } = useParams();

  const { data, isPending, isError, error } = useQuery({
    queryKey: productKeys.detail(slug),
    queryFn: () => getProductBySlug(slug),
    enabled: slug.length > 0,
  });

  if (isPending) return <Loading />;

  if (isError) {
    return (
      <>
        <ErrorNote error={error} />
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
