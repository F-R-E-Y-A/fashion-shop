export type InDoubtStatus = 'in_flight' | 'unknown_error' | 'conflict';

export interface InDoubtReviewSubmission {
  actorId: string;
  orderItemId: string;
  rating: number;
  content: string | null;
  sessionEpoch: number;
  submittedAt: number;
  status: InDoubtStatus;
  error?: string;
  requestId?: string;
}

export interface ActiveRequestMeta {
  requestId: string;
  epoch: number;
  abortController?: AbortController;
}

const memoryStore = new Map<string, InDoubtReviewSubmission>();
const activeRequests = new Map<string, ActiveRequestMeta>();
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeInDoubtStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function registerActiveRequest(
  actorId: string,
  orderItemId: string,
  meta: ActiveRequestMeta,
): void {
  activeRequests.set(`${actorId}:${orderItemId}`, meta);
  notifyListeners();
}

/**
 * Compare-and-remove unregister: Chi unregister khi requestId trung khop (hoac khong truyen).
 * Bao ve request moi khong bi response cua request cu unregister som.
 */
export function unregisterActiveRequest(
  actorId: string,
  orderItemId: string,
  requestId?: string,
): void {
  const key = `${actorId}:${orderItemId}`;
  const existing = activeRequests.get(key);
  if (!existing) return;
  if (requestId && existing.requestId !== requestId) {
    return;
  }
  activeRequests.delete(key);
  notifyListeners();
}

export function hasActiveRequest(
  actorId: string,
  orderItemId: string,
  epoch?: number,
  requestId?: string,
): boolean {
  const req = activeRequests.get(`${actorId}:${orderItemId}`);
  if (!req) return false;
  if (epoch !== undefined && req.epoch !== epoch) return false;
  if (requestId !== undefined && req.requestId !== requestId) return false;
  return true;
}

export function getActiveRequest(
  actorId: string,
  orderItemId: string,
): ActiveRequestMeta | undefined {
  return activeRequests.get(`${actorId}:${orderItemId}`);
}

export function abortActiveRequest(actorId: string, orderItemId: string): void {
  const req = activeRequests.get(`${actorId}:${orderItemId}`);
  if (req?.abortController) {
    req.abortController.abort();
  }
  activeRequests.delete(`${actorId}:${orderItemId}`);
  notifyListeners();
}

export function abortAllActiveRequests(): void {
  for (const req of activeRequests.values()) {
    if (req.abortController) {
      req.abortController.abort();
    }
  }
  activeRequests.clear();
  notifyListeners();
}

function storageKey(actorId: string, orderItemId: string): string {
  return `freya:review:in-doubt:${actorId}:${orderItemId}`;
}

function readFromSessionStorage(
  actorId: string,
  orderItemId: string,
): InDoubtReviewSubmission | undefined {
  if (typeof window === 'undefined' || !window.sessionStorage) return undefined;
  try {
    const raw = window.sessionStorage.getItem(storageKey(actorId, orderItemId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as InDoubtReviewSubmission;
    if (parsed.actorId === actorId && parsed.orderItemId === orderItemId) {
      // Khi khôi phục từ sessionStorage sau khi reload hoặc đóng trang:
      // Không còn request fetch nào trong bộ nhớ sống, do đó request đã mất chủ sở hữu.
      // Chuẩn hóa status thành 'unknown_error' để mở đường Replay/đối chiếu thay vì kẹt vĩnh viễn.
      if (parsed.status === 'in_flight' && !hasActiveRequest(actorId, orderItemId)) {
        parsed.status = 'unknown_error';
        parsed.error =
          parsed.error || 'Trạng thái gửi trước đó chưa được xác nhận sau khi tải lại trang.';
      }
      return parsed;
    }
  } catch {
    /* Ignore corrupt storage */
  }
  return undefined;
}

function writeToSessionStorage(submission: InDoubtReviewSubmission): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(
      storageKey(submission.actorId, submission.orderItemId),
      JSON.stringify(submission),
    );
  } catch {
    /* Ignore quota/private mode errors */
  }
}

