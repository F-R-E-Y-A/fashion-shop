import { Controller, Get, Param, Patch, Post, Query, Sse, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthGuard, CurrentUser, type CurrentUserType } from '../auth/index.js';
import {
  ListNotificationsQuery,
  NotificationListResponse,
  NotificationResponse,
} from './dto/notification.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách thông báo của tài khoản hiện tại' })
  @ApiOkResponse({ type: NotificationListResponse })
  list(
    @CurrentUser() user: CurrentUserType,
    @Query() query: ListNotificationsQuery,
  ): Promise<NotificationListResponse> {
    return this.notifications.listUser(user.id, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Lấy số lượng thông báo chưa đọc của tài khoản' })
  getUnreadCount(@CurrentUser() user: CurrentUserType): Promise<{ unreadCount: number }> {
    return this.notifications.getUnreadCount(user.id, false);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Đánh dấu một thông báo là đã đọc' })
  @ApiOkResponse({ type: NotificationResponse })
  markAsRead(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
  ): Promise<NotificationResponse> {
    return this.notifications.markAsRead(id, user.id, false);
  }

  @Post('mark-all-read')
  @ApiOperation({ summary: 'Đánh dấu tất cả thông báo của tài khoản là đã đọc' })
  markAllAsRead(@CurrentUser() user: CurrentUserType): Promise<{ count: number }> {
    return this.notifications.markAllAsRead(user.id, false);
  }

  @Sse('stream')
  @ApiOperation({ summary: 'Theo dõi thông báo thời gian thực qua Server-Sent Events (SSE)' })
  stream(@CurrentUser() user: CurrentUserType) {
    return this.notifications.userStream(user.id);
  }
}
