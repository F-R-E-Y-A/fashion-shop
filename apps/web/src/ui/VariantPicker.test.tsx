import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { type PickerVariant, VariantPicker } from './VariantPicker.js';

const colors = [
  { code: 'den', name: 'Đen', hex: '#000000' },
  { code: 'trang', name: 'Trắng', hex: '#ffffff' },
];
const variant = (
  id: string,
  colorCode: string,
  sizeCode: string,
  availableQuantity: number | null = 5,
): PickerVariant => ({ id, colorCode, sizeCode, priceLabel: '199.000 ₫', availableQuantity });
const variants = [
  variant('den-m', 'den', 'M'),
  variant('den-l', 'den', 'L'),
  variant('den-xl', 'den', 'XL', 0),
  variant('trang-m', 'trang', 'M', 0),
  variant('trang-l', 'trang', 'L'),
];

function setup(overrides: Partial<Parameters<typeof VariantPicker>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <VariantPicker
      colors={colors}
      variants={variants}
      currentVariantId="den-m"
      pending={false}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onConfirm, onCancel };
}

describe('VariantPicker', () => {
  it('mo len chon san bien the hien tai, nut Xac nhan khoa khi chua doi', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Đen' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'M' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeDisabled();
  });

  it('co het hang bi khoa va doc la "het hang"', () => {
    setup();
    expect(screen.getByRole('button', { name: 'XL, hết hàng' })).toBeDisabled();
  });

  it('chon co khac roi Xac nhan thi tra id bien the moi; hien gia va so con', () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'L' }));
    expect(screen.getByText('199.000 ₫ · còn 5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(onConfirm).toHaveBeenCalledWith('den-l');
  });

  it('doi mau ma co dang chon het hang o mau moi thi bo chon co', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Trắng' }));
    expect(screen.getByText('Chọn cỡ còn hàng.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'L' }));
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeEnabled();
  });

  it('Esc va Huy deu goi onCancel', () => {
    const { onCancel } = setup();
    fireEvent.keyDown(screen.getByRole('button', { name: 'L' }), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('dang xu ly thi khoa lua chon va hien "Dang doi"', () => {
    setup({ pending: true });
    expect(screen.getByRole('button', { name: 'L' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Đang đổi…' })).toBeDisabled();
  });
});
