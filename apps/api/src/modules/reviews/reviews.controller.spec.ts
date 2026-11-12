import { describe, expect, it, vi } from 'vitest';

import type { CurrentUserType } from '../auth/index.js';
import { PublicReviewsController } from './public-reviews.controller.js';
import { ReviewsController } from './reviews.controller.js';
import type { ReviewsService } from './reviews.service.js';

describe('ReviewsController', () => {
  const user: CurrentUserType = {
    id: 'user-1',
    email: 'user1@example.com',
    roles: ['CUSTOMER'],
  };

  it('getOrderReviewContext goi dung service voi orderId va userId', async () => {
    const mockContext = { orderId: 'order-1', items: [] };
    const service = {
      getOrderReviewContext: vi.fn().mockResolvedValue(mockContext),
    } as unknown as ReviewsService;

    const controller = new ReviewsController(service);
    const res = await controller.getOrderReviewContext('order-1', user);

    expect(service.getOrderReviewContext).toHaveBeenCalledWith('order-1', 'user-1');
    expect(res).toBe(mockContext);
  });

  it('createReview goi dung service voi userId va dto', async () => {
    const dto = { orderItemId: 'item-1', rating: 5, content: 'Tốt' };
    const mockResult = { id: 'rev-1', ...dto, moderationStatus: 'PENDING' };
    const service = {
      createReview: vi.fn().mockResolvedValue(mockResult),
    } as unknown as ReviewsService;

    const controller = new ReviewsController(service);
    const res = await controller.createReview(user, dto);

    expect(service.createReview).toHaveBeenCalledWith('user-1', dto);
    expect(res).toBe(mockResult);
  });
});

describe('PublicReviewsController', () => {
  it('getPublicReviews goi dung service voi slug va query', async () => {
    const mockResult = { items: [], total: 0, page: 1, pageSize: 12 };
    const service = {
      getPublicProductReviews: vi.fn().mockResolvedValue(mockResult),
    } as unknown as ReviewsService;

    const controller = new PublicReviewsController(service);
    const query = { page: 1, pageSize: 12 };
    const res = await controller.getPublicReviews('ao-thun', query);

    expect(service.getPublicProductReviews).toHaveBeenCalledWith('ao-thun', query);
    expect(res).toBe(mockResult);
  });
});
