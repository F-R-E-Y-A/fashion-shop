import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ScrollManager } from './ScrollManager.js';

function CatalogPage() {
  const navigate = useNavigate();
  return <button onClick={() => navigate('/product')}>Mở sản phẩm</button>;
}

function ProductPage() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>Quay lại</button>;
}

describe('ScrollManager', () => {
  afterEach(() => vi.restoreAllMocks());

  it('starts pushed routes at the top and restores the saved position on Back', () => {
    let scrollY = 0;
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => scrollY,
    });
    const scrollTo = vi.fn((options: ScrollToOptions) => {
      scrollY = options.top ?? scrollY;
    });
    vi.stubGlobal('scrollTo', scrollTo);

    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <ScrollManager />
        <Routes>
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/product" element={<ProductPage />} />
        </Routes>
      </MemoryRouter>,
    );

    scrollTo.mockClear();
    scrollY = 270;
    fireEvent.scroll(window);
    fireEvent.click(screen.getByRole('button', { name: 'Mở sản phẩm' }));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 0, behavior: 'instant' });

    scrollY = 340;
    fireEvent.scroll(window);
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 270, behavior: 'instant' });
  });
});
