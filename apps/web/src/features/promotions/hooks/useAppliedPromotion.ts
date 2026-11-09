import { useCallback, useEffect, useState } from 'react';

import type { EvaluatedPromotionItem, VoucherApplyResult } from '../api/promotions.api.js';

export interface AppliedPromotionState {
  kind: 'VOUCHER' | 'PROMOTION';
  id: string;
  code?: string;
  name: string;
  discountAmount: string;
  discountType: string;
}

const STORAGE_KEY = 'freya_applied_promotion';
const EVENT_NAME = 'freya:promotion-changed';

function loadFromStorage(): AppliedPromotionState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppliedPromotionState;
  } catch {
    return null;
  }
}

function saveToStorage(val: AppliedPromotionState | null): void {
  try {
    if (val) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(val));
    else sessionStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    // sessionStorage disabled or unavailable
  }
}

export function useAppliedPromotion() {
  const [applied, setApplied] = useState<AppliedPromotionState | null>(loadFromStorage);

  useEffect(() => {
    const onSync = () => setApplied(loadFromStorage());
    window.addEventListener(EVENT_NAME, onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener(EVENT_NAME, onSync);
      window.removeEventListener('storage', onSync);
    };
  }, []);

  const applyVoucherResult = useCallback((result: VoucherApplyResult) => {
    const state: AppliedPromotionState = {
      kind: 'VOUCHER',
      id: result.voucherId,
      code: result.code,
      name: `Mã ưu đãi ${result.code}`,
      discountAmount: result.discountAmount,
      discountType: result.discountType,
    };
    saveToStorage(state);
    setApplied(state);
  }, []);

  const applyEvaluatedPromotion = useCallback((item: EvaluatedPromotionItem) => {
    const state: AppliedPromotionState = {
      kind: 'PROMOTION',
      id: item.promotionId,
      name: item.name,
      discountAmount: item.discountAmount,
      discountType: item.discountType,
    };
    saveToStorage(state);
    setApplied(state);
  }, []);

  const removePromotion = useCallback(() => {
    saveToStorage(null);
    setApplied(null);
  }, []);

  return {
    applied,
    applyVoucherResult,
    applyEvaluatedPromotion,
    removePromotion,
  };
}
