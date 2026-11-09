import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export const NotificationType = {
  ORDER_STATUS_CHANGED: 'ORDER_STATUS_CHANGED',
  ORDER_CREATED: 'ORDER_CREATED',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  REFUND_PROCESSED: 'REFUND_PROCESSED',
  SYSTEM: 'SYSTEM',
} as const;

export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export class NotificationResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) userId!: string | null;
  @ApiProperty() forAdmin!: boolean;
  @ApiProperty({ enum: NotificationType }) type!: NotificationType;
  @ApiProperty() title!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ nullable: true }) link!: string | null;
  @ApiProperty() isRead!: boolean;
  @ApiProperty({ nullable: true }) orderId!: string | null;
  @ApiProperty() createdAt!: string;
}

export class NotificationListResponse {
  @ApiProperty({ type: [NotificationResponse] }) items!: NotificationResponse[];
  @ApiProperty() total!: number;
  @ApiProperty() unreadCount!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class ListNotificationsQuery {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly?: boolean;
}

export class CreateNotificationInput {
  @IsOptional() @IsUUID('4') userId?: string;
  @IsOptional() @IsBoolean() forAdmin?: boolean;
  @IsOptional() @IsEnum(NotificationType) type?: NotificationType;
  @IsString() title!: string;
  @IsString() message!: string;
  @IsOptional() @IsString() link?: string;
  @IsOptional() @IsUUID('4') orderId?: string;
}
