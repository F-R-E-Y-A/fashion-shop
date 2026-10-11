import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import { Lightbox } from './Lightbox.js';

const IMAGES = [
  { url: 'https://cdn.test/a.jpg', alt: 'Ảnh một' },
  { url: 'https://cdn.test/b.jpg', alt: 'Ảnh hai' },
  { url: 'https://cdn.test/c.jpg', alt: 'Ảnh ba' },
];

/** Lightbox khong tu giu index; mo bang trang cha nen test cung dung state ngoai nhu trang that. */
function TestHost({ startIndex = 0 }: { startIndex?: number }) {
  const [index, setIndex] = useState(startIndex);
  return (
    <Lightbox images={IMAGES} index={index} onClose={() => setIndex(-1)} onNavigate={setIndex} />
  );
}

describe('Lightbox (PH-01)', () => {
  it('hien anh dang xem va bo dem vi tri', () => {
    render(<TestHost startIndex={1} />);
    expect(screen.getByRole('dialog', { name: 'Thư viện ảnh sản phẩm' })).toBeInTheDocument();
    expect(screen.getByAltText('Ảnh hai')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('bam ESC va bam backdrop de dong, bam vao anh thi khong dong', () => {
    const { container } = render(<TestHost />);
    fireEvent.click(screen.getByAltText('Ảnh một')); // bam trong anh: khong dong
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    render(<TestHost />);
    fireEvent.click(screen.getByRole('dialog')); // bam vung backdrop
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(container).toBeInTheDocument();
  });

  it('mui ten va ban phim duyen vong quay lai va doi anh qua onNavigate', () => {
    render(<TestHost startIndex={2} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ảnh tiếp theo' })); // 2 -> 0
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' }); // 0 -> 2
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
  });

  it('khoa cuon trang nen khi mo va tra lai khi dong', () => {
    const { unmount } = render(<TestHost />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
