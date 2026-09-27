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
  return (
    <li className={styles.card}>
      <Link to={`/san-pham/${product.slug}`}>
        <div className={styles.cardImage}>
          {product.imageUrl && <img src={product.imageUrl} alt={product.name} loading="lazy" />}
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
