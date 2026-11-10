import { Link } from 'react-router-dom';

import styles from './Breadcrumb.module.css';

export function Breadcrumb({ items }: { items: Array<{ name: string; to?: string }> }) {
  return (
    <nav aria-label="Đường dẫn" className={styles.breadcrumb}>
      <ol>
        {items.map((item, index) => (
          <li key={`${item.name}-${index}`}>
            {item.to ? (
              <Link to={item.to}>{item.name}</Link>
            ) : (
              <span aria-current="page">{item.name}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
