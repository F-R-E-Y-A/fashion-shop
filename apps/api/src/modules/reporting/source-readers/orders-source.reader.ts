import { Injectable } from '@nestjs/common';

import {
  type OrdersByStatusFact,
  OrdersReportingReader,
  type TopSellingProductFact,
} from '../../orders/index.js';

export type { OrdersByStatusFact, TopSellingProductFact };

/**
 * Adapter ke thua OrdersReportingReader duoc export tu OrdersModule.
 * Bao dam tinh tuong thich nguoc va ranh gioi nghiep vu ro rang.
 */
@Injectable()
export class OrdersSourceReader extends OrdersReportingReader {}
