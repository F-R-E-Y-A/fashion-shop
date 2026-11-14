import { useCallback, useEffect, useRef } from 'react';

export const CATEGORY_REQUEST_TIMEOUT_MS = 15_000;
let operationSequence = 0;

export function nextCategoryOperationId() {
  return ++operationSequence;
}

/** Cache operations may finish after navigation; their old form must not be updated. */
export function useCategoryViewActive() {
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return useCallback(() => active.current, []);
}

/** Also bounds clients that fail to reject immediately when the signal is aborted. */
export async function categoryRequest<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new DOMException('Hết thời gian chờ phản hồi danh mục', 'TimeoutError');
        controller.abort(error);
        reject(error);
      }, CATEGORY_REQUEST_TIMEOUT_MS);
    });
    return await Promise.race([request(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
