import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrderReviewItemDetails {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ minimum: 1, maximum: 5 }) rating!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) content!: string | null;
  @ApiProperty({ enum: ['PENDING', 'APPROVED', 'REJECTED'] })
  moderationStatus!: 'PENDING' | 'APPROVED' | 'REJECTED';
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class OrderReviewItemContext {
  @ApiProperty({ format: 'uuid' }) orderItemId!: string;
  @ApiProperty({ format: 'uuid' }) productVariantId!: string;
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty() eligible!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true })
  reasonCode!: 'NOT_DELIVERED' | 'ALREADY_REVIEWED' | null;
  @ApiPropertyOptional({ type: OrderReviewItemDetails, nullable: true })
  review!: OrderReviewItemDetails | null;
}

export class OrderReviewsContextResponse {
  @ApiProperty({ format: 'uuid' }) orderId!: string;
  @ApiProperty({ type: [OrderReviewItemContext] }) items!: OrderReviewItemContext[];
}
