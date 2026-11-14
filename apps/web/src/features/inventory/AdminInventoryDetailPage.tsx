import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { classifyRequestError, formatDateTime } from '@/core';
import {
  adminAccessGeneration,
  AdminForbidden,
  SessionChangedError,
  useAuth,
} from '@/features/account';
import { ConfirmDialog, ErrorNote, Loading, Pager } from '@/ui';

import {
  type InventoryDetail,
  inventoryKeys,
  movementLabel,
  quantity,
  readPage,
} from './inventory.api.js';
import styles from './Inventory.module.css';
import { inventoryError, useInventory } from './use-inventory.js';

export function AdminInventoryDetailPage() {
  const { id = '' } = useParams();
  const { user, authenticatedRequest, getSessionEpoch } = useAuth();
  const queryClient = useQueryClient();
  const actorId = user?.id ?? '';
  const [params, setParams] = useSearchParams();
  const page = readPage(params.get('page'));
  const returnPage = readPage(params.get('returnPage'));
  const { query, data, forbidden, markForbidden } = useInventory<InventoryDetail>(
    inventoryKeys.detail(actorId, id, page),
    `/admin/inventory/${encodeURIComponent(id)}?page=${page}`,
  );

  const adjustButtonRef = useRef<HTMLButtonElement>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [adjustType, setAdjustType] = useState<'RECEIPT' | 'ADJUSTMENT'>('RECEIPT');
  const [adjustQuantity, setAdjustQuantity] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (forbidden) return <AdminForbidden />;

  const handleConfirmAdjust = async () => {
    if (isSubmitting) return;
    setFormError(null);

    const trimmedQty = adjustQuantity.trim();
    if (!/^\d+$/.test(trimmedQty)) {
      setFormError('Số lượng phải là số nguyên không âm');
      return;
    }
    const num = Number(trimmedQty);
    if (!Number.isSafeInteger(num)) {
      setFormError('Số lượng không hợp lệ');
      return;
    }

    if (adjustType === 'RECEIPT') {
      if (num <= 0) {
        setFormError('Số lượng nhập hàng phải lớn hơn 0');
        return;
      }
      if ((data?.quantityOnHand ?? 0) + num > 1_000_000) {
        setFormError('Tồn kho tối đa không được vượt quá 1.000.000');
        return;
      }
    } else {
      if (num < 0) {
        setFormError('Số lượng kiểm kê không được âm');
        return;
      }
      if (num > 1_000_000) {
        setFormError('Tồn kho tối đa không được vượt quá 1.000.000');
        return;
      }
      if (
        data?.quantityOnHand !== null &&
        data?.quantityOnHand !== undefined &&
        num === data.quantityOnHand
      ) {
        setFormError('Số lượng kiểm kê trùng khớp với tồn hiện tại, không có chênh lệch');
        return;
      }
      if (data && num < data.reservedQuantity) {
        setFormError(
          `Không thể điều chỉnh tồn kho (${num.toLocaleString('vi-VN')}) nhỏ hơn số lượng đang giữ cho đơn hàng (${data.reservedQuantity.toLocaleString('vi-VN')})`,
        );
        return;
      }
    }

    const trimmedReason = adjustReason.trim();
    if (!trimmedReason) {
      setFormError('Lý do không được để trống');
      return;
    }
    if (trimmedReason.length > 255) {
      setFormError('Lý do không được vượt quá 255 ký tự');
      return;
    }

    const epoch = getSessionEpoch();
    const access = adminAccessGeneration(queryClient, actorId);
    const stillCurrent = () =>
      getSessionEpoch() === epoch && adminAccessGeneration(queryClient, actorId) === access;

    try {
      setIsSubmitting(true);
      if (!stillCurrent()) throw new SessionChangedError();
      await authenticatedRequest<InventoryDetail>(
        `/admin/inventory/${encodeURIComponent(id)}/adjust`,
        {
          method: 'POST',
          body: {
            type: adjustType,
            quantity: num,
            reason: trimmedReason,
            requestKey,
          },
        },
      );
      if (!stillCurrent()) return;
      void queryClient.invalidateQueries({
        queryKey: inventoryKeys.all(actorId),
        refetchType: 'none',
      });
      await query.refetch();
      if (!stillCurrent()) return;
      setIsModalOpen(false);
      setSuccessMessage(
        adjustType === 'RECEIPT'
          ? `Đã nhập thêm ${num.toLocaleString('vi-VN')} đơn vị thành công.`
          : `Đã điều chỉnh tồn kho thành ${num.toLocaleString('vi-VN')} đơn vị thành công.`,
      );
    } catch (err: unknown) {
      if (!stillCurrent() || err instanceof SessionChangedError) return;
      if (classifyRequestError(err, 'mutation') === 'forbidden') {
        markForbidden();
        setIsModalOpen(false);
        return;
      }
      const message = err instanceof Error ? err.message : 'Có lỗi xảy ra khi cập nhật tồn kho';
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <Link className={styles.back} to={`/admin/inventory?page=${returnPage}`}>
        ← Về tồn kho
      </Link>
      <header className={styles.header}>
        <h1 className={styles.title}>Chi tiết tồn kho</h1>
      </header>
      <div className={styles.actionsRow}>
        <button
          type="button"
          className={styles.refresh}
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? 'Đang cập nhật…' : 'Cập nhật dữ liệu'}
        </button>
        {data && (
          <button
            ref={adjustButtonRef}
            type="button"
            className={styles.adjustBtn}
            onClick={() => {
              setRequestKey(crypto.randomUUID());
              setAdjustType('RECEIPT');
              setAdjustQuantity('');
              setAdjustReason('');
              setFormError(null);
              setIsModalOpen(true);
            }}
          >
            Nhập / Điều chỉnh tồn
          </button>
        )}
      </div>
      {successMessage && (
        <div className={styles.successNote} role="status">
          {successMessage}
        </div>
      )}
      {query.isPending && <Loading label="Đang tải chi tiết tồn kho…" />}
      {query.isError && (
        <ErrorNote label={inventoryError(query.error)} onRetry={() => void query.refetch()} />
      )}
      {data && (
        <>
          <section className={styles.panel} aria-label="Thông tin biến thể">
            <h2>{data.productName}</h2>
            <p>
              {data.colorName} / {data.sizeCode} · SKU: {data.sku}
            </p>
            <dl className={styles.quantities}>
              <div>
                <dt>Tồn vật lý</dt>
                <dd>{quantity(data.quantityOnHand)}</dd>
              </div>
              <div>
                <dt>Đang giữ</dt>
                <dd>{quantity(data.reservedQuantity)}</dd>
              </div>
              <div>
                <dt>Khả dụng</dt>
                <dd>{quantity(data.availableQuantity)}</dd>
              </div>
            </dl>
            <p className={styles.note}>
              Dữ liệu lúc {formatDateTime(data.asOf)}. Đang giữ chỉ gồm hàng chưa nhả và chưa hết
              hạn. Tự cập nhật mỗi 30 giây.
            </p>
          </section>
          <section aria-labelledby="movement-title">
            <h2 id="movement-title">Lịch sử biến động</h2>
            <p className={styles.note}>
              Lịch sử ghi thay đổi tồn vật lý; thao tác giữ/nhả hàng không phải biến động tồn vật
              lý. Chưa có số dư sau từng lần thay đổi.
            </p>
            {data.movements.items.length ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Thời điểm</th>
                      <th scope="col">Loại biến động</th>
                      <th scope="col">Thay đổi</th>
                      <th scope="col">Lý do</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.movements.items.map((row) => (
                      <tr key={row.id}>
                        <td data-label="Thời điểm">{formatDateTime(row.createdAt)}</td>
                        <td data-label="Loại biến động">{movementLabel(row.movementType)}</td>
                        <td data-label="Thay đổi">
                          {row.quantityDelta > 0 ? '+' : ''}
                          {row.quantityDelta.toLocaleString('vi-VN')}
                        </td>
                        <td data-label="Lý do">{row.reason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p role="status">
                {data.movements.total
                  ? 'Trang này không có biến động.'
                  : 'Chưa có biến động tồn kho.'}
              </p>
            )}
            <Pager
              page={page}
              totalPages={data.movements.totalPages}
              total={data.movements.total}
              unit="biến động"
              onChange={(next) => setParams({ page: String(next), returnPage: String(returnPage) })}
            />
          </section>

          <ConfirmDialog
            open={isModalOpen}
            tone="primary"
            title="Nhập / Điều chỉnh tồn kho"
            subject={`${data.productName} (${data.colorName} / ${data.sizeCode}) · SKU: ${data.sku}`}
            impacts={[
              `Tồn hiện tại: ${quantity(data.quantityOnHand)} · Đang giữ: ${quantity(data.reservedQuantity)} · Khả dụng: ${quantity(data.availableQuantity)}`,
              'Ghi nhận biến động tồn vật lý kèm lý do vào lịch sử kho.',
            ]}
            confirmLabel="Xác nhận lưu"
            pendingLabel="Đang lưu…"
            pending={isSubmitting}
            returnFocusRef={adjustButtonRef}
            onClose={() => {
              if (!isSubmitting) setIsModalOpen(false);
            }}
            onConfirm={() => void handleConfirmAdjust()}
          >
            <div className={styles.modalBody}>
              {formError && (
                <div className={styles.errorAlert} role="alert">
                  {formError}
                </div>
              )}

              <div className={styles.field}>
                <label id="adjust-type-label">Loại thao tác</label>
                <div
                  className={styles.radioGroup}
                  role="radiogroup"
                  aria-labelledby="adjust-type-label"
                >
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="adjustType"
                      value="RECEIPT"
                      checked={adjustType === 'RECEIPT'}
                      onChange={() => setAdjustType('RECEIPT')}
                      disabled={isSubmitting}
                    />
                    Nhập thêm hàng (+)
                  </label>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="adjustType"
                      value="ADJUSTMENT"
                      checked={adjustType === 'ADJUSTMENT'}
                      onChange={() => setAdjustType('ADJUSTMENT')}
                      disabled={isSubmitting}
                    />
                    Điều chỉnh kiểm kê (=)
                  </label>
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="adjust-quantity">
                  {adjustType === 'RECEIPT' ? 'Số lượng nhập thêm' : 'Số tồn thực tế sau kiểm kê'}
                </label>
                <input
                  id="adjust-quantity"
                  type="number"
                  min={adjustType === 'RECEIPT' ? 1 : 0}
                  max={1000000}
                  className={styles.input}
                  value={adjustQuantity}
                  onChange={(e) => setAdjustQuantity(e.target.value)}
                  placeholder={
                    adjustType === 'RECEIPT'
                      ? 'VD: 50'
                      : `Tối thiểu ${data.reservedQuantity} (lượng đang giữ)`
                  }
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="adjust-reason">Lý do / Ghi chú (bắt buộc)</label>
                <textarea
                  id="adjust-reason"
                  rows={3}
                  className={styles.textarea}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="VD: Nhập lô hàng NCC Yody, Hàng rách hỏng do ẩm ướt, Kiểm kê định kỳ..."
                  maxLength={255}
                  required
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </ConfirmDialog>
        </>
      )}
    </div>
  );
}
