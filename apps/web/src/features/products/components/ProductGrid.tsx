import type { Product } from '../api/index.js';
import { ProductCard } from './ProductCard.js';
import styles from './ProductGrid.module.css';

export function ProductGrid({
  products,
  showBrand = false,
  terms,
}: {
  products: Product[];
  showBrand?: boolean;
  /** Cac tu cua cau tim de to sang trong ten. */
  terms?: readonly string[];
}) {
  return (
    <ul className={styles.grid}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} showBrand={showBrand} terms={terms} />
      ))}
    </ul>
  );
}
