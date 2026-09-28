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

export function ErrorNote({
  error,
  label,
  onRetry,
}: {
  error?: unknown;
  label?: string;
  onRetry?: () => void;
}) {
  const message = label ?? (error instanceof Error ? error.message : 'Đã có lỗi xảy ra');
  return (
    <div className="state state--error" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Thử lại →
        </button>
      )}
    </div>
  );
}

export function Empty({ label = 'Không có dữ liệu.' }: { label?: string }) {
  return <p className="state">{label}</p>;
}
