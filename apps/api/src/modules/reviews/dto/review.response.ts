import { ApiProperty } from '@nestjs/swagger';

import {
  FIT_FEEDBACKS,
  type FitFeedbackCode,
  REPORT_REASONS,
  type ReportReasonCode,
} from './review-input.dto.js';
import { ADMIN_REVIEW_STATUSES, type AdminReviewStatus } from './review-query.dto.js';

export class ReviewMediaResponse {
  @ApiProperty({ description: 'Ban lon cho lightbox (canh dai toi da 1600 px)' }) url!: string;
  @ApiProperty({ description: 'Ban vuong 160 px cho luoi anh; anh nap tay thi bang url' })
  thumbnailUrl!: string;
}

/** Anh trong danh gia cua chinh minh: kem khoa de giu anh cu khi sua (PATCH media[].key). */
export class MyReviewMediaResponse extends ReviewMediaResponse {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'null voi anh nap tay, khong giu lai duoc khi sua',
  })
  key!: string | null;
}

export class ReviewReplyResponse {
  @ApiProperty() content!: string;
  @ApiProperty({ format: 'date-time' }) repliedAt!: string;
}

/** Danh gia tren trang cong khai: khong co userId, email hay ly do kiem duyet. */
export class ReviewResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ minimum: 1, maximum: 5 }) rating!: number;
  @ApiProperty({ type: String, nullable: true }) content!: string | null;
  @ApiProperty({ enum: FIT_FEEDBACKS, nullable: true }) fitFeedback!: FitFeedbackCode | null;
  @ApiProperty({ type: String, nullable: true, description: 'Mau / co da mua' })
  variantLabel!: string | null;
  @ApiProperty({ type: Number, nullable: true }) heightCm!: number | null;
  @ApiProperty({ type: Number, nullable: true }) weightKg!: number | null;
  @ApiProperty({ description: 'Ten hien cong khai; an danh thi da che' }) reviewerName!: string;
  @ApiProperty({ type: [ReviewMediaResponse] }) media!: ReviewMediaResponse[];
  @ApiProperty() helpfulCount!: number;
  @ApiProperty({ description: 'Nguoi dang xem da bam huu ich; false khi chua dang nhap' })
  viewerHasVoted!: boolean;
  @ApiProperty({ description: 'Danh gia cua chinh nguoi dang xem: an nut huu ich va bao cao' })
  isOwn!: boolean;
  @ApiProperty({ type: ReviewReplyResponse, nullable: true }) reply!: ReviewReplyResponse | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) editedAt!: string | null;
}

