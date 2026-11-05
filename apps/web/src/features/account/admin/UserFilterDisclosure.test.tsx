import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UserFilterDisclosure } from './UserFilterDisclosure.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function media(small: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: small,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => query),
  );
  return (value: boolean) =>
    act(() => {
      query.matches = value;
      listeners.forEach((fn) => fn());
    });
}
const field = <input aria-label="Email đang nhập" defaultValue="nhap-do@example.test" />;

describe('UC-02.1/AC9 bộ lọc responsive — Issue #59', () => {
  it('mobile thu gọn, mở/đóng không tháo input hoặc mất chữ đang gõ', async () => {
    media(true);
    const view = render(<UserFilterDisclosure active={1}>{field}</UserFilterDisclosure>);
    const details = view.container.querySelector('details')!;
    expect(details.open).toBe(false);
    const user = userEvent.setup();
    const toggle = screen.getByText('Bộ lọc');
    await user.click(toggle);
    expect(details.open).toBe(true);
    const input = screen.getByRole('textbox', { name: 'Email đang nhập' });
    await user.clear(input);
    await user.type(input, 'chu-dang-go');
    await user.click(toggle);
    expect(details.open).toBe(false);
    expect(input).toBeInTheDocument();
    view.rerender(<UserFilterDisclosure active={2}>{field}</UserFilterDisclosure>);
    expect(details.open).toBe(false);
    await user.click(toggle);
    expect(screen.getByRole('textbox')).toHaveValue('chu-dang-go');
  });
  it('desktop mở mặc định; thu gọn vì breakpoint chuyển focus khỏi ô bị ẩn', () => {
    const resize = media(false);
    const view = render(<UserFilterDisclosure active={0}>{field}</UserFilterDisclosure>);
    expect(view.container.querySelector('details')).toHaveAttribute('open');
    const input = screen.getByRole('textbox');
    input.focus();
    fireEvent.focus(input);
    resize(true);
    expect(view.container.querySelector('details')).not.toHaveAttribute('open');
    expect(screen.getByText('Bộ lọc')).toHaveFocus();
    resize(false);
    expect(view.container.querySelector('details')).toHaveAttribute('open');
  });
});
