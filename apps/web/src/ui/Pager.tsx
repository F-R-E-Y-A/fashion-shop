interface PagerProps {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
  unit?: string;
}

/** Thanh chuyen trang dung chung cho moi danh sach co phan trang. */
export function Pager({ page, totalPages, total, onChange, unit = 'mục' }: PagerProps) {
  return (
    <div className="pager">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Trang trước
      </button>
      <span>
        Trang {page} trên {totalPages} · {total} {unit}
      </span>
      <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Trang sau
      </button>
    </div>
  );
}
