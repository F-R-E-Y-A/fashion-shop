import { useState } from 'react';
import { Link } from 'react-router-dom';

import { formatPrice } from '@/core';

import type { Product } from '../api/index.js';
import styles from './Catalog.module.css';

export function ProductCard({
  product,
  showBrand = false,
}: {
  product: Product;
  showBrand?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <li className={styles.card}>
      <Link to={`/san-pham/${product.slug}`}>
        <div className={styles.cardImage}>
          {product.imageUrl && !imageFailed ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className={styles.missingImage}>Ảnh không khả dụng</span>
          )}
        </div>
        {showBrand && product.brandName && <p className={styles.eyebrow}>{product.brandName}</p>}
        <h3 className={styles.cardName}>{product.name}</h3>
        <p className={styles.price}>
          {formatPrice(product.price)}
          {product.listPrice && <s>{formatPrice(product.listPrice)}</s>}
        </p>
      </Link>
    </li>
  );
}
