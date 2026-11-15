export { OrdersModule } from './orders.module.js';
export {
  type AdminOrderQuery,
  attachPostCommitHooks,
  type OrderDetails,
  OrdersService,
  POST_COMMIT_HOOKS,
  type PostCommitHook,
  registerPostCommitHook,
  runPostCommitHooks,
} from './orders.service.js';
export {
  type OrdersByStatusFact,
  OrdersReportingReader,
  type TopSellingProductFact,
} from './orders-reporting.reader.js';
export type { PurchasedItem } from './purchased-items.js';
