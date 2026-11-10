import { useMutation, useQueryClient } from '@tanstack/react-query';

import { type Cart, cartKeys } from './cart.api.js';

/** Huy GET cu truoc khi ghi; cac thao tac gio tren cung tab duoc xep hang. */
export function useCartMutation<T>(mutationFn: (variables: T) => Promise<Cart | { ok: boolean }>) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: cartKeys.all,
    scope: { id: 'cart' },
    mutationFn,
    onMutate: () => client.cancelQueries({ queryKey: cartKeys.all }),
    onSuccess: (data) => {
      if ('cartId' in data) client.setQueryData(cartKeys.current(), data);
    },
    onSettled: () => {
      if (client.isMutating({ mutationKey: cartKeys.all }) === 1) {
        return client.invalidateQueries({ queryKey: cartKeys.all });
      }
    },
  });
}
