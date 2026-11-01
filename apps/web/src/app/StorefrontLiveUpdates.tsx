import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { openEventStream } from '@/core';
import { cartKeys } from '@/features/cart';
import { checkoutKeys } from '@/features/checkout';
import { categoryKeys, productKeys } from '@/features/products';

export function StorefrontLiveUpdates() {
  const client = useQueryClient();
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const stream = openEventStream('/products/events');
    let cartDirty = false;
    let fallback: ReturnType<typeof setInterval> | undefined;
    const refreshCart = () => {
      if (
        cartDirty &&
        client.isMutating({ mutationKey: cartKeys.all }) === 0 &&
        client.isMutating({ mutationKey: checkoutKeys.all }) === 0
      ) {
        cartDirty = false;
        void client.invalidateQueries({ queryKey: cartKeys.all });
        void client.invalidateQueries({ queryKey: checkoutKeys.all });
      }
    };
    const refresh = () => {
      void client.invalidateQueries({ queryKey: productKeys.all });
      void client.invalidateQueries({ queryKey: categoryKeys.all });
      cartDirty = true;
      refreshCart();
    };
    const changed = () => {
      setUnavailable(false);
      clearInterval(fallback);
      fallback = undefined;
      refresh();
    };
    const failed = () => {
      setUnavailable(true);
      // Proxy co the chan SSE: tiep tuc doc du lieu, van hoan Cart GET khi dang mutation.
      fallback ??= setInterval(refresh, 5000);
    };
    const unsubscribe = client.getMutationCache().subscribe(refreshCart);
    stream.addEventListener('catalog-changed', changed);
    stream.addEventListener('catalog-unavailable', failed);
    stream.addEventListener('error', failed);
    return () => {
      unsubscribe();
      clearInterval(fallback);
      stream.close();
    };
  }, [client]);
  return unavailable ? (
    <p role="status">
      Đang kết nối lại cập nhật giá và tồn kho. Dữ liệu hiển thị có thể chưa mới nhất.
    </p>
  ) : null;
}
