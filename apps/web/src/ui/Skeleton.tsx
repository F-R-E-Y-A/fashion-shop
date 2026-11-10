import styles from './Skeleton.module.css';

export function SkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className={styles.grid} role="status" aria-label="Đang tải">
      {Array.from({ length: count }, (_, i) => (
        <div className={styles.card} key={i}>
          <div className={styles.image} />
          <div className={styles.line} />
          <div className={styles.short} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonDetail() {
  return (
    <div className={styles.detail} role="status" aria-label="Đang tải">
      <div className={styles.image} />
      <div>
        <div className={styles.line} />
        <div className={styles.short} />
      </div>
    </div>
  );
}
