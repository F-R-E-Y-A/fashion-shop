import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { SearchInterpretation } from '../api/index.js';
import { type CatalogParams, emptyCatalogParams } from '../lib/catalog-params.js';
import { facets, interpretation } from '../test-support/catalog-fixtures.js';
import { FilterPanel } from './FilterPanel.js';

/** Giu params trong state that de kiem tra ket qua sau khi bam. */
function Harness({
  initial = emptyCatalogParams,
  interp,
  sheetOpen = false,
  onCloseSheet = () => undefined,
  onParams,
}: {
  initial?: CatalogParams;
  interp?: SearchInterpretation;
  sheetOpen?: boolean;
  onCloseSheet?: () => void;
  onParams?: (params: CatalogParams) => void;
}) {
  const [params, setParams] = useState(initial);
  onParams?.(params);
  return (
    <FilterPanel
      id="filters"
      facets={facets}
      interpretation={interp}
      params={params}
      total={12}
      sheetOpen={sheetOpen}
      onCloseSheet={onCloseSheet}
      onChange={setParams}
      onClear={() => setParams(emptyCatalogParams)}
    />
  );
}

describe('FilterPanel (UC-03.3)', () => {
  it('UC-03.3/AC2 bam mau khong co trong cau thi them colors va danh dau dang chon', () => {
    let latest = emptyCatalogParams;
    render(<Harness onParams={(p) => (latest = p)} />);
    const den = screen.getByRole('button', { name: /Đen/ });
    expect(den).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(den);
    expect(latest.colors).toEqual(['den']);
    expect(screen.getByRole('button', { name: /Đen/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('UC-03.3 bam mau dang den tu cau thi xoa chu do khoi cau, khong them tham so', () => {
    let latest = emptyCatalogParams;
    render(
      <Harness
        initial={{ ...emptyCatalogParams, q: 'polo nữ trắng dưới 100k' }}
        interp={interpretation}
        onParams={(p) => (latest = p)}
      />,
    );
    const trang = screen.getByRole('button', { name: /Trắng/ });
    expect(trang).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(trang);
    expect(latest).toMatchObject({ q: 'polo nữ dưới 100k', colors: [] });
  });

  it('UC-03.3 an lua chon co dem 0, tru khi dang chon', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: /Hồng/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Từ 500\.000/ })).not.toBeInTheDocument();
    render(<Harness initial={{ ...emptyCatalogParams, colors: ['hong'] }} />);
    expect(screen.getByRole('button', { name: /Hồng/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('UC-03.3 doi tuong la hai nut co dem; chon Nam khi cau noi Nu dat tham so va bo "nữ"', () => {
    let latest = emptyCatalogParams;
    render(
      <Harness
        initial={{ ...emptyCatalogParams, q: 'polo nữ trắng dưới 100k' }}
        interp={interpretation}
        onParams={(p) => (latest = p)}
      />,
    );
    expect(screen.getByRole('button', { name: /^Nữ/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /^Nam/ }));
    expect(latest).toMatchObject({ audience: 'nam', q: 'polo trắng dưới 100k' });
  });

  it('UC-03.3 gia chon mot moc va noi ro khi gia den tu cau', () => {
    let latest = emptyCatalogParams;
    render(
      <Harness
        initial={{ ...emptyCatalogParams, q: 'polo dưới 100k' }}
        interp={interpretation}
        onParams={(p) => (latest = p)}
      />,
    );
    expect(screen.getByText('Đang theo câu: Dưới 100.000 ₫')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /100\.000 – 300\.000/ }));
    expect(latest).toMatchObject({ minPrice: 100000, maxPrice: 299999 });
  });

  it('UC-03.3 danh muc cha roi con, an duoc khi trang danh muc da co san danh muc', () => {
    render(<Harness />);
    const group = screen.getByRole('heading', { name: 'Danh mục' }).parentElement as HTMLElement;
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Áo10', 'Áo polo6', 'Quần3']);
  });

  it('UC-03.3 tam bo loc tren dien thoai: la hop thoai modal, focus vao nut dong, Esc dong', () => {
    const close = vi.fn();
    render(<Harness sheetOpen onCloseSheet={close} />);
    const dialog = screen.getByRole('dialog', { name: 'Bộ lọc' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Đóng bộ lọc' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Xem 12 sản phẩm' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('UC-03.3 khi khong o che do tam thi khong phai hop thoai va khong khoa cuon', () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.documentElement.style.overflow).toBe('');
  });
});
