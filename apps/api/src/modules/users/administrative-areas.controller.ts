import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdministrativeAreasService } from './administrative-areas.service.js';
import {
  AdministrativeAreaResponse,
  ListAdministrativeAreasQuery,
} from './dto/administrative-area.dto.js';

/** Cong khai, khong can dang nhap: danh muc tinh va xa la du lieu tham chieu, khong phai du lieu ca nhan. */
@ApiTags('administrative-areas')
@Controller('administrative-areas')
export class AdministrativeAreasController {
  constructor(private readonly areas: AdministrativeAreasService) {}

  @Get()
  @ApiOperation({ summary: 'Cac tinh dang hoat dong, hoac cac xa cua mot tinh khi co parentId' })
  @ApiOkResponse({ type: AdministrativeAreaResponse, isArray: true })
  list(@Query() { parentId }: ListAdministrativeAreasQuery): Promise<AdministrativeAreaResponse[]> {
    return this.areas.list(parentId);
  }
}