export class ReviewListResponse {
  @ApiProperty({ type: [ReviewResponse] }) items!: ReviewResponse[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() totalPages!: number;
}

export class RatingBucketResponse {
  @ApiProperty({ minimum: 1, maximum: 5 }) rating!: number;
  @ApiProperty() count!: number;
}

export class FitSummaryResponse {
  @ApiProperty() tooSmall!: number;
  @ApiProperty() trueToSize!: number;
  @ApiProperty() tooLarge!: number;
  @ApiProperty({ description: 'So danh gia co chon do vua' }) total!: number;
}

export class ReviewSummaryResponse {
  @ApiProperty({ description: 'Trung binh so sao, 2 chu so; 0 khi chua co danh gia' })
  average!: number;
  @ApiProperty() count!: number;
  @ApiProperty({ type: [RatingBucketResponse], description: 'Du 5 muc, tu 5 sao xuong 1 sao' })
  distribution!: RatingBucketResponse[];
  @ApiProperty() withMediaCount!: number;
  @ApiProperty() withContentCount!: number;
  @ApiProperty({ type: FitSummaryResponse }) fit!: FitSummaryResponse;
}

export class ReviewProductResponse {
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
}

/** Dong don cho danh gia (tab "Cho danh gia"). */
export class ReviewableItemResponse {
  @ApiProperty({ format: 'uuid' }) orderItemId!: string;
  @ApiProperty({ format: 'uuid' }) orderId!: string;
  @ApiProperty() orderCode!: string;
  @ApiProperty({ type: ReviewProductResponse }) product!: ReviewProductResponse;
  @ApiProperty({ type: String, nullable: true }) variantLabel!: string | null;
  @ApiProperty({ format: 'date-time' }) deliveredAt!: string;
  @ApiProperty({ format: 'date-time', description: 'Het han viet danh gia' })
  reviewDeadline!: string;
}

/** Danh gia cua chinh minh: thay ca trang thai duyet va ly do bi an. */
export class MyReviewResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) orderItemId!: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) orderId!: string | null;
  @ApiProperty({ type: ReviewProductResponse }) product!: ReviewProductResponse;
  @ApiProperty({ type: String, nullable: true }) variantLabel!: string | null;
  @ApiProperty({ minimum: 1, maximum: 5 }) rating!: number;
  @ApiProperty({ type: String, nullable: true }) content!: string | null;
  @ApiProperty({ enum: FIT_FEEDBACKS, nullable: true }) fitFeedback!: FitFeedbackCode | null;
  @ApiProperty({ type: Number, nullable: true }) heightCm!: number | null;
  @ApiProperty({ type: Number, nullable: true }) weightKg!: number | null;
  @ApiProperty() isAnonymous!: boolean;
  @ApiProperty({ description: 'Ten se hien cong khai' }) reviewerName!: string;
  @ApiProperty({ type: [MyReviewMediaResponse] }) media!: MyReviewMediaResponse[];
  @ApiProperty({ enum: ADMIN_REVIEW_STATUSES }) status!: AdminReviewStatus;
  @ApiProperty({ type: String, nullable: true, description: 'Ly do an, chi khi REJECTED' })
  moderationNote!: string | null;
  @ApiProperty({ type: ReviewReplyResponse, nullable: true }) reply!: ReviewReplyResponse | null;
  @ApiProperty() helpfulCount!: number;
  @ApiProperty() canEdit!: boolean;
  @ApiProperty({ format: 'date-time' }) editDeadline!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) editedAt!: string | null;
}

export class MyReviewListResponse {
  @ApiProperty({ type: [MyReviewResponse] }) items!: MyReviewResponse[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() totalPages!: number;
}

export class HelpfulVoteResponse {
  @ApiProperty() helpfulCount!: number;
  @ApiProperty() voted!: boolean;
}

export class AdminReviewReportResponse {
  @ApiProperty({ enum: REPORT_REASONS }) reason!: ReportReasonCode;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AdminReviewerResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ description: 'Ten dang hien cong khai' }) displayName!: string;
}

/** Danh gia trong khu quan tri: co email nguoi viet va bao cao, nen tra kem no-store. */
export class AdminReviewResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: AdminReviewerResponse }) reviewer!: AdminReviewerResponse;
  @ApiProperty({ type: ReviewProductResponse }) product!: ReviewProductResponse;
  @ApiProperty({ type: String, nullable: true }) orderCode!: string | null;
  @ApiProperty({ type: String, nullable: true }) variantLabel!: string | null;
  @ApiProperty({ minimum: 1, maximum: 5 }) rating!: number;
  @ApiProperty({ type: String, nullable: true }) content!: string | null;
  @ApiProperty({ enum: FIT_FEEDBACKS, nullable: true }) fitFeedback!: FitFeedbackCode | null;
  @ApiProperty({ type: Number, nullable: true }) heightCm!: number | null;
  @ApiProperty({ type: Number, nullable: true }) weightKg!: number | null;
  @ApiProperty() isAnonymous!: boolean;
  @ApiProperty({ type: [ReviewMediaResponse] }) media!: ReviewMediaResponse[];
  @ApiProperty({ enum: ADMIN_REVIEW_STATUSES }) status!: AdminReviewStatus;
  @ApiProperty({ type: String, nullable: true }) moderationNote!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) moderatedAt!: string | null;
  @ApiProperty() helpfulCount!: number;
  @ApiProperty() reportCount!: number;
  @ApiProperty({ description: 'So lan nguoi viet da sua; gui kem lenh duyet hoac an' })
  editCount!: number;
  @ApiProperty({ type: [AdminReviewReportResponse], description: 'Toi da 5 bao cao moi nhat' })
  reports!: AdminReviewReportResponse[];
  @ApiProperty({ type: ReviewReplyResponse, nullable: true }) reply!: ReviewReplyResponse | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) editedAt!: string | null;
}

export class AdminReviewListResponse {
  @ApiProperty({ type: [AdminReviewResponse] }) items!: AdminReviewResponse[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() totalPages!: number;
}
