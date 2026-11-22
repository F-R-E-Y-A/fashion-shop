import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Pager } from './Pager.js';

describe('Pager', () => {
  afterEach(() => vi.restoreAllMocks());

  it('cuộn lên đầu trang khi chuyển trang mặc định và bỏ qua khi scrollToTop=false', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    const onChange = vi.fn();

    const { rerender } = render(<Pager page={1} totalPages={3} total={30} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(onChange).toHaveBeenCalledWith(2);
    expect(scrollTo).toHaveBeenCalledWith({ left: 0, top: 0, behavior: 'instant' });

    scrollTo.mockClear();
    rerender(<Pager page={1} totalPages={3} total={30} scrollToTop={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
