import { type ChangeEvent, useEffect, useId, useRef, useState } from 'react';

import { ApiError, requestErrorCode } from '@/core';
import { ConfirmDialog } from '@/ui';

import {
  FIT_LABELS,
  type FitFeedback,
  formatReviewDate,
  type MyReview,
  REVIEW_CONTENT_MAX,
  REVIEW_MEDIA_MAX,
  type ReviewableItem,
  type ReviewInput,
} from './reviews.api.js';
import styles from './Reviews.module.css';
import { StarInput } from './Stars.js';
import {
  photoProblem,
  type SaveReviewArgs,
  useSaveReview,
  useUploadConfig,
  useUploadPhoto,
} from './use-reviews.js';

export type ReviewTarget =
  { mode: 'create'; item: ReviewableItem } | { mode: 'edit'; review: MyReview };

interface Photo {
  id: string;
  url: string;
  key: string | null;
  state: 'done' | 'uploading' | 'error';
  error?: string;
}

const FITS: FitFeedback[] = ['TOO_SMALL', 'TRUE_TO_SIZE', 'TOO_LARGE'];

function saveMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.body.statusCode === 400) return 'Thông tin chưa hợp lệ. Kiểm tra lại các ô đã nhập.';
    if (error.body.statusCode === 401) return 'Phiên đăng nhập đã hết. Đăng nhập lại rồi gửi.';
    // 409/422/503 cua phan he danh gia co thong diep tieng Viet viet san cho khach.
    if (typeof error.body.message === 'string') return error.body.message;
  }
  return 'Không gửi được đánh giá. Kiểm tra kết nối rồi thử lại.';
}

function uploadMessage(error: unknown): string {
  if (error instanceof ApiError && typeof error.body.message === 'string') {
    return error.body.statusCode >= 500 || error.body.statusCode === 429
      ? error.body.message
      : 'Không xin được phiếu tải ảnh.';
  }
  return error instanceof Error && error.message.startsWith('Kho ảnh')
    ? error.message
    : 'Không tải được ảnh. Thử lại.';
}

