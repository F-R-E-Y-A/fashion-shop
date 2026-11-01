import styles from './AdminUsers.module.css';
import { roleLabel, statusLabel } from './user-labels.js';

/** Trang thai luon co chu; mau chi la lop phu (data-status chon mau trong CSS). */
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={styles.status} data-status={status}>
      <span className={styles.statusDot} aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

export function RoleList({ roles }: { roles: readonly string[] }) {
  if (roles.length === 0) return <span className={styles.muted}>—</span>;
  return (
    <span className={styles.roles}>
      {roles.map((role) => (
        <span key={role} className={styles.role} data-role={role}>
          {roleLabel(role)}
        </span>
      ))}
    </span>
  );
}
