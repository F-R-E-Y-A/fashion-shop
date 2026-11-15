import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

const explicitBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' || value === true ? true : value === 'false' || value === false ? false : value;

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
  @Transform(explicitBoolean)
  @IsBoolean({ message: 'unreadOnly chỉ nhận true hoặc false' })
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
