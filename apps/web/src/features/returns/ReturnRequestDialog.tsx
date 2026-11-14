import { type ChangeEvent, type RefObject, useEffect, useId, useRef, useState } from 'react';

import { ApiError, classifyRequestError, formatPrice } from '@/core';
import { ConfirmDialog } from '@/ui';

import {
  DESCRIPTION_MAX,
  formatReturnDate,
  PHOTO_REASONS,
  REASON_LABELS,
  REFUND_METHOD_TEXT,
  RETURN_REASONS,
  type ReturnEligibility,
  type ReturnInput,
  type ReturnReason,
  type ReturnRequest,
  SHIPPING_POLICY,
} from './returns.api.js';
import styles from './Returns.module.css';
import { PHOTO_TYPES, useCreateReturn, useUploadReturnPhoto } from './use-returns.js';

interface Photo {
  id: string;
  url: string;
  key: string | null;
  state: 'done' | 'uploading' | 'error';
  error?: string;
}

function submitMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const { statusCode, message } = error.body;
    if (statusCode === 401) return 'Phiên đăng nhập đã hết. Đăng nhập lại rồi gửi.';
    if (statusCode === 400 && Array.isArray(message)) {
      return 'Thông tin chưa hợp lệ. Kiểm tra lại các ô đã nhập.';
    }
    // 4xx va 503 (kho anh tat) co thong diep tieng Viet viet san cho khach.
    if ((statusCode < 500 || statusCode === 503) && typeof message === 'string') return message;
  }
  // POST khong chac da toi may chu hay chua: dung bao "that bai" de khach khoi gui trung.
  return classifyRequestError(error, 'mutation') === 'unknown'
    ? 'Chưa rõ yêu cầu đã được gửi hay chưa. Xem mục Trả hàng trong tài khoản trước khi gửi lại.'
    : 'Không gửi được yêu cầu. Thử lại sau.';
}

function uploadMessage(error: unknown): string {
  if (error instanceof ApiError && typeof error.body.message === 'string') {
    return error.body.statusCode >= 500 || error.body.statusCode === 429
      ? error.body.message
      : 'Không xin được phiếu tải ảnh.';
  }
  return error instanceof Error && /^(Kho ảnh|Ảnh quá)/.test(error.message)
    ? error.message
    : 'Không tải được ảnh. Thử lại.';
}

/**
 * Hop gui yeu cau tra hang (UC-14.1). Dieu kien tra nam o phan "impacts" cua hop, hien TRUOC form:
 * khach doc han, phi gui tra va cach nhan tien roi moi dien.
 */
