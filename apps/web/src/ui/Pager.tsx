interface PagerProps {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
  unit?: string;
  variant?: 'simple' | 'numbered';
}

/** Thanh chuyen trang dung chung cho moi danh sach co phan trang. */
export function Pager({
  page,
  totalPages,
  total,
  onChange,
  unit = 'mục',
  variant = 'simple',
}: PagerProps) {
  if (variant === 'numbered') {
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    const numbers = Array.from({ length: Math.min(5, totalPages) }, (_, index) => start + index);
    return (
      <nav className="pager" aria-label="Phân trang">
        <span>
          Trang {page} / {totalPages} · {total} {unit}
        </span>
        {numbers.map((number) => (
          <button
            key={number}
            type="button"
            aria-current={number === page ? 'page' : undefined}
            onClick={() => onChange(number)}
          >
            {number}
          </button>
        ))}
        <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Tiếp →
        </button>
      </nav>
    );
  }
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
