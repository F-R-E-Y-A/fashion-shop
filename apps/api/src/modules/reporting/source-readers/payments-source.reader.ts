import { Injectable } from '@nestjs/common';

import { type DailyMoneyFact, PaymentsReportingReader } from '../../payments/index.js';

export type { DailyMoneyFact };

/**
 * Adapter ke thua PaymentsReportingReader duoc export tu PaymentsModule.
 * Bao dam tinh tuong thich nguoc va ranh gioi nghiep vu ro rang.
 */
@Injectable()
export class PaymentsSourceReader extends PaymentsReportingReader {}
