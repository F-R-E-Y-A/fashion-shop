import { Link } from 'react-router-dom';

import styles from './SectionHeader.module.css';

export function SectionHeader({ title, to }: { title: string; to: string }) {
  return (
    <div className={styles.header}>
      <h2>{title}</h2>
      <Link to={to}>XEM TẤT CẢ →</Link>
    </div>
  );
}
