import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StorefrontLiveUpdates } from './StorefrontLiveUpdates.js';

class Stream extends EventTarget {
  static current: Stream;
  close = vi.fn();
  constructor() {
    super();
    Stream.current = this;
  }
}

afterEach(() => vi.unstubAllGlobals());

function setup() {
  vi.stubGlobal('EventSource', Stream);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const cart = vi.fn(async () => 'cart');
  const products = vi.fn(async () => 'products');
  function View() {
    useQuery({ queryKey: ['cart', 'current'], queryFn: cart });
    useQuery({ queryKey: ['products', 'list'], queryFn: products });
    return <StorefrontLiveUpdates />;
  }
  const view = render(
    <QueryClientProvider client={client}>
      <View />
    </QueryClientProvider>,
  );
  return { client, cart, products, ...view };
}

describe('PH-11 storefront live updates', () => {
  it('proxy mất SSE vẫn cập nhật bằng polling và dừng polling khi có event trở lại', async () => {
    const view = setup();
    await waitFor(() => expect(view.cart).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();
    try {
      act(() => Stream.current.dispatchEvent(new Event('error')));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(view.cart).toHaveBeenCalledTimes(2);
      act(() => Stream.current.dispatchEvent(new Event('catalog-changed')));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(view.cart).toHaveBeenCalledTimes(3);
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
  it('refetch khi co revision, bao mat ket noi/phuc hoi, dong stream khi unmount', async () => {
    const view = setup();
    await waitFor(() => expect(view.cart).toHaveBeenCalledTimes(1));
    act(() => Stream.current.dispatchEvent(new Event('catalog-changed')));
    await waitFor(() => expect(view.cart).toHaveBeenCalledTimes(2));
    expect(view.products).toHaveBeenCalledTimes(2);
    act(() => Stream.current.dispatchEvent(new Event('error')));
    expect(screen.getByRole('status')).toHaveTextContent('Đang kết nối lại');
    act(() => Stream.current.dispatchEvent(new Event('catalog-changed')));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    view.unmount();
    expect(Stream.current.close).toHaveBeenCalledOnce();
  });

  it('hoan GET Cart khi dang sua de response cu khong ghi de quantity moi', async () => {
    const view = setup();
    await waitFor(() => expect(view.cart).toHaveBeenCalledTimes(1));
    let release!: () => void;
    const mutation = view.client.getMutationCache().build(view.client, {
      mutationKey: ['cart'],
      mutationFn: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    });
    let done!: Promise<unknown>;
    await act(async () => {
      done = mutation.execute(undefined);
      await Promise.resolve();
    });
    act(() => Stream.current.dispatchEvent(new Event('catalog-changed')));
    expect(view.cart).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
      await done;
    });
    await waitFor(() => expect(view.cart).toHaveBeenCalledTimes(2));
  });
});