function toNumber(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

function outOfRange(value: number | null, min: number, max: number): boolean {
  return value !== null && (!Number.isInteger(value) || value < min || value > max);
}

/** Form viet va sua danh gia trong hop thoai. Doi doi tuong thi dung form moi (key), khong tron state. */
export function ReviewFormDialog({
  target,
  onClose,
  onSaved,
  onAlreadySaved,
}: {
  target: ReviewTarget | null;
  onClose(): void;
  onSaved(review: MyReview): void;
  /** Gui moi ma may chu bao dong don da co danh gia: lan gui truoc da ghi, chi mat tra loi. */
  onAlreadySaved(): void;
}) {
  if (!target) return null;
  const key = target.mode === 'create' ? target.item.orderItemId : target.review.id;
  return (
    <ReviewForm
      key={key}
      target={target}
      onClose={onClose}
      onSaved={onSaved}
      onAlreadySaved={onAlreadySaved}
    />
  );
}

function ReviewForm({
  target,
  onClose,
  onSaved,
  onAlreadySaved,
}: {
  target: ReviewTarget;
  onClose(): void;
  onSaved(review: MyReview): void;
  onAlreadySaved(): void;
}) {
  const formId = useId();
  const save = useSaveReview();
  const config = useUploadConfig();
  const upload = useUploadPhoto();
  const editing = target.mode === 'edit' ? target.review : null;
  const [rating, setRating] = useState(editing?.rating ?? 0);
  const [content, setContent] = useState(editing?.content ?? '');
  const [fit, setFit] = useState<FitFeedback | null>(editing?.fitFeedback ?? null);
  const [height, setHeight] = useState(editing?.heightCm ? String(editing.heightCm) : '');
  const [weight, setWeight] = useState(editing?.weightKg ? String(editing.weightKg) : '');
  const [anonymous, setAnonymous] = useState(editing?.isAnonymous ?? false);
  const [photos, setPhotos] = useState<Photo[]>(() =>
    (editing?.media ?? []).map((media) => ({
      id: media.url,
      url: media.thumbnailUrl,
      key: media.key,
      state: 'done',
    })),
  );
  const [photosChanged, setPhotosChanged] = useState(false);
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

  const product = target.mode === 'create' ? target.item.product : target.review.product;
  const variantLabel =
    target.mode === 'create' ? target.item.variantLabel : target.review.variantLabel;
  const uploading = photos.some((photo) => photo.state === 'uploading');

  const setPhoto = (id: string, patch: Partial<Photo>) =>
    setPhotos((list) => list.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo)));

  const pickPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!config.data || files.length === 0) return;
    const room = REVIEW_MEDIA_MAX - photos.length;
    setProblem(files.length > room ? `Tối đa ${REVIEW_MEDIA_MAX} ảnh mỗi đánh giá.` : '');
    setPhotosChanged(true);
    for (const file of files.slice(0, Math.max(0, room))) {
      const id = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
      const url = URL.createObjectURL(file);
      localUrls.current.add(url);
      const reason = photoProblem(file, config.data);
      setPhotos((list) => [
        ...list,
        reason
          ? { id, url, key: null, state: 'error', error: reason }
          : { id, url, key: null, state: 'uploading' },
      ]);
      if (reason) continue;
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
    setPhotosChanged(true);
  };

  const submit = () => {
    const heightCm = toNumber(height);
    const weightKg = toNumber(weight);
    const issue =
      rating < 1
        ? 'Hãy chọn số sao.'
        : uploading
          ? 'Đợi ảnh tải lên xong rồi gửi.'
          : photos.some((photo) => photo.state === 'error')
            ? 'Bỏ các ảnh bị lỗi rồi gửi.'
            : outOfRange(heightCm, 100, 230)
              ? 'Chiều cao từ 100 đến 230 cm.'
              : outOfRange(weightKg, 25, 250)
                ? 'Cân nặng từ 25 đến 250 kg.'
                : '';
    setProblem(issue);
    if (issue) return;
    const fields: Omit<ReviewInput, 'media'> = {
      rating,
      content: content.trim() || null,
      fitFeedback: fit,
      heightCm,
      weightKg,
      isAnonymous: anonymous,
    };
    const media = photos.flatMap((photo) => (photo.key ? [{ key: photo.key }] : []));
    const args: SaveReviewArgs =
      target.mode === 'create'
        ? { mode: 'create', orderItemId: target.item.orderItemId, input: { ...fields, media } }
        : {
            mode: 'edit',
            reviewId: target.review.id,
            // Khong doi anh thi khong gui media: giu ca anh nap tay (khong co khoa).
            input: photosChanged ? { ...fields, media } : fields,
          };
    save.mutate(args, {
      onSuccess: onSaved,
      onError: (error) => {
        if (args.mode === 'create' && requestErrorCode(error) === 'REVIEW_ALREADY_EXISTS') {
          onAlreadySaved();
        }
      },
    });
  };

  return (
    <ConfirmDialog
      open
      title={target.mode === 'create' ? 'Đánh giá sản phẩm' : 'Sửa đánh giá'}
      subject={variantLabel ? `${product.name} · ${variantLabel}` : product.name}
      impacts={[
        target.mode === 'create'
          ? 'Đánh giá chỉ sửa được một lần trong 30 ngày.'
          : `Đây là lần sửa duy nhất, trước ${formatReviewDate(target.review.editDeadline)}.`,
        'Đánh giá có ảnh hoặc cần xem lại sẽ hiện sau khi shop duyệt.',
      ]}
      confirmLabel={target.mode === 'create' ? 'Gửi đánh giá' : 'Lưu thay đổi'}
      pendingLabel="Đang gửi…"
      tone="primary"
      pending={save.isPending}
      onClose={onClose}
      onConfirm={submit}
    >
      <div className={styles.form}>
        <StarInput name={`${formId}-rating`} value={rating} onChange={setRating} />
        <fieldset className={styles.fitChoices}>
          <legend>Kích cỡ khi mặc</legend>
          {FITS.map((code) => (
            <button
              key={code}
              type="button"
              className={styles.chip}
              aria-pressed={fit === code}
              onClick={() => setFit(fit === code ? null : code)}
            >
              {FIT_LABELS[code]}
            </button>
          ))}
        </fieldset>
        <div className={styles.pair}>
          <label className={styles.field}>
            <span>Chiều cao (cm)</span>
            <input
              inputMode="numeric"
              value={height}
              onChange={(event) => setHeight(event.target.value.replace(/\D/g, '').slice(0, 3))}
            />
          </label>
          <label className={styles.field}>
            <span>Cân nặng (kg)</span>
            <input
              inputMode="numeric"
              value={weight}
              onChange={(event) => setWeight(event.target.value.replace(/\D/g, '').slice(0, 3))}
            />
          </label>
        </div>
        <label className={styles.field}>
          <span>Nhận xét</span>
          <textarea
            value={content}
            maxLength={REVIEW_CONTENT_MAX}
            placeholder="Chất liệu, màu sắc, form dáng có đúng mô tả không?"
            onChange={(event) => setContent(event.target.value)}
          />
          <span className={styles.counter}>
            {content.length}/{REVIEW_CONTENT_MAX}
          </span>
        </label>
        {config.data?.enabled && (
          <div className={styles.field}>
            <span>Ảnh thực tế (tối đa {REVIEW_MEDIA_MAX})</span>
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
              {photos.length < REVIEW_MEDIA_MAX && (
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
        )}
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(event) => setAnonymous(event.target.checked)}
          />
          <span>Ẩn tên: chỉ hiện chữ cái đầu và cuối, ví dụ N*****h.</span>
        </label>
        {(problem || save.isError) && (
          <p className={styles.error} role="alert">
            {problem || saveMessage(save.error)}
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
}
