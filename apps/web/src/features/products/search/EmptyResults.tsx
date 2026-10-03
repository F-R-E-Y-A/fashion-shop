import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { categoryKeys, getCategories } from '../api/index.js';
import styles from './EmptyResults.module.css';
import { EXAMPLE_QUERIES } from './search-content.js';

const ROOTS_SHOWN = 3;

/** Khong co san pham nao khop (UC-03.2/E1): goi y ba danh muc goc va ba cau mau. */
export function EmptyResults() {
  const tree = useQuery({ queryKey: categoryKeys.tree(), queryFn: getCategories });
  const roots = (tree.data ?? []).filter((root) => root.productCount > 0).slice(0, ROOTS_SHOWN);
  return (
    <div className={styles.empty}>
      <h2>Không có sản phẩm nào khớp.</h2>
      <p>Thử bỏ bớt một ý trong câu, hoặc bắt đầu từ một danh mục.</p>
      {roots.length > 0 && (
        <div className={styles.row}>
          {roots.map((root) => (
            <Link key={root.id} className={styles.pill} to={`/danh-muc/${root.slug}`}>
              {root.name}
            </Link>
          ))}
        </div>
      )}
      <div className={styles.row}>
        {EXAMPLE_QUERIES.slice(0, 3).map((example) => (
          <Link
            key={example}
            className={styles.link}
            to={`/tim-kiem?q=${encodeURIComponent(example)}`}
          >
            {example}
          </Link>
        ))}
      </div>
    </div>
  );
}
