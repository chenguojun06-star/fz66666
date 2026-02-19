// API 工具库 - 统一导出
// 将原 api.ts 拆分为多个模块文件，提高可维护性

// 核心API功能
export {
  type ApiResult,
  type ApiClient,
  isApiSuccess,
  getApiMessage,
  unwrapApiData,
  generateRequestId,
  toNumberSafe,
  toUrlSearchParams,
  withQuery,
  createApiClient,
  requestWithPathFallback,
} from './core';

// 尺码相关工具
export {
  compareSizeAsc,
  sortSizeNames,
} from './size';

// 生产订单相关API
export {
  type ProductionOrderLine,
  type ProductionOrderFrozenRule,
  type UseProductionOrderFrozenCacheOptions,
  parseProductionOrderLines,
  isDuplicateScanMessage,
  isOrderFrozenByStatus,
  isOrderFrozenByStatusOrStock,
  fetchProductionOrderDetail,
  primeProductionOrderFrozenCache,
  ensureProductionOrderUnlocked,
  useProductionOrderFrozenCache,
} from './production';

// 财务相关API
export {
  updateFinanceReconciliationStatus,
  returnFinanceReconciliation,
} from './finance';

// 为了保持向后兼容，默认导出 createApiClient
import { createApiClient } from './core';
export default createApiClient();
