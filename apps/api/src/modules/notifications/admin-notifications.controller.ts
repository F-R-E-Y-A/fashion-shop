import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequireRoles } from '../auth/index.js';
import {
  ListNotificationsQuery,
  NotificationListResponse,
  NotificationResponse,
} from './dto/notification.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('Admin Notifications')
@Controller('admin/notifications')
@RequireRoles('ADMIN')
export class AdminNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Lấy danh sách thông báo quản trị viên' })
  @ApiOkResponse({ type: NotificationListResponse })
  list(@Query() query: ListNotificationsQuery): Promise<NotificationListResponse> {
    return this.notifications.listAdmin(query);
  }

  @Get('unread-count')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Lấy số lượng thông báo quản trị viên chưa đọc' })
  getUnreadCount(): Promise<{ unreadCount: number }> {
    return this.notifications.getUnreadCount(undefined, true);
  }

  @Patch(':id/read')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Đánh dấu một thông báo quản trị viên là đã đọc' })
  @ApiOkResponse({ type: NotificationResponse })
  markAsRead(@Param('id', ParseUUIDPipe) id: string): Promise<NotificationResponse> {
    return this.notifications.markAsRead(id, undefined, true);
  }

  @Post('mark-all-read')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Đánh dấu tất cả thông báo quản trị viên là đã đọc' })
  markAllAsRead(): Promise<{ count: number }> {
    return this.notifications.markAllAsRead(undefined, true);
  }

  @Sse('stream')
  @ApiOperation({ summary: 'Theo dõi thông báo quản trị viên theo thời gian thực (SSE)' })
  stream() {
    return this.notifications.adminStream();
  }
}
