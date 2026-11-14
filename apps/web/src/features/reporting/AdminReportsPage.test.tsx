import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppRoutes } from '@/app';
import { type AuthenticatedUser, AuthProvider } from '@/features/account';

import { type AdminReportSummaryResponse } from './admin-reporting.api';

const adminActor: AuthenticatedUser = {
  id: 'a0000000-0000-4000-8000-000000000001',
  email: 'admin@example.test',
  roles: ['ADMIN'],
};

const customerActor: AuthenticatedUser = {
  id: 'c0000000-0000-4000-8000-000000000002',
  email: 'customer@example.test',
  roles: ['CUSTOMER'],
};

const mockSummaryReady: AdminReportSummaryResponse = {
  status: 'READY',
  range: {
    from: '2026-10-15',
    to: '2026-11-13',
    timezone: 'Asia/Ho_Chi_Minh',
    days: 30,
  },
  metadata: {
    snapshotVersion: '1',
    asOf: '2026-11-13T00:00:00.000Z',
    lastCompletedAt: '2026-11-13T00:00:00.000Z',
    metricDefinitionVersion: '1.0',
    dataQuality: 'NORMAL',
  },
  summary: {
    totalCollectedAmount: '1250000.00',
    totalRefundedAmount: '200000.00',
    netRevenueAmount: '1050000.00',
    totalOrdersInCohort: 1,
  },
  dailyMoney: [
    {
      date: '2026-11-10',
      collectedAmount: '1250000.00',
      refundedAmount: '0.00',
      netAmount: '1250000.00',
    },
    {
      date: '2026-11-11',
      collectedAmount: '0.00',
      refundedAmount: '200000.00',
      netAmount: '-200000.00',
    },
  ],
  ordersByStatus: [
    { status: 'DELIVERED', count: 5, percentage: 50 },
    { status: 'CONFIRMED', count: 3, percentage: 30 },
    { status: 'CANCELLED', count: 2, percentage: 20 },
  ],
  topDeliveredProducts: [
    {
      productId: 'p-1',
      productName: 'Áo sơ mi oxford trắng',
      deliveredQuantity: 12,
      deliveredRevenueAmount: '4500000.00',
    },
    {
      productId: 'p-2',
      productName: 'Quần tây nam slim fit',
      deliveredQuantity: 8,
      deliveredRevenueAmount: '3200000.00',
    },
  ],
};

const mockSummaryNotReady: AdminReportSummaryResponse = {
  status: 'NOT_READY',
  range: {
    from: '2026-10-15',
    to: '2026-11-13',
    timezone: 'Asia/Ho_Chi_Minh',
    days: 30,
  },
  metadata: null,
  summary: null,
  dailyMoney: [],
  ordersByStatus: [],
  topDeliveredProducts: [],
};

const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function setup(
  path = '/admin/reports',
  user: AuthenticatedUser | null = adminActor,
  responseProvider: (url: URL) => Response = () => reply(mockSummaryReady),
) {
  const current = user;
  const requests: { url: URL; init?: RequestInit }[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      requests.push({ url, init });

      if (url.pathname === '/api/auth/refresh') {
        return current ? reply({ accessToken: current.id, user: current }) : reply({}, 401);
      }
      if (url.pathname === '/api/cart') {
        return reply({ items: [], itemCount: 0 });
      }
      if (url.pathname === '/api/admin/reports/summary') {
        return responseProvider(url);
      }

      throw new Error(`Unexpected fetch request to ${url.pathname}`);
    }),
  );

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );

  return { ...utils, requests, queryClient };
}

describe('AdminReportsPage (Issue #108 Web UI)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('hien thi dung 3 the KPI, 3 bang du lieu va thong tin snapshot READY', async () => {
    setup();

    expect(await screen.findByRole('heading', { name: 'Báo cáo bán hàng' })).toBeInTheDocument();

    // 1. Snapshot metadata
    expect(await screen.findByText(/● Sẵn sàng \(Snapshot v1\)/)).toBeInTheDocument();

    // 2. 3 KPI cards
    const kpiCollected = await screen.findByTestId('kpi-collected');
    const kpiRefunded = await screen.findByTestId('kpi-refunded');
    const kpiNet = await screen.findByTestId('kpi-net');

    expect(kpiCollected).toHaveTextContent('1.250.000 đ');
    expect(kpiRefunded).toHaveTextContent('200.000 đ');
    expect(kpiNet).toHaveTextContent('1.050.000 đ');

    // 3. Bang Doanh thu theo ngay
    expect(screen.getByText('2026-11-10')).toBeInTheDocument();
    expect(screen.getByText('2026-11-11')).toBeInTheDocument();
    expect(screen.getByText('-200.000 đ')).toBeInTheDocument(); // Thu rong am

    // 4. Bang Don hang theo trang thai
    expect(screen.getByText('Đã giao hàng')).toBeInTheDocument();
    expect(screen.getByText('Đã xác nhận')).toBeInTheDocument();
    expect(screen.getByText('Đã hủy')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();

    // 5. Bang Top san pham
    expect(screen.getByText('Áo sơ mi oxford trắng')).toBeInTheDocument();
    expect(screen.getByText('Quần tây nam slim fit')).toBeInTheDocument();
    expect(screen.getByText('4.500.000 đ')).toBeInTheDocument();
  });

  it('hien thi canh bao NOT_READY khi chua co snapshot va cac bang trong', async () => {
    setup('/admin/reports', adminActor, () => reply(mockSummaryNotReady));

    expect(await screen.findByRole('heading', { name: 'Báo cáo bán hàng' })).toBeInTheDocument();
    expect(await screen.findByText(/▲ Chưa tổng hợp snapshot/)).toBeInTheDocument();

    expect(
      screen.getByText('Không có phát sinh doanh thu trong khoảng ngày này.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Chưa có đơn hàng nào được tạo trong khoảng ngày này.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Chưa có sản phẩm nào được giao thành công trong khoảng ngày này.'),
    ).toBeInTheDocument();
  });

  it('kiem tra hop le form bo loc va ngan submit khi from > to', async () => {
    setup();

    await screen.findByRole('heading', { name: 'Báo cáo bán hàng' });

    const fromInput = screen.getByLabelText('Từ ngày');
    const toInput = screen.getByLabelText('Đến ngày');
    const applyButton = screen.getByRole('button', { name: 'Áp dụng' });

    // Nhap from > to
    fireEvent.change(fromInput, { target: { value: '2026-11-20' } });
    fireEvent.change(toInput, { target: { value: '2026-11-10' } });
    fireEvent.click(applyButton);

    expect(
      await screen.findByText('Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.'),
    ).toBeInTheDocument();
  });

  it('tu choi khach hang thuong bang man hinh AdminForbidden', async () => {
    setup('/admin/reports', customerActor);

    expect(
      await screen.findByRole('heading', { name: /Không đủ quyền truy cập/i }),
    ).toBeInTheDocument();
  });
});
