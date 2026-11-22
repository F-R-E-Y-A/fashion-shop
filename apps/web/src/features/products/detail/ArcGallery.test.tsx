import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ArcGallery, type GalleryImage } from './ArcGallery.js';

const shots = (count: number, prefix = 'anh'): GalleryImage[] =>
  Array.from({ length: count }, (_, index) => ({
    url: `/${prefix}-${index + 1}.jpg`,
    alt: `${prefix} ${index + 1}`,
  }));

function Harness({
  images,
  failed = new Set<string>(),
  onOpen = () => {},
  onImageError = () => {},
  colorName = null,
  resetKey = 'den',
}: {
  images: GalleryImage[];
  failed?: ReadonlySet<string>;
  onOpen?: () => void;
  onImageError?: (url: string) => void;
  colorName?: string | null;
  resetKey?: string;
}) {
  const [active, setActive] = useState(0);
  return (
    <ArcGallery
      images={images}
      active={active}
      onActiveChange={setActive}
      failedUrls={failed}
      onImageError={onImageError}
      onOpen={onOpen}
      resetKey={resetKey}
      colorName={colorName}
      emptyLabel="Sản phẩm chưa có ảnh phù hợp với màu này."
    />
  );
}

const shown = () => screen.getByRole('img').getAttribute('src');

describe('ArcGallery (UC-03.4)', () => {
  it('khong co anh: bao trang thai, khong co day anh', () => {
    render(<Harness images={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Sản phẩm chưa có ảnh phù hợp');
    expect(screen.queryByRole('button', { name: /^Xem ảnh/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Phóng to ảnh' })).not.toBeInTheDocument();
  });

  it('mot anh: chi khung xem, van phong to duoc', () => {
    const onOpen = vi.fn();
    render(<Harness images={shots(1)} onOpen={onOpen} />);
    expect(screen.getByRole('img', { name: 'anh 1' })).toHaveAttribute('src', '/anh-1.jpg');
    expect(screen.queryByRole('button', { name: 'Ảnh tiếp theo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Xem ảnh/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Phóng to ảnh' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('chi anh trong khung mang alt; the trong day la anh trang tri', () => {
    render(<Harness images={shots(3)} />);
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /^Xem ảnh/ })).toHaveLength(3);
  });

  it('bam the doi anh trong khung va danh dau the dang xem', () => {
    render(<Harness images={shots(4)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Xem ảnh 3' }));
    expect(shown()).toBe('/anh-3.jpg');
    expect(screen.getByRole('button', { name: 'Xem ảnh 3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Ảnh 3 trên 4.')).toBeInTheDocument();
  });

  it('nut truoc/sau quay vong nhu gallery cu', () => {
    render(<Harness images={shots(3)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ảnh trước' }));
    expect(shown()).toBe('/anh-3.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Ảnh tiếp theo' }));
    expect(shown()).toBe('/anh-1.jpg');
  });

  it('doi anh: anh cu nam duoi trong luc mo, mo xong thi bo di', () => {
    render(<Harness images={shots(3)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ảnh tiếp theo' }));
    const media = () => screen.getByRole('img').parentElement!.querySelectorAll('img');
    expect(media()).toHaveLength(2);
    // jsdom khong co AnimationEvent nen React nghe ban tien to webkit; ban ca hai cho chac.
    const shot = screen.getByRole('img');
    fireEvent.animationEnd(shot);
    fireEvent(shot, new Event('webkitAnimationEnd', { bubbles: true }));
    expect(media()).toHaveLength(1);
    expect(shown()).toBe('/anh-2.jpg');
  });

  it('phim mui ten, Home, End, Enter tren thu vien', () => {
    const onOpen = vi.fn();
    render(<Harness images={shots(5)} onOpen={onOpen} />);
    const gallery = screen.getByRole('group', { name: /Thư viện ảnh sản phẩm/ });
    fireEvent.keyDown(gallery, { key: 'ArrowRight' });
    expect(shown()).toBe('/anh-2.jpg');
    fireEvent.keyDown(gallery, { key: 'End' });
    expect(shown()).toBe('/anh-5.jpg');
    fireEvent.keyDown(gallery, { key: 'ArrowRight' });
    expect(shown()).toBe('/anh-1.jpg');
    fireEvent.keyDown(gallery, { key: 'Home' });
    fireEvent.keyDown(gallery, { key: 'ArrowLeft' });
    expect(shown()).toBe('/anh-5.jpg');
    fireEvent.keyDown(gallery, { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('Enter tren nut ben trong khong mo them Lightbox', () => {
    const onOpen = vi.fn();
    render(<Harness images={shots(3)} onOpen={onOpen} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Ảnh tiếp theo' }), { key: 'Enter' });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('bam vao khung thi phong to; bam nut tren khung khong mo nham', () => {
    const onOpen = vi.fn();
    render(<Harness images={shots(3)} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('img', { name: 'anh 1' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Ảnh tiếp theo' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('anh loi: bao trang thai, khong phong to, day van chon duoc anh khac', () => {
    const onOpen = vi.fn();
    const onImageError = vi.fn();
    render(
      <Harness
        images={shots(2)}
        failed={new Set(['/anh-1.jpg'])}
        onOpen={onOpen}
        onImageError={onImageError}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Ảnh này hiện không tải được.');
    expect(screen.queryByRole('button', { name: 'Phóng to ảnh' })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('group'), { key: 'Enter' });
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Xem ảnh 2' }));
    const second = screen.getByRole('img', { name: 'anh 2' });
    fireEvent.error(second);
    expect(onImageError).toHaveBeenCalledWith('/anh-2.jpg');
  });

  it('doi mau: chia bai lai ve anh dau, khung chi con mot anh mang alt', () => {
    const { rerender } = render(<Harness images={shots(3)} colorName="Đen" />);
    expect(screen.getByText('Đen')).toBeInTheDocument();
    rerender(<Harness images={shots(2, 'trang')} colorName="Trắng" resetKey="trang" />);
    expect(screen.getByRole('img', { name: 'trang 1' })).toHaveAttribute('src', '/trang-1.jpg');
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /^Xem ảnh/ })).toHaveLength(2);
  });
});
