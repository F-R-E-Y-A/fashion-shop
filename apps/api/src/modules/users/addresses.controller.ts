import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { AuthGuard, CurrentUser, type CurrentUserType } from '../auth/index.js';
import { AddressesService } from './addresses.service.js';
import {
  AddressIdParam,
  AddressResponse,
  CreateAddressRequest,
  UpdateAddressRequest,
} from './dto/address.dto.js';
import { NoStoreInterceptor } from './no-store.interceptor.js';

/**
 * So dia chi cua chinh minh. Chu so luon la CurrentUser; client khong gui duoc userId. Dia chi cua
 * nguoi khac tra 404 nhu dia chi khong ton tai. Phan hoi co PII nen `Cache-Control: no-store`.
 */
@ApiTags('users')
@Controller('users/me/addresses')
@UseGuards(AuthGuard)
@UseInterceptors(NoStoreInterceptor)
@ApiUnauthorizedResponse({ description: 'Chua dang nhap hoac phien khong con hop le' })
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sach dia chi cua chinh minh, mac dinh truoc' })
  @ApiOkResponse({ type: AddressResponse, isArray: true })
  list(@CurrentUser() user: CurrentUserType): Promise<AddressResponse[]> {
    return this.addresses.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Them dia chi; dia chi dau tien tu thanh mac dinh' })
  @ApiCreatedResponse({ type: AddressResponse })
  @ApiBadRequestResponse({ description: 'Du lieu sai hoac co truong khong duoc phep' })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_ADMINISTRATIVE_AREA' })
  create(
    @CurrentUser() user: CurrentUserType,
    @Body() request: CreateAddressRequest,
  ): Promise<AddressResponse> {
    return this.addresses.create(user.id, request);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Sua mot phan dia chi cua chinh minh; isDefault=true de doi mac dinh' })
  @ApiOkResponse({ type: AddressResponse })
  @ApiNotFoundResponse({ description: 'Khong co, hoac khong phai dia chi cua minh' })
  @ApiConflictResponse({
    description: 'DEFAULT_ADDRESS_REQUIRED: bo mac dinh ma khong co thay the',
  })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_ADMINISTRATIVE_AREA' })
  update(
    @CurrentUser() user: CurrentUserType,
    @Param() { id }: AddressIdParam,
    @Body() request: UpdateAddressRequest,
  ): Promise<AddressResponse> {
    return this.addresses.update(user.id, id, request);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoa dia chi; xoa mac dinh thi dia chi cu nhat con lai thanh mac dinh' })
  @ApiNoContentResponse({ description: 'Da xoa' })
  @ApiNotFoundResponse({ description: 'Khong co, hoac khong phai dia chi cua minh' })
  remove(@CurrentUser() user: CurrentUserType, @Param() { id }: AddressIdParam): Promise<void> {
    return this.addresses.remove(user.id, id);
  }
}
