export { InventoryModule } from './inventory.module.js';
export { InventoryService, StockShortageError, type StockStatus } from './inventory.service.js';
export {
  applyStockCounts,
  parseStockCsv,
  type StockCount,
  type StockCountResult,
} from './stock-count.js';
