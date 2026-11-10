import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID, ValidateIf } from 'class-validator';

import {
  DETAIL_ADDRESS_MAX,
  IsDetailAddress,
  IsPersonName,
  IsPhoneNumber,
  IsPostalCode,
  PERSON_NAME_MAX,
} from './contact-fields.js';

/** Chi kiem khi client gui truong; gui `null` van bi kiem va bi tu choi. */
const whenPresent = ValidateIf((_object: unknown, value: unknown) => value !== undefined);

/**
 * POST /api/users/me/addresses. Khong co userId: chu dia chi luon la nguoi dang dang nhap. Dia chi dau
 * tien luon thanh mac dinh, ke ca khi gui isDefault=false (bat bien "co dia chi thi co dung mot mac dinh").
 */
export class CreateAddressRequest {
  @ApiProperty({ example: 'Nguyễn Văn An', maxLength: PERSON_NAME_MAX })
  @IsPersonName('recipientName')
  recipientName!: string;

  @ApiProperty({ example: '0901234567', pattern: '^0\\d{9}$' })
  @IsPhoneNumber('phone')
  phone!: string;

  @ApiProperty({ format: 'uuid', description: 'Id mot XA dang hoat dong (khong phai tinh)' })
  @IsUUID('all', { message: 'administrativeAreaId phai la UUID' })
  administrativeAreaId!: string;

  @ApiProperty({ example: '12 Nguyễn Huệ', maxLength: DETAIL_ADDRESS_MAX })
  @IsDetailAddress('detailAddress')
  detailAddress!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: '700000' })
  @IsOptional()
  @IsPostalCode('postalCode')
  postalCode?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean({ message: 'isDefault phai la true hoac false' })
  isDefault?: boolean;
}

/**
 * PATCH /api/users/me/addresses/:id: sua mot phan. Vang mat la giu nguyen. `null` chi duoc cho postalCode
 * (xoa ma buu chinh); cac truong bat buoc gui `null` thi 400. isDefault=false tren dia chi dang mac dinh
 * thi 409: muon doi mac dinh thi dat mot dia chi khac thanh mac dinh.
 */
export class UpdateAddressRequest {
  @ApiPropertyOptional({ maxLength: PERSON_NAME_MAX })
  @whenPresent
  @IsPersonName('recipientName')
  recipientName?: string;

  @ApiPropertyOptional({ pattern: '^0\\d{9}$' })
  @whenPresent
  @IsPhoneNumber('phone')
  phone?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @whenPresent
  @IsUUID('all', { message: 'administrativeAreaId phai la UUID' })
  administrativeAreaId?: string;

  @ApiPropertyOptional({ maxLength: DETAIL_ADDRESS_MAX })
  @whenPresent
  @IsDetailAddress('detailAddress')
  detailAddress?: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'null de xoa ma buu chinh' })
  @IsOptional()
  @IsPostalCode('postalCode')
  postalCode?: string | null;

  @ApiPropertyOptional()
  @whenPresent
  @IsBoolean({ message: 'isDefault phai la true hoac false' })
  isDefault?: boolean;
}

export class AddressIdParam {
  @IsUUID('all', { message: 'id phai la UUID' })
  id!: string;
}

export class AddressProvinceResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
}

export class AddressAreaResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: AddressProvinceResponse, nullable: true })
  province!: AddressProvinceResponse | null;
}

/** Dia chi an toan: khong co userId hay truong noi bo nao khac. */
export class AddressResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() recipientName!: string;
  @ApiProperty() phone!: string;
  @ApiProperty({ format: 'uuid' }) administrativeAreaId!: string;
  @ApiProperty({ type: AddressAreaResponse }) administrativeArea!: AddressAreaResponse;
  @ApiProperty() detailAddress!: string;
  @ApiProperty({ type: String, nullable: true }) postalCode!: string | null;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
