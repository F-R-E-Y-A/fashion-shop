import { PartialType } from '@nestjs/swagger';

import { CreateVoucherDto } from './create-voucher.dto.js';

export class UpdateVoucherDto extends PartialType(CreateVoucherDto) {}
