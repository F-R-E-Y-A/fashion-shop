import type { ReactNode } from 'react';

import { layout } from '@/ui';

import styles from './HomeSectionHeader.module.css';

/** Dau khoi trang chu: nhan nho + tieu de (chu thuong kieu bien tap) + hanh dong ben phai. */
export function HomeSectionHeader({
  eyebrow,
  title,
  titleId,
  children,
}: {
  eyebrow: string;
  title: string;
  titleId: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.head}>
      <div>
        <p className={`${layout.eyebrow} ${styles.eyebrow}`}>{eyebrow}</p>
        <h2 id={titleId}>{title}</h2>
      </div>
      {children}
    </div>
  );
}
