import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as reviewsApi from '../api/reviews.api.js';
import { ProductReviewsSection } from './ProductReviewsSection.js';

vi.mock('../api/reviews.api.js');

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('ProductReviewsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hien thi thong bao rong khi chua co danh gia duoc duyet', async () => {
    vi.mocked(reviewsApi.getPublicProductReviews).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      pageSize: 12,
    });

    renderWithClient(<ProductReviewsSection slug="ao-thun" />);

    await waitFor(() => {
      expect(screen.getByText('Chưa có đánh giá được duyệt')).toBeInTheDocument();
    });
  });

  it('hien thi danh sach danh gia duoc duyet voi sao va ngay', async () => {
    vi.mocked(reviewsApi.getPublicProductReviews).mockResolvedValueOnce({
      items: [
        {
          id: 'rev-1',
          rating: 5,
          content: 'Áo mặc rất mát và vừa vặn',
          createdAt: '2026-11-12T00:00:00Z',
        },
        {
          id: 'rev-2',
          rating: 4,
          content: 'Giao hàng nhanh',
          createdAt: '2026-11-11T12:00:00Z',
        },
      ],
      total: 2,
      page: 1,
      pageSize: 12,
    });

    renderWithClient(<ProductReviewsSection slug="ao-thun" />);

    await waitFor(() => {
      expect(screen.getByText(/5\/5 sao/)).toBeInTheDocument();
      expect(screen.getByText('Áo mặc rất mát và vừa vặn')).toBeInTheDocument();
      expect(screen.getByText(/4\/5 sao/)).toBeInTheDocument();
      expect(screen.getByText('Giao hàng nhanh')).toBeInTheDocument();
      expect(screen.getByText(/2 đã duyệt/)).toBeInTheDocument();
    });
  });

  it('hien thi loi khi khong tai duoc danh gia', async () => {
    vi.mocked(reviewsApi.getPublicProductReviews).mockRejectedValueOnce(new Error('Lỗi kết nối'));

    renderWithClient(<ProductReviewsSection slug="ao-thun" />);

    await waitFor(() => {
      expect(screen.getByText('Lỗi kết nối')).toBeInTheDocument();
    });
  });
});
