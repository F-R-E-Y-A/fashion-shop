import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AuthGuard, CurrentUser, type CurrentUserType } from '../auth/index.js';
import {
  CreateUploadTicketRequest,
  UploadConfigResponse,
  UploadTicketResponse,
} from './dto/upload.dto.js';
import { UploadsService } from './uploads.service.js';

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Get('config')
  @ApiOperation({ summary: 'Kho anh co bat khong, gioi han dinh dang va dung luong' })
  @ApiOkResponse({ type: UploadConfigResponse })
  config(): UploadConfigResponse {
    return this.uploads.uploadConfig();
  }

  @Post('tickets')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      'Phieu ky san de trinh duyet tai anh thang len kho (han 1 gio, thu muc rieng tung nguoi)',
  })
  @ApiOkResponse({ type: UploadTicketResponse })
  @ApiUnauthorizedResponse({ description: 'Chua dang nhap' })
  @ApiServiceUnavailableResponse({ description: 'UPLOADS_DISABLED: chua cau hinh CLOUDINARY_URL' })
  @ApiTooManyRequestsResponse({ description: 'RATE_LIMITED: qua 30 phieu (30 anh) moi gio' })
  ticket(
    @CurrentUser() user: CurrentUserType,
    @Body() request: CreateUploadTicketRequest,
  ): Promise<UploadTicketResponse> {
    return this.uploads.ticket(user.id, request.purpose);
  }
}
