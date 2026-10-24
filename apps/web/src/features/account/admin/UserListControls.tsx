import { type FormEvent, useEffect, useId, useRef } from 'react';

import styles from './AdminUsers.module.css';
import {
  DEFAULT_USER_LIST_QUERY,
  hasUserListFilters,
  normalizeUserQueryText,
  USER_QUERY_MAX,
  USER_ROLES,
  USER_SORTS,
  USER_STATUSES,
  type UserListQuery,
} from './list-query.js';
import { roleLabel, statusLabel } from './user-labels.js';

/** Thoi gian cho sau phim cuoi cung truoc khi tim: du ngan de thay ket qua, khong gui moi phim. */
export const USER_SEARCH_DEBOUNCE_MS = 300;

export const SORT_LABELS: Record<(typeof USER_SORTS)[number], string> = {
  newest: 'Mới nhất',
  oldest: 'Cũ nhất',
  email_asc: 'Email A → Z',
  email_desc: 'Email Z → A',
};

export type UserListNavigate = (next: UserListQuery, options: { replace: boolean }) => void;

/**
 * O tim va bo loc. Go chu thi doi 300ms roi thay URL bang replace (khong tao lich su moi phim);
 * Enter tim ngay. Doi bo loc, sap xep hay xoa bo loc tao muc lich su (Back quay lai duoc) va ve trang 1.
 */
export function UserListControls({
  query,
  draft,
  setDraft,
  navigationKey,
  onNavigate,
}: {
  query: UserListQuery;
  draft: string;
  setDraft: (value: string) => void;
  navigationKey: string;
  onNavigate: UserListNavigate;
}) {
  const id = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(query);
  useEffect(() => {
    latest.current = query;
  }, [query]);
  // Back hay đổi trang phải hủy tìm kiếm của URL cũ, kể cả khi q trên hai URL giống nhau.
  // Giữ nguyên input DOM để người đang gõ không mất focus sau debounce.
  useEffect(() => {
    clearTimeout(timer.current);
  }, [navigationKey]);
  useEffect(() => () => clearTimeout(timer.current), []);

  function commitSearch(value: string) {
    clearTimeout(timer.current);
    const q = normalizeUserQueryText(value);
    if (q === latest.current.q) return;
    onNavigate({ ...latest.current, q, page: 1 }, { replace: true });
  }

  /** Bo loc moi luon mang theo chu dang go: khong de mat chu khi chua het thoi gian cho. */
  function changeFilter(patch: Partial<UserListQuery>) {
    clearTimeout(timer.current);
    onNavigate(
      { ...latest.current, q: normalizeUserQueryText(draft), ...patch, page: 1 },
      { replace: false },
    );
  }

  function clearFilters() {
    clearTimeout(timer.current);
    setDraft('');
    onNavigate(
      { ...DEFAULT_USER_LIST_QUERY, sort: query.sort, pageSize: query.pageSize },
      { replace: false },
    );
  }

  const filtered = hasUserListFilters(query) || draft.trim() !== '';

  return (
    <div className={styles.controls}>
      <form
        role="search"
        aria-label="Tìm người dùng"
        className={styles.searchForm}
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          commitSearch(draft);
        }}
      >
        <label className={styles.searchLabel} htmlFor={`${id}-q`}>
          Tìm theo email
        </label>
        <div className={styles.searchRow}>
          <input
            id={`${id}-q`}
            className={styles.searchInput}
            type="search"
            value={draft}
            maxLength={USER_QUERY_MAX}
            autoComplete="off"
            spellCheck={false}
            placeholder="vd: nguyen@example.com"
            onChange={(event) => {
              const value = event.target.value;
              setDraft(value);
              clearTimeout(timer.current);
              timer.current = setTimeout(() => commitSearch(value), USER_SEARCH_DEBOUNCE_MS);
            }}
          />
          <button type="submit" className={styles.searchButton}>
            Tìm
          </button>
        </div>
      </form>

      <div className={styles.filters}>
        <label className={styles.field}>
          <span>Trạng thái</span>
          <select
            value={query.status ?? ''}
            onChange={(event) =>
              changeFilter({ status: (event.target.value || null) as UserListQuery['status'] })
            }
          >
            <option value="">Tất cả</option>
            {USER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Vai</span>
          <select
            value={query.role ?? ''}
            onChange={(event) =>
              changeFilter({ role: (event.target.value || null) as UserListQuery['role'] })
            }
          >
            <option value="">Tất cả</option>
            {USER_ROLES.map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Xác thực email</span>
          <select
            value={query.verified === null ? '' : String(query.verified)}
            onChange={(event) =>
              changeFilter({
                verified: event.target.value === '' ? null : event.target.value === 'true',
              })
            }
          >
            <option value="">Tất cả</option>
            <option value="true">Đã xác thực</option>
            <option value="false">Chưa xác thực</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Sắp xếp</span>
          <select
            value={query.sort}
            onChange={(event) =>
              changeFilter({ sort: event.target.value as UserListQuery['sort'] })
            }
          >
            {USER_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </label>
        {filtered && (
          <button type="button" className={styles.clearButton} onClick={clearFilters}>
            Xóa bộ lọc
          </button>
        )}
      </div>
    </div>
  );
}
