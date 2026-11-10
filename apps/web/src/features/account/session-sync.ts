/**
 * Phoi hop phien dang nhap giua cac yeu cau va giua cac tab cung goc (Issue #43, ADR-026).
 *
 * Ba co che, moi cai chan mot loai ket qua den muon:
 *  - KHOA: login, logout, refresh va doi mat khau la nhung thao tac DAT hay XOA cookie refresh dung
 *    chung. Chung xep hang qua mot khoa Web Locks de cookie doi theo dung thu tu nguoi dung bam.
 *  - DAU PHIEN: mot chuoi ngau nhien trong localStorage, doi moi khi phien cookie cua trinh duyet doi
 *    (dang nhap, dang xuat cua tab con so huu phien, doi mat khau). Tab doc lai NGAY TRUOC khi gui de
 *    biet cookie con la cua phien minh khong.
 *  - KENH: BroadcastChannel chi la tin hieu "kiem lai". Tab nhan so dau minh giu voi dau hien tai:
 *    trung nhau thi tin do cu hon phien cua no (vd tin den muon cua mot lan dang nhap truoc), bo qua.
 * Dau phien va tin nhan khong chua token, id hay email.
 */

export class SessionChangedError extends Error {
  constructor() {
    super('Phiên đăng nhập đã thay đổi. Hãy đăng nhập lại.');
    this.name = 'SessionChangedError';
  }
}

const AUTH_LOCK_NAME = 'fashion-shop:auth-refresh';
const SESSION_MARKER_KEY = 'fashion-shop:auth-session';
const SESSION_CHANNEL_NAME = 'fashion-shop:auth';
const SESSION_CHANGED = 'session-changed';

/** Mot tab treo mang khong duoc giu khoa mai: cac tab khac dang cho dang nhap, dang xuat. */
export const AUTH_LOCK_TIMEOUT_MS = 15_000;

export type AuthLock = <T>(task: (signal: AbortSignal) => Promise<T>) => Promise<T>;

/**
 * Tao khoa cho mot AuthProvider. Luat de khong bao gio tu cho chinh minh: `task` chi gom MOT lan goi
 * mang tho (khong goi authenticatedRequest, khong xin khoa lan nua, khong cho refresh dang bay).
 * Trinh duyet khong co Web Locks thi xep hang trong tab bang chuoi promise.
 */
export function createAuthLock(): AuthLock {
  let tail: Promise<unknown> = Promise.resolve();

  return <T>(task: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const run = async (): Promise<T> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), AUTH_LOCK_TIMEOUT_MS);
      try {
        return await task(controller.signal);
      } finally {
        clearTimeout(timer);
      }
    };

    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    if (locks) return locks.request(AUTH_LOCK_NAME, run);

    const next = tail.then(run, run);
    tail = next.catch(() => undefined);
    return next;
  };
}

/** `undefined` nghia la storage khong dung duoc (bi chan, che do rieng tu): bo qua kiem dau phien. */
export type SessionMarker = string | null | undefined;

export function readSessionMarker(): SessionMarker {
  try {
    return localStorage.getItem(SESSION_MARKER_KEY);
  } catch {
    return undefined;
  }
}

/** Goi BEN TRONG khoa, moi khi phien cookie cua trinh duyet vua doi (hoac sap ket thuc). */
export function writeSessionMarker(): SessionMarker {
  const value =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  try {
    localStorage.setItem(SESSION_MARKER_KEY, value);
    return value;
  } catch {
    return undefined;
  }
}

/** Chi ket luan "da doi" khi doc duoc ca hai; khong doc duoc thi de lop kiem userId lo. */
export function sessionMarkerChanged(known: SessionMarker, current: SessionMarker): boolean {
  return known !== undefined && current !== undefined && known !== current;
}

/**
 * Tab co dang giu dung phien hien tai cua trinh duyet khong. Doc khong duoc dau (storage bi chan) thi
 * coi la KHONG: thieu bang chung thi xoa trang thai local con hon giu mot phien co the da ket thuc.
 */
export function holdsCurrentSession(known: SessionMarker): boolean {
  const current = readSessionMarker();
  return known !== undefined && current !== undefined && known === current;
}

export interface SessionChannel {
  notify(): void;
  close(): void;
}

export function openSessionChannel(onSessionChanged: () => void): SessionChannel {
  if (typeof BroadcastChannel !== 'function') return { notify() {}, close() {} };

  const channel = new BroadcastChannel(SESSION_CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const data = event.data as { type?: unknown } | null;
    if (data?.type === SESSION_CHANGED) onSessionChanged();
  };
  return {
    notify: () => channel.postMessage({ type: SESSION_CHANGED }),
    close: () => channel.close(),
  };
}

/**
 * Gop tin hieu huy cua nguoi goi voi tin hieu cua phien. Tra kem `dispose` de go listener khi yeu cau
 * xong, vi tin hieu phien song suot phien va se tich listener neu khong go.
 */
export function linkAbortSignals(signals: (AbortSignal | undefined)[]): {
  signal: AbortSignal;
  dispose(): void;
} {
  const controller = new AbortController();
  const cleanups: (() => void)[] = [];
  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    const onAbort = () => controller.abort(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    cleanups.push(() => signal.removeEventListener('abort', onAbort));
  }
  return { signal: controller.signal, dispose: () => cleanups.forEach((cleanup) => cleanup()) };
}
