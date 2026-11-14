import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getNotifications,
  isForbiddenError,
  markAllNotificationsRead,
  markNotificationRead,
  notificationKeys,
} from './api/notifications.api.js';
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

  it('xử lý an toàn khi API trả 401 Unauthorized (không crash, hiển thị 0 chưa đọc)', async () => {
    mockApiGet.mockRejectedValueOnce({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Phiên đăng nhập đã hết hạn',
    });

    renderWithClient(<NotificationBell />);

    const button = await screen.findByRole('button', { name: /Thông báo \(0 chưa đọc\)/ });
    expect(button).toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('không tự động tải thông báo trước khi mở nếu autoFetch = false', async () => {
    renderWithClient(<NotificationBell autoFetch={false} />);
    expect(mockApiGet).not.toHaveBeenCalled();

    const user = userEvent.setup();
    mockApiGet.mockResolvedValueOnce({
      items: [],
      unreadCount: 0,
    });

    const button = screen.getByRole('button', { name: /Thông báo \(0 chưa đọc\)/ });
    await user.click(button);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalled();
    });
  });

  it('quản lý bàn phím và focus: mở hộp chuyển focus vào trong, giữ Tab vòng kín và Escape trả focus về chuông', async () => {
    const user = userEvent.setup();
    mockApiGet.mockResolvedValue({
      items: [
        {
          id: 'n-1',
          type: 'ORDER_STATUS_CHANGED',
          title: 'Thông báo 1',
          message: 'Nội dung 1',
          link: '/don-hang/o-1',
          isRead: false,
          createdAt: new Date().toISOString(),
        },
      ],
      unreadCount: 1,
    });

    renderWithClient(<NotificationBell />);

    const bellBtn = await screen.findByRole('button', { name: /Thông báo \(1 chưa đọc\)/ });
    await user.click(bellBtn);

    const markAllBtn = screen.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' });
    const itemBtn = screen.getByRole('button', { name: /Thông báo 1/ });

    // Khi mở hộp, focus chuyển vào nút đầu tiên trong dialog
    expect(markAllBtn).toHaveFocus();

    // Tab chuyển sang mục thông báo, Tab tiếp quay vòng về nút đầu
    await user.tab();
    expect(itemBtn).toHaveFocus();
    await user.tab();
    expect(markAllBtn).toHaveFocus();

    // Shift+Tab quay ngược về nút cuối
    await user.tab({ shift: true });
    expect(itemBtn).toHaveFocus();

    // Bấm Escape đóng hộp và trả focus về nút chuông
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(bellBtn).toHaveFocus();
  });

  it('gắn khóa cache dưới gốc session và xóa dữ liệu admin của actor khi nhận 403', async () => {
    expect(notificationKeys.userList('u-1')[0]).toBe('session');
    expect(notificationKeys.adminList('u-1').slice(0, 4)).toEqual([
      'session',
      'admin',
      'notifications',
      'u-1',
    ]);

    mockApiGet.mockRejectedValueOnce({
      status: 403,
      code: 'FORBIDDEN',
    });

    renderWithClient(<NotificationBell isAdmin />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(1);
    });
  });

  describe('notifications API error propagation & 403 regression', () => {
    it('isForbiddenError nhận diện đúng mã 403 từ ApiError, status, statusCode hoặc response', () => {
      expect(isForbiddenError({ status: 403 })).toBe(true);
      expect(isForbiddenError({ statusCode: 403 })).toBe(true);
      expect(isForbiddenError({ body: { statusCode: 403 } })).toBe(true);
      expect(isForbiddenError({ response: { status: 403 } })).toBe(true);
      expect(isForbiddenError({ status: 500 })).toBe(false);
      expect(isForbiddenError(new Error('fail'))).toBe(false);
    });

    it('getNotifications ném lỗi từ request được truyền vào thay vì nuốt lỗi', async () => {
      const customError = new Error('request failed');
      const mockRequest = vi.fn().mockRejectedValue(customError);

      await expect(getNotifications(false, undefined, { request: mockRequest })).rejects.toThrow(
        'request failed',
      );
      expect(mockRequest).toHaveBeenCalledWith('/notifications', { signal: undefined });
    });

    it('getNotifications ném lỗi 403 và kích hoạt onForbidden khi isAdmin=true', async () => {
      const forbiddenError = { status: 403, message: 'Forbidden' };
      const mockRequest = vi.fn().mockRejectedValue(forbiddenError);
      const onForbidden = vi.fn();

      await expect(
        getNotifications(true, undefined, { request: mockRequest, onForbidden }),
      ).rejects.toEqual(forbiddenError);
      expect(onForbidden).toHaveBeenCalledTimes(1);
    });

    it('markNotificationRead ném lỗi từ request và kích hoạt onForbidden khi 403', async () => {
      const forbiddenError = { statusCode: 403 };
      const mockRequest = vi.fn().mockRejectedValue(forbiddenError);
      const onForbidden = vi.fn();

      await expect(
        markNotificationRead('n-1', true, { request: mockRequest, onForbidden }),
      ).rejects.toEqual(forbiddenError);
      expect(onForbidden).toHaveBeenCalledTimes(1);
    });

    it('markAllNotificationsRead ném lỗi từ request và kích hoạt onForbidden khi 403', async () => {
      const forbiddenError = { body: { statusCode: 403 } };
      const mockRequest = vi.fn().mockRejectedValue(forbiddenError);
      const onForbidden = vi.fn();

      await expect(
        markAllNotificationsRead(true, { request: mockRequest, onForbidden }),
      ).rejects.toEqual(forbiddenError);
      expect(onForbidden).toHaveBeenCalledTimes(1);
    });
  });
});
