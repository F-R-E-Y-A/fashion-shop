import { Link } from 'react-router-dom';

import styles from './Catalog.module.css';

export function SectionHeader({ title, to }: { title: string; to: string }) {
  return (
    <div className={styles.sectionHeader}>
      <h2>{title}</h2>
      <Link to={to}>XEM TẤT CẢ →</Link>
    </div>
  );
}
