import { useState } from 'react';
import { Link } from 'react-router-dom';

import { formatPrice } from '@/core';
import { RatingBadge } from '@/features/reviews';

import type { Product } from '../api/index.js';
import { HighlightedText } from '../search/HighlightedText.js';
import styles from './ProductCard.module.css';

/** Phan tram giam khi gia niem yet cao hon gia ban tu 5% tro len; nguoc lai la 0. */
export function discountPercent(product: Pick<Product, 'price' | 'listPrice'>): number {
  const price = Number(product.price);
  const list = Number(product.listPrice);
  if (!product.listPrice || !(list > price)) return 0;
  const percent = Math.round((1 - price / list) * 100);
  return percent >= 5 ? percent : 0;
}

export function ProductCard({
  product,
  showBrand = false,
  terms,
  variantQuery,
}: {
  product: Product;
  showBrand?: boolean;
  /** Cac tu cua cau tim de to sang trong ten. */
  terms?: readonly string[];
  /** Deep-link bien the: '?color=den' khi ket qua loc dang chon dung mot mau, de trang chi tiet mo san mau do. */
  variantQuery?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [hoverFailed, setHoverFailed] = useState(false);
  const percent = discountPercent(product);
  const showHover = product.hoverImageUrl && !hoverFailed && !imageFailed;
  return (
    <li className={styles.card}>
      <Link to={`/san-pham/${product.slug}${variantQuery ?? ''}`}>
        <div className={styles.image}>
          {product.imageUrl && !imageFailed ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className={styles.missing}>Ảnh không khả dụng</span>
          )}
          {showHover && (
            <img
              className={styles.hover}
              src={product.hoverImageUrl ?? undefined}
              alt=""
              loading="lazy"
              onError={() => setHoverFailed(true)}
            />
          )}
          {percent > 0 && <span className={styles.badge}>−{percent}%</span>}
        </div>
        {showBrand && product.brandName && <p className={styles.brand}>{product.brandName}</p>}
        <h3 className={styles.name}>
          <HighlightedText text={product.name} terms={terms} />
        </h3>
        {product.stockStatus === 'OUT_OF_STOCK' && <p>Hết hàng</p>}
        <div className={styles.meta}>
          <p className={styles.price}>
            {formatPrice(product.price)}
            {product.listPrice && <s>{formatPrice(product.listPrice)}</s>}
          </p>
          {product.colorSwatches.length > 0 && (
            <p className={styles.swatches}>
              {product.colorSwatches.map((hex) => (
                <i key={hex} style={{ background: hex }} aria-hidden="true" />
              ))}
              {product.colorCount > 1 && <span>{product.colorCount} màu</span>}
            </p>
          )}
        </div>
        {/* Sao nam cuoi the: the chua co danh gia khong lech hang ten va gia voi the ben canh. */}
        {product.ratingCount ? (
          <p className={styles.rating}>
            <RatingBadge average={product.ratingAverage} count={product.ratingCount} />
          </p>
        ) : null}
      </Link>
    </li>
  );
}