export function ReturnRequestDialog({
  orderId,
  orderCode,
  eligibility,
  returnFocusRef,
  onClose,
  onCreated,
}: {
  orderId: string;
  orderCode: string;
  eligibility: ReturnEligibility;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onClose(): void;
  onCreated(created: ReturnRequest): void;
}) {
  const formId = useId();
  const create = useCreateReturn(orderId);
  const upload = useUploadReturnPhoto();
  const { items, refundMethod, uploadsEnabled, mediaMax } = eligibility;
  const bank = refundMethod === 'BANK_TRANSFER';
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ReturnReason | null>(null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [problem, setProblem] = useState('');
  const aborts = useRef(new Set<AbortController>());
  const localUrls = useRef(new Set<string>());

  // Dong hop: huy anh dang tai, tra bo nho cua anh xem truoc.
  useEffect(() => {
    const pending = aborts.current;
    const urls = localUrls.current;
    return () => {
      for (const controller of pending) controller.abort();
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  const photoRequired = uploadsEnabled && reason !== null && PHOTO_REASONS.includes(reason);
  const uploading = photos.some((photo) => photo.state === 'uploading');
  const setPhoto = (id: string, patch: Partial<Photo>) =>
    setPhotos((list) => list.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo)));

  const toggle = (orderItemId: string, on: boolean) =>
    setSelected((current) => {
      const next = { ...current };
      if (on) next[orderItemId] = 1;
      else delete next[orderItemId];
      return next;
    });
  const step = (orderItemId: string, bought: number, delta: number) =>
    setSelected((current) => ({
      ...current,
      [orderItemId]: Math.min(bought, Math.max(1, (current[orderItemId] ?? 1) + delta)),
    }));

  const pickPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    const room = mediaMax - photos.length;
    setProblem(files.length > room ? `Tối đa ${mediaMax} ảnh mỗi yêu cầu.` : '');
    for (const file of files.slice(0, Math.max(0, room))) {
      const id = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
      const url = URL.createObjectURL(file);
      localUrls.current.add(url);
      if (!PHOTO_TYPES[file.type]) {
        setPhotos((list) => [
          ...list,
          { id, url, key: null, state: 'error', error: 'Chỉ nhận ảnh JPG, PNG hoặc WebP.' },
        ]);
        continue;
      }
      setPhotos((list) => [...list, { id, url, key: null, state: 'uploading' }]);
      const controller = new AbortController();
      aborts.current.add(controller);
      upload(file, controller.signal)
        .then((key) => setPhoto(id, { key, state: 'done' }))
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setPhoto(id, { state: 'error', error: uploadMessage(error) });
        })
        .finally(() => aborts.current.delete(controller));
    }
  };

  const removePhoto = (photo: Photo) => {
    if (localUrls.current.delete(photo.url)) URL.revokeObjectURL(photo.url);
    setPhotos((list) => list.filter((item) => item.id !== photo.id));
  };

  const submit = () => {
    const keys = photos.flatMap((photo) => (photo.key ? [photo.key] : []));
    const number = accountNumber.trim();
    const issue =
      Object.keys(selected).length === 0
        ? 'Chọn ít nhất một sản phẩm cần trả.'
        : !reason
          ? 'Chọn lý do trả hàng.'
          : uploading
            ? 'Đợi ảnh tải lên xong rồi gửi.'
            : photos.some((photo) => photo.state === 'error')
              ? 'Bỏ các ảnh bị lỗi rồi gửi.'
              : photoRequired && keys.length === 0
                ? 'Lý do này cần ít nhất một ảnh để shop kiểm tra.'
                : bank && !bankName.trim()
                  ? 'Nhập tên ngân hàng nhận tiền.'
                  : bank && !/^\d{6,20}$/.test(number)
                    ? 'Số tài khoản gồm 6 đến 20 chữ số.'
                    : bank && !accountHolder.trim()
                      ? 'Nhập tên chủ tài khoản.'
                      : '';
    setProblem(issue);
    if (issue || !reason) return;
    const input: ReturnInput = {
      items: Object.entries(selected).map(([orderItemId, quantity]) => ({ orderItemId, quantity })),
      reasonCode: reason,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(keys.length > 0 ? { mediaKeys: keys } : {}),
      ...(bank
        ? {
            refundAccount: {
              bankName: bankName.trim(),
              accountNumber: number,
              accountHolder: accountHolder.trim(),
            },
          }
        : {}),
    };
    create.mutate(input, { onSuccess: onCreated });
  };

  return (
    <ConfirmDialog
      open
      title="Yêu cầu trả hàng"
      subject={`Đơn ${orderCode}`}
      impacts={[
        eligibility.deadline
          ? `Hạn gửi yêu cầu: ${formatReturnDate(eligibility.deadline)} (${eligibility.windowDays} ngày kể từ khi giao).`
          : `Gửi yêu cầu trong ${eligibility.windowDays} ngày kể từ khi giao.`,
        SHIPPING_POLICY,
        REFUND_METHOD_TEXT[refundMethod],
      ]}
      confirmLabel="Gửi yêu cầu"
      pendingLabel="Đang gửi…"
      tone="primary"
      pending={create.isPending}
      onClose={onClose}
      onConfirm={submit}
      returnFocusRef={returnFocusRef}
    >
      <div className={styles.form}>
        <fieldset className={styles.group}>
          <legend>Sản phẩm cần trả</legend>
          <ul className={styles.lines}>
            {items.map((item) => {
              const quantity = selected[item.orderItemId];
              const on = quantity !== undefined;
              return (
                <li key={item.orderItemId} className={styles.line}>
                  <label className={styles.lineLabel}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(event) => toggle(item.orderItemId, event.target.checked)}
                    />
                    <span>
                      <strong>{item.name}</strong>
                      <span className={styles.muted}>
                        {item.variantLabel ? `${item.variantLabel} · ` : ''}
                        {formatPrice(item.unitPrice)} × {item.quantity}
                      </span>
                    </span>
                  </label>
                  {on && (
                    <span className={styles.stepper}>
                      <button
                        type="button"
                        aria-label={`Giảm số lượng ${item.name}`}
                        disabled={quantity <= 1}
                        onClick={() => step(item.orderItemId, item.quantity, -1)}
                      >
                        −
                      </button>
                      <span aria-label={`Số lượng trả ${item.name}`}>{quantity}</span>
                      <button
                        type="button"
                        aria-label={`Tăng số lượng ${item.name}`}
                        disabled={quantity >= item.quantity}
                        onClick={() => step(item.orderItemId, item.quantity, 1)}
                      >
                        +
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>

        <fieldset className={styles.group}>
          <legend>Lý do trả hàng</legend>
          {RETURN_REASONS.map((code) => (
            <label key={code} className={styles.choice}>
              <input
                type="radio"
                name={`${formId}-reason`}
                checked={reason === code}
                onChange={() => setReason(code)}
              />
              <span>{REASON_LABELS[code]}</span>
            </label>
          ))}
        </fieldset>

        <label className={styles.field}>
          <span>Mô tả thêm</span>
          <textarea
            value={description}
            maxLength={DESCRIPTION_MAX}
            placeholder="Tình trạng hàng, chỗ bị lỗi, cỡ bạn thường mặc…"
            onChange={(event) => setDescription(event.target.value)}
          />
          <span className={styles.counter}>
            {description.length}/{DESCRIPTION_MAX}
          </span>
        </label>

        {uploadsEnabled ? (
          <div className={styles.field}>
            <span>
              Ảnh thực tế (tối đa {mediaMax}
              {photoRequired ? ', bắt buộc với lý do này' : ''})
            </span>
            <div className={styles.picker}>
              {photos.map((photo, index) => (
                <div key={photo.id} className={styles.thumb} data-state={photo.state}>
                  <img src={photo.url} alt={`Ảnh ${index + 1}`} />
                  <button
                    type="button"
                    className={styles.remove}
                    aria-label={`Bỏ ảnh ${index + 1}`}
                    onClick={() => removePhoto(photo)}
                  >
                    ×
                  </button>
                </div>
              ))}
              {photos.length < mediaMax && (
                <label className={styles.addPhoto}>
                  <input
                    type="file"
                    className="sr-only"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={pickPhotos}
                  />
                  + Ảnh
                </label>
              )}
            </div>
            {photos.map(
              (photo, index) =>
                photo.error && (
                  <p key={photo.id} className={styles.error}>
                    Ảnh {index + 1}: {photo.error}
                  </p>
                ),
            )}
          </div>
        ) : (
          <p className={styles.muted}>Shop chưa bật tải ảnh, hãy mô tả kỹ tình trạng hàng.</p>
        )}

        {bank && (
          <fieldset className={styles.group}>
            <legend>Tài khoản nhận tiền hoàn</legend>
            <label className={styles.field}>
              <span>Ngân hàng</span>
              <input
                value={bankName}
                maxLength={120}
                autoComplete="off"
                onChange={(event) => setBankName(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Số tài khoản</span>
              <input
                inputMode="numeric"
                autoComplete="off"
                value={accountNumber}
                onChange={(event) =>
                  setAccountNumber(event.target.value.replace(/\D/g, '').slice(0, 20))
                }
              />
            </label>
            <label className={styles.field}>
              <span>Tên chủ tài khoản</span>
              <input
                value={accountHolder}
                maxLength={120}
                autoComplete="off"
                onChange={(event) => setAccountHolder(event.target.value)}
              />
            </label>
          </fieldset>
        )}

        {(problem || create.isError) && (
          <p className={styles.error} role="alert">
            {problem || submitMessage(create.error)}
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
}
