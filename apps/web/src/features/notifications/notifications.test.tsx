import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationBell } from './components/NotificationBell.js';

const mockApiGet = vi.fn();
const mockApiPatch = vi.fn();
const mockApiPost = vi.fn();
const mockUser = { id: 'u-1', email: 'user@example.test', roles: ['CUSTOMER'] };

vi.mock('@/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core')>();
  return {
    ...actual,
    apiGet: (...args: unknown[]) => mockApiGet(...args),
    apiPatch: (...args: unknown[]) => mockApiPatch(...args),
    apiPost: (...args: unknown[]) => mockApiPost(...args),
  };
});

vi.mock('@/features/account', () => ({
  useAuth: () => ({
    user: mockUser,
  }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('NotificationBell', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPatch.mockReset();
    mockApiPost.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('hiển thị chuông thông báo và số lượng chưa đọc', async () => {
    mockApiGet.mockResolvedValueOnce({
      items: [
        {
          id: 'n-1',
          type: 'ORDER_STATUS_CHANGED',
          title: 'Đơn hàng đã được xác nhận',
          message: 'Đơn hàng FR123456 đã được xác nhận',
          link: '/tai-khoan/don-hang/o-1',
          isRead: false,
          createdAt: new Date().toISOString(),
        },
      ],
      unreadCount: 1,
    });

    renderWithClient(<NotificationBell />);

    const button = await screen.findByRole('button', {
      name: /Thông báo \(1 chưa đọc\)/,
    });
    expect(button).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('mở danh sách thông báo khi click vào chuông', async () => {
    const user = userEvent.setup();
    mockApiGet.mockResolvedValueOnce({
      items: [
        {
          id: 'n-1',
          type: 'ORDER_STATUS_CHANGED',
          title: 'Đơn hàng đang giao',
          message: 'Kiện hàng đang trên đường tới bạn',
          link: '/tai-khoan/don-hang/o-1',
          isRead: false,
          createdAt: new Date().toISOString(),
        },
      ],
      unreadCount: 1,
    });

    renderWithClient(<NotificationBell />);

    const button = await screen.findByRole('button', {
      name: /Thông báo/,
    });
    await user.click(button);

    expect(screen.getByRole('dialog', { name: 'Danh sách thông báo' })).toBeInTheDocument();
    expect(screen.getByText('Đơn hàng đang giao')).toBeInTheDocument();
    expect(screen.getByText('Kiện hàng đang trên đường tới bạn')).toBeInTheDocument();
  });

  it('cho phép đánh dấu tất cả đã đọc', async () => {
    const user = userEvent.setup();
    mockApiGet.mockResolvedValue({
      items: [
        {
          id: 'n-1',
          type: 'ORDER_STATUS_CHANGED',
          title: 'Đơn hàng mới',
          message: 'Nội dung thông báo',
          link: null,
          isRead: false,
          createdAt: new Date().toISOString(),
        },
      ],
      unreadCount: 1,
    });
    mockApiPost.mockResolvedValueOnce({ count: 1 });

    renderWithClient(<NotificationBell />);

    const button = await screen.findByRole('button', { name: /Thông báo/ });
    await user.click(button);

    const markAllBtn = screen.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' });
    await user.click(markAllBtn);

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/notifications/mark-all-read');
    });
  });

  it('click vào thông báo chưa đọc sẽ gửi yêu cầu đánh dấu đã đọc', async () => {
    const user = userEvent.setup();
    mockApiGet.mockResolvedValue({
      items: [
        {
          id: 'n-2',
          type: 'ORDER_STATUS_CHANGED',
          title: 'Giao hàng thành công',
          message: 'Cảm ơn bạn đã mua sắm',
          link: '/tai-khoan/don-hang/o-2',
          isRead: false,
          createdAt: new Date().toISOString(),
        },
      ],
      unreadCount: 1,
    });
    mockApiPatch.mockResolvedValueOnce({ id: 'n-2', isRead: true });

    renderWithClient(<NotificationBell />);

    const button = await screen.findByRole('button', { name: /Thông báo/ });
    await user.click(button);

    const itemBtn = screen.getByRole('button', { name: /Giao hàng thành công/ });
    await user.click(itemBtn);

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/notifications/n-2/read');
    });
  });

  it('hiển thị trạng thái rỗng khi không có thông báo', async () => {
    const user = userEvent.setup();
    mockApiGet.mockResolvedValueOnce({
      items: [],
      unreadCount: 0,
    });

    renderWithClient(<NotificationBell />);

    const button = await screen.findByRole('button', { name: /Thông báo \(0 chưa đọc\)/ });
    await user.click(button);

    expect(screen.getByText('Bạn chưa có thông báo nào')).toBeInTheDocument();
  });

  it('gọi đúng endpoint admin khi isAdmin = true', async () => {
    mockApiGet.mockResolvedValueOnce({
      items: [],
      unreadCount: 0,
    });

    renderWithClient(<NotificationBell isAdmin />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/admin/notifications', undefined, expect.anything());
    });
  });
});
