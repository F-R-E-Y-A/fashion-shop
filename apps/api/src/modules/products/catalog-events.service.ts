import { createHash } from 'node:crypto';

import { Injectable, type MessageEvent } from '@nestjs/common';
import {
  catchError,
  distinctUntilChanged,
  exhaustMap,
  from,
  interval,
  map,
  merge,
  of,
  ReplaySubject,
  share,
  startWith,
} from 'rxjs';

import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { InventoryService } from '../inventory/index.js';

@Injectable()
export class CatalogEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  /** Mot probe moi 2 giay cho moi API process, chi chay khi co nguoi theo doi. */
  private readonly revisions = interval(2_000).pipe(
    startWith(0),
    exhaustMap(() =>
      from(this.revision()).pipe(
        map((revision): MessageEvent => ({ type: 'catalog-changed', data: { revision } })),
        catchError(() => of<MessageEvent>({ type: 'catalog-unavailable', data: {} })),
      ),
    ),
    distinctUntilChanged(
      (a, b) => a.type === b.type && JSON.stringify(a.data) === JSON.stringify(b.data),
    ),
    share({ connector: () => new ReplaySubject<MessageEvent>(1), resetOnRefCountZero: true }),
  );

  readonly events = merge(
    this.revisions,
    interval(15_000).pipe(map((): MessageEvent => ({ type: 'heartbeat', data: {} }))),
  );

  /**
   * Trigger tang catalog_revision_seq moi khi bang catalog doi (migration ph11_live_revision,
   * ADR-037): doc mot dong thay vi tai ca catalog moi 2 giay. is_called phan biet so dau tien.
   */
  async revision(): Promise<string> {
    const [row] = await this.prisma.$queryRaw<{ value: string }[]>`
      SELECT concat_ws(':', last_value, is_called) AS value FROM public.catalog_revision_seq`;
    const stock = await this.inventory.getAvailabilityRevision();
    return createHash('sha256')
      .update(`${row?.value ?? ''}|${stock}`)
      .digest('hex');
  }
}
