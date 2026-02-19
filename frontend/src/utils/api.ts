// 此文件已重构，API功能已拆分到 api/ 目录下的模块文件中
// 为了保持向后兼容，所有导出都从新的模块重新导出
//
// 新的文件结构：
// - api/core.ts    - 核心API类型和工具函数
// - api/size.ts    - 尺码相关工具函数
// - api/production.ts - 生产订单相关API
// - api/finance.ts - 财务相关API
// - api/index.ts   - 统一导出
//
// 建议新项目代码直接从子模块导入：


// 直接从子模块导出，避免循环依赖
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
} from './api/core';

export {
  compareSizeAsc,
  sortSizeNames,
} from './api/size';

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
} from './api/production';

export {
  updateFinanceReconciliationStatus,
  returnFinanceReconciliation,
} from './api/finance';

// 默认导出
import { createApiClient } from './api/core';
export default createApiClient();
