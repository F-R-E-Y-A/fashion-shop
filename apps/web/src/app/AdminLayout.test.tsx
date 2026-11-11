import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AdminLayout } from './AdminLayout.js';

vi.mock('@/features/account', () => ({
  useAuth: () => ({ user: { id: 'actor', email: 'admin@example.test', roles: ['ADMIN'] } }),
}));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    if (!this.open) return;
    this.removeAttribute('open');
    setTimeout(() => this.dispatchEvent(new Event('close')), 0);
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.style.overflow = '';
});
function media() {
  const listeners = new Set<() => void>();
  const query = {
    matches: true,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => query),
  );
  return (small: boolean) =>
    act(() => {
      query.matches = small;
      listeners.forEach((fn) => fn());
    });
}
function mount(path = '/admin/users') {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<h1>Tổng quan thật</h1>} />
            <Route path="categories" element={<h1>Danh sách danh mục</h1>} />
            <Route path="categories/:id" element={<h1>Chi tiết danh mục</h1>} />
            <Route path="users" element={<h1>Danh sách hiện có</h1>} />
            <Route path="products" element={<h1>Danh sách sản phẩm</h1>} />
            <Route path="products/:id" element={<h1>Chi tiết sản phẩm</h1>} />
            <Route path="vouchers" element={<h1>Danh sách mã giảm giá</h1>} />
            <Route path="vouchers/:id" element={<h1>Chi tiết mã giảm giá</h1>} />
            <Route path="orders" element={<h1>Đơn hiện có</h1>} />
          </Route>
          <Route path="/" element={<h1>Cửa hàng hiện có</h1>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

describe('UC-02.1/AC9 khung admin — Issue #59', () => {
  it('UC-02.1/AC9 drawer trong StrictMode giữ mở, Tab vòng kín và Escape trả focus/khôi phục cuộn', async () => {
    media();
    document.documentElement.style.overflow = 'scroll';
    mount();
    const user = userEvent.setup();
    const opener = screen.getByRole('button', { name: 'Mở điều hướng quản trị' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Menu quản trị' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(dialog).toHaveAttribute('open');
    const close = within(dialog).getByRole('button', { name: 'Đóng điều hướng' });
    const last = within(dialog).getByRole('link', { name: /Về cửa hàng/ });
    expect(close).toHaveFocus();
    expect(document.documentElement.style.overflow).toBe('hidden');
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
    expect(document.documentElement.style.overflow).toBe('scroll');
  });
  it('UC-02.1/AC9 điều hướng trong drawer đóng hộp và giữ route hiện có', async () => {
    media();
    mount();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Mở điều hướng quản trị' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Đơn hàng' }));
    expect(await screen.findByRole('heading', { name: 'Đơn hiện có' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đơn hàng' })).toHaveAttribute('aria-current', 'page');
    expect(document.documentElement.style.overflow).not.toBe('hidden');
  });
  it('UC-02.1/AC9 đổi sang desktop và tháo layout đều dọn khóa cuộn, không giữ drawer mồ côi', async () => {
    const resize = media();
    const view = mount();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Mở điều hướng quản trị' }));
    resize(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.documentElement.style.overflow).toBe('');
    resize(true);
    await user.click(screen.getByRole('button', { name: 'Mở điều hướng quản trị' }));
    view.unmount();
    expect(document.documentElement.style.overflow).toBe('');
  });
  it.each(['/admin/products', '/admin/products/catalog-id'])(
    'UC-04.2/AC9 route %s giữ menu Sản phẩm active và breadcrumb của shell',
    (path) => {
      media();
      mount(path);
      const nav = within(screen.getByRole('complementary')).getByRole('navigation');
      expect(within(nav).getByRole('link', { name: 'Sản phẩm' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      const breadcrumb = screen.getByRole('navigation', { name: 'Vị trí hiện tại' });
      expect(within(breadcrumb).getByText('Sản phẩm')).toHaveAttribute('aria-current', 'page');
    },
  );
  it.each(['/admin/categories', '/admin/categories/cat-id'])(
    'UC-04.1/AC6 route %s giữ menu Danh mục active và breadcrumb của shell',
    (path) => {
      media();
      mount(path);
      const nav = within(screen.getByRole('complementary')).getByRole('navigation');
      expect(within(nav).getByRole('link', { name: 'Danh mục' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      const breadcrumb = screen.getByRole('navigation', { name: 'Vị trí hiện tại' });
      expect(within(breadcrumb).getByText('Danh mục')).toHaveAttribute('aria-current', 'page');
    },
  );
  it.each(['/admin/vouchers', '/admin/vouchers/voucher-id'])(
    'UC-10.1/AC6 route %s giữ menu Mã giảm giá active và breadcrumb của shell',
    (path) => {
      media();
      mount(path);
      const nav = within(screen.getByRole('complementary')).getByRole('navigation');
      expect(within(nav).getByRole('link', { name: 'Mã giảm giá' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      const breadcrumb = screen.getByRole('navigation', { name: 'Vị trí hiện tại' });
      expect(within(breadcrumb).getByText('Mã giảm giá')).toHaveAttribute('aria-current', 'page');
    },
  );
  it('UC-02.1/AC9 chỉ có menu đã hoạt động và tài khoản từ phiên, không thêm chức năng mẫu', () => {
    media();
    mount();
    const nav = within(screen.getByRole('complementary')).getByRole('navigation');
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      '/admin',
      '/admin/categories',
      '/admin/products',
      '/admin/vouchers',
      '/admin/users',
      '/admin/orders',
    ]);
    expect(screen.getByText('admin@example.test')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cửa hàng/ })).toHaveAttribute('href', '/');
  });
});
