import type { Product } from '../api/index.js';
import { ProductCard } from './ProductCard.js';
import styles from './ProductGrid.module.css';

export function ProductGrid({
  products,
  showBrand = false,
  terms,
  variantQuery,
}: {
  products: Product[];
  showBrand?: boolean;
  /** Cac tu cua cau tim de to sang trong ten. */
  terms?: readonly string[];
  /** Deep-link bien the truyen xuong tung card (xem ProductCard). */
  variantQuery?: string;
}) {
  return (
    <ul className={styles.grid}>
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          showBrand={showBrand}
          terms={terms}
          variantQuery={variantQuery}
        />
      ))}
    </ul>
  );
}
