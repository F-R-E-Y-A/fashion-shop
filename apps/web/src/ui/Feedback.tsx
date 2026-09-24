/**
 * Ba trang thai ma MOI trang tai du lieu deu phai co mat: dang tai, loi, khong co du lieu.
 * Thieu mot trong ba la thieu (danh sach kiem trong mau pull request).
 */
export function Loading({ label = 'Đang tải...' }: { label?: string }) {
  return (
    <p className="state" role="status">
      {label}
    </p>
  );
}

export function ErrorNote({ error, label }: { error?: unknown; label?: string }) {
  const message = label ?? (error instanceof Error ? error.message : 'Đã có lỗi xảy ra');
  return (
    <p className="state state--error" role="alert">
      {message}
    </p>
  );
}

export function Empty({ label = 'Không có dữ liệu.' }: { label?: string }) {
  return <p className="state">{label}</p>;
}