function removeFromSessionStorage(actorId: string, orderItemId: string): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(storageKey(actorId, orderItemId));
  } catch {
    /* Ignore errors */
  }
}

export function getInDoubtSubmission(
  actorId: string,
  orderItemId: string,
): InDoubtReviewSubmission | undefined {
  const key = `${actorId}:${orderItemId}`;
  const inMemory = memoryStore.get(key);
  if (inMemory && inMemory.actorId === actorId) {
    return inMemory;
  }
  const fromStorage = readFromSessionStorage(actorId, orderItemId);
  if (fromStorage) {
    memoryStore.set(key, fromStorage);
    return fromStorage;
  }
  return undefined;
}

/**
 * Compare-and-set marker:
 * Khong cho phep response tu phien cu hoac request cu hon ghi de marker cua phien moi hon.
 */
export function setInDoubtSubmission(submission: InDoubtReviewSubmission): void {
  const key = `${submission.actorId}:${submission.orderItemId}`;
  const existing =
    memoryStore.get(key) || readFromSessionStorage(submission.actorId, submission.orderItemId);
  if (existing) {
    if (existing.sessionEpoch > submission.sessionEpoch) {
      // Marker hien tai thuoc phien moi hon -> khong cho phep ghi de boi phien cu
      return;
    }
    if (
      existing.sessionEpoch === submission.sessionEpoch &&
      existing.submittedAt > submission.submittedAt
    ) {
      // Marker hien tai moi hon trong cung phien -> khong cho phep ghi de boi response cu
      return;
    }
  }
  memoryStore.set(key, submission);
  writeToSessionStorage(submission);
  notifyListeners();
}

/**
 * Compare-and-clear marker:
 * Chi xoa marker neu phien/request goi xoa khong cu hon marker hien tai.
 */
export function clearInDoubtSubmission(
  actorId: string,
  orderItemId: string,
  meta?: { sessionEpoch?: number; requestId?: string },
): void {
  const key = `${actorId}:${orderItemId}`;
  const existing = memoryStore.get(key) || readFromSessionStorage(actorId, orderItemId);
  if (existing && meta) {
    if (meta.sessionEpoch !== undefined && existing.sessionEpoch > meta.sessionEpoch) {
      // Marker hien tai thuoc phien moi hon -> khong duoc xoa boi response phien cu
      return;
    }
    if (
      meta.requestId !== undefined &&
      existing.requestId &&
      existing.requestId !== meta.requestId &&
      existing.sessionEpoch === meta.sessionEpoch
    ) {
      // Marker hien tai thuoc request moi hon trong cung phien -> khong xoa
      return;
    }
  }
  memoryStore.delete(key);
  removeFromSessionStorage(actorId, orderItemId);
  notifyListeners();
}

export function clearActorInDoubtSubmissions(actorId: string): void {
  for (const [key, val] of memoryStore.entries()) {
    if (val.actorId === actorId) {
      memoryStore.delete(key);
    }
  }
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const prefix = `freya:review:in-doubt:${actorId}:`;
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i);
        if (k && k.startsWith(prefix)) {
          keysToRemove.push(k);
        }
      }
      for (const k of keysToRemove) {
        window.sessionStorage.removeItem(k);
      }
    } catch {
      /* Ignore */
    }
  }
  notifyListeners();
}

export function clearAllInDoubtSubmissions(): void {
  memoryStore.clear();
  activeRequests.clear();
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const prefix = 'freya:review:in-doubt:';
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i);
        if (k && k.startsWith(prefix)) {
          keysToRemove.push(k);
        }
      }
      for (const k of keysToRemove) {
        window.sessionStorage.removeItem(k);
      }
    } catch {
      /* Ignore */
    }
  }
  notifyListeners();
}
