import type { Product } from '../api/index.js';
import styles from './Catalog.module.css';
import { ProductCard } from './ProductCard.js';

export function ProductGrid({
  products,
  showBrand = false,
}: {
  products: Product[];
  showBrand?: boolean;
}) {
  return (
    <ul className={styles.productGrid}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} showBrand={showBrand} />
      ))}
    </ul>
  );
}
