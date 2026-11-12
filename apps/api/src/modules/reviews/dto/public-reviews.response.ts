import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublicReviewItem {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ minimum: 1, maximum: 5 }) rating!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) content!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class PublicReviewsResponse {
  @ApiProperty({ type: [PublicReviewItem] }) items!: PublicReviewItem[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
