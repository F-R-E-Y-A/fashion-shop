import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useHeaderState } from './useHeaderState.js';

function Probe() {
  const { headerRef, isHome, overHero } = useHeaderState();
  return (
    <header ref={headerRef} data-testid="header" data-home={isHome} data-over-hero={overHero} />
  );
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Probe />
    </MemoryRouter>,
  );

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => value });
}

describe('useHeaderState (PH-01 trang chu)', () => {
  afterEach(() => {
    setScrollY(0);
    vi.unstubAllGlobals();
    document.documentElement.style.removeProperty('--header-h');
  });

  it('trang chu o dau trang: trong suot tren hero; cuon qua 40 px thi dac mau', () => {
    setScrollY(0);
    renderAt('/');
    const header = screen.getByTestId('header');
    expect(header).toHaveAttribute('data-home', 'true');
    expect(header).toHaveAttribute('data-over-hero', 'true');

    setScrollY(41);
    fireEvent.scroll(window);
    expect(header).toHaveAttribute('data-over-hero', 'false');
    expect(header).toHaveAttribute('data-home', 'true');

    setScrollY(10);
    fireEvent.scroll(window);
    expect(header).toHaveAttribute('data-over-hero', 'true');
  });

  it('trang khac khong bao gio trong suot va khong keo hero len', () => {
    setScrollY(0);
    renderAt('/danh-muc/ao');
    const header = screen.getByTestId('header');
    expect(header).toHaveAttribute('data-home', 'false');
    expect(header).toHaveAttribute('data-over-hero', 'false');
  });

  it('do chieu cao header bang ResizeObserver va dat len --header-h', () => {
    let notify: () => void = () => undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const { unmount } = renderAt('/');
    const header = screen.getByTestId('header');
    Object.defineProperty(header, 'offsetHeight', { configurable: true, value: 95 });
    act(() => notify());
    expect(document.documentElement.style.getPropertyValue('--header-h')).toBe('95px');
    expect(observe).toHaveBeenCalledWith(header);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it('moi truong khong co ResizeObserver thi khong loi', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    expect(() => renderAt('/')).not.toThrow();
  });
});
