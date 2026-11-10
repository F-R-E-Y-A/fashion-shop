import { SearchIcon } from '@/ui';

import styles from './SearchForm.module.css';

/** O nhap lon dau trang ket qua: giu cau hien tai va gui lai duoc. */
export function SearchForm({ q, onSubmit }: { q: string; onSubmit: (q: string) => void }) {
  return (
    <form
      className={styles.form}
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(String(new FormData(event.currentTarget).get('q') ?? '').trim());
      }}
    >
      <label htmlFor="search-page-q" className="sr-only">
        Tìm sản phẩm
      </label>
      <input
        // Doi key khi cau doi tu ngoai (bo chip) de o nhap hien dung cau moi.
        key={q}
        id="search-page-q"
        name="q"
        type="search"
        autoComplete="off"
        maxLength={120}
        defaultValue={q}
        placeholder="Thử: áo thun nữ màu hồng"
      />
      <button type="submit" aria-label="Tìm">
        <SearchIcon />
      </button>
    </form>
  );
}
