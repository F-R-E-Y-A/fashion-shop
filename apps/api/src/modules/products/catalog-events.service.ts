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

  private async revision(): Promise<string> {
    const rows = await this.prisma.product.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        updatedAt: true,
        isActive: true,
        category: { select: { isActive: true, parent: { select: { isActive: true } } } },
        variants: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            listPrice: true,
            salePrice: true,
            isActive: true,
            color: { select: { name: true } },
            size: { select: { code: true } },
          },
        },
        images: { orderBy: { id: 'asc' }, select: { url: true, colorId: true, sortOrder: true } },
      },
    });
    const stock = await this.inventory.getAvailabilityRevision();
    return createHash('sha256').update(JSON.stringify({ rows, stock })).digest('hex');
  }
}
