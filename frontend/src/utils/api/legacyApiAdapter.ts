/**
 * Legacy API Adapter - 废弃端点自动适配器
 *
 * 自动将废弃的API调用重定向到新端点
 * 兼容期：2026-02-01 ~ 2026-05-01（3个月）
 *
 * @version 1.0.0
 * @date 2026-02-01
 */

import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

/**
 * 废弃端点映射表
 * 格式：{ 旧路径模式: 转换函数 }
 */
const DEPRECATED_ENDPOINTS = {
  // ============================================================
  // Phase 1: ProductionOrderController（3个废弃端点）
  // 注意：/detail/:id 是正常端点，不需要转换！
  // ============================================================

  '/production/order/by-order-no/:orderNo': (config: AxiosRequestConfig) => {
    const orderNo = config.url?.match(/by-order-no\/([^/]+)/)?.[1];
    console.warn(`[API迁移] /by-order-no/${orderNo} 已废弃，请使用 /list?orderNo=${orderNo}`);
    return {
      ...config,
      url: config.url?.replace(/\/by-order-no\/([^/]+)/, '/list'),
      params: { ...config.params, orderNo }
    };
  },

  '/production/order/detail-dto/:id': (config: AxiosRequestConfig) => {
    const id = config.url?.match(/detail-dto\/([^/]+)/)?.[1];
    console.warn(`[API迁移] /detail-dto/${id} 已废弃，请使用 /detail/${id}`);
    return {
      ...config,
      url: config.url?.replace(/\/detail-dto\//, '/detail/')
    };
  },

  'POST /production/order/save': (config: AxiosRequestConfig) => {
    console.warn('[API迁移] POST /save 已废弃，请使用 POST / 或 PUT /');
    const hasId = config.data?.id;
    return {
      ...config,
      method: hasId ? 'put' : 'post',
      url: config.url?.replace(/\/save$/, '/')
    };
  },

  '/production/order/delete/:id': (config: AxiosRequestConfig) => {
    const id = config.url?.match(/delete\/([^/]+)/)?.[1];
    console.warn(`[API迁移] POST /delete/${id} 已废弃，请使用 DELETE /${id}`);
    return {
      ...config,
      method: 'delete',
      url: config.url?.replace(/\/delete\//, '/')
    };
  },

  // ============================================================
  // Phase 1: ScanRecordController（10个废弃端点）
  // ============================================================

  '/production/scan-record/by-order/:orderId': (config: AxiosRequestConfig) => {
    const orderId = config.url?.match(/by-order\/([^/]+)/)?.[1];
    console.warn(`[API迁移] /by-order/${orderId} 已废弃，请使用 /list?orderId=${orderId}`);
    return {
      ...config,
      url: config.url?.replace(/\/by-order\/[^/]+/, '/list'),
      params: { ...config.params, orderId }
    };
  },

  '/production/scan-record/by-style/:styleNo': (config: AxiosRequestConfig) => {
    const styleNo = config.url?.match(/by-style\/([^/]+)/)?.[1];
    console.warn(`[API迁移] /by-style/${styleNo} 已废弃，请使用 /list?styleNo=${styleNo}`);
    return {
      ...config,
      url: config.url?.replace(/\/by-style\/[^/]+/, '/list'),
      params: { ...config.params, styleNo }
    };
  },

  '/production/scan-record/current-user': (config: AxiosRequestConfig) => {
    console.warn('[API迁移] /current-user 已废弃，请使用 /list?currentUser=true');
    return {
      ...config,
      url: config.url?.replace(/\/current-user$/, '/list'),
      params: { ...config.params, currentUser: 'true' }
    };
  },

  '/production/scan-record/sku/by-order/:orderId': (config: AxiosRequestConfig) => {
    const orderId = config.url?.match(/by-order\/([^/]+)/)?.[1];
    console.warn(`[API迁移] /sku/by-order/${orderId} 已废弃，请使用 /sku/query?orderId=${orderId}`);
    return {
      ...config,
      url: config.url?.replace(/\/sku\/by-order\/[^/]+/, '/sku/query'),
      params: { ...config.params, orderId }
    };
  },

  '/production/scan-record/sku/by-style/:styleNo': (config: AxiosRequestConfig) => {
    const styleNo = config.url?.match(/by-style\/([^/]+)/)?.[1];
    console.warn(`[API迁移] /sku/by-style/${styleNo} 已废弃，请使用 /sku/query?styleNo=${styleNo}`);
    return {
      ...config,
      url: config.url?.replace(/\/sku\/by-style\/[^/]+/, '/sku/query'),
      params: { ...config.params, styleNo }
    };
  },

  '/production/scan-record/sku/by-color': (config: AxiosRequestConfig) => {
    console.warn('[API迁移] /sku/by-color 已废弃，请使用 /sku/query?color=xxx');
    return {
      ...config,
      url: config.url?.replace(/\/sku\/by-color$/, '/sku/query'),
      params: { ...config.params, color: config.params?.color }
    };
  },

  '/production/scan-record/sku/by-size': (config: AxiosRequestConfig) => {
    console.warn('[API迁移] /sku/by-size 已废弃，请使用 /sku/query?size=xxx');
    return {
      ...config,
      url: config.url?.replace(/\/sku\/by-size$/, '/sku/query'),
      params: { ...config.params, size: config.params?.size }
    };
  },

  '/production/scan-record/sku/by-bundle/:bundleNo': (config: AxiosRequestConfig) => {
    const bundleNo = config.url?.match(/by-bundle\/([^/]+)/)?.[1];
    console.warn(`[API迁移] /sku/by-bundle/${bundleNo} 已废弃，请使用 /sku/query?bundleNo=${bundleNo}`);
    return {
      ...config,
      url: config.url?.replace(/\/sku\/by-bundle\/[^/]+/, '/sku/query'),
      params: { ...config.params, bundleNo }
    };
  },

  '/production/scan-record/sku/by-date-range': (config: AxiosRequestConfig) => {
    console.warn('[API迁移] /sku/by-date-range 已废弃，请使用 /sku/query?startDate=xxx&endDate=xxx');
    return {
      ...config,
      url: config.url?.replace(/\/sku\/by-date-range$/, '/sku/query')
    };
  },

  '/production/scan-record/sku/summary': (config: AxiosRequestConfig) => {
    console.warn('[API迁移] /sku/summary 已废弃，请使用 /sku/query?summary=true');
    return {
      ...config,
      url: config.url?.replace(/\/sku\/summary$/, '/sku/query'),
      params: { ...config.params, summary: 'true' }
    };
  },

  // ============================================================
  // Phase 1: MaterialPurchaseController（3个废弃端点）
  // ============================================================

  '/production/material-purchase/by-scan-code': (config: AxiosRequestConfig) => {
    console.warn('[API迁移] /by-scan-code 已废弃，请使用 /list?scanCode=xxx');
    return {
      ...config,
      url: config.url?.replace(/\/by-scan-code$/, '/list'),
      params: { ...config.params, scanCode: config.params?.scanCode }
    };
  },

  '/production/material-purchase/my-tasks': (config: AxiosRequestConfig) => {
    console.warn('[API迁移] /my-tasks 已废弃，请使用 /list?myTasks=true');
    return {
      ...config,
      url: config.url?.replace(/\/my-tasks$/, '/list'),
      params: { ...config.params, myTasks: 'true' }
    };
  },

  'POST /production/material-purchase/returnConfirm': (config: AxiosRequestConfig) => {
    console.warn('[API迁移] POST /returnConfirm 已废弃，请使用 POST /return-confirm');
    return {
      ...config,
      url: config.url?.replace(/\/returnConfirm$/, '/return-confirm')
    };
  },

  // ============================================================
  // Phase 1: CuttingTaskController（1个废弃端点）
  // ============================================================

  '/production/cutting-task/my-tasks': (config: AxiosRequestConfig) => {
    console.warn('[API迁移] /my-tasks 已废弃，请使用 /list?myTasks=true');
    return {
      ...config,
      url: config.url?.replace(/\/my-tasks$/, '/list'),
      params: { ...config.params, myTasks: 'true' }
    };
  },

  // ============================================================
  // Phase 1: CuttingBundleController（2个废弃端点）
  // ============================================================

  '/production/cutting-bundle/by-code': (config: AxiosRequestConfig) => {
    console.warn('[API迁移] /by-code 已废弃，请使用 /list?qrCode=xxx');
    return {
      ...config,
      url: config.url?.replace(/\/by-code$/, '/list'),
      params: { ...config.params, qrCode: config.params?.qrCode }
    };
  },

  '/production/cutting-bundle/by-no': (config: AxiosRequestConfig) => {
    console.warn('[API迁移] /by-no 已废弃，请使用 /list?bundleNo=xxx');
    return {
      ...config,
      url: config.url?.replace(/\/by-no$/, '/list'),
      params: { ...config.params, bundleNo: config.params?.bundleNo }
    };
  },

  // ============================================================
  // Phase 2: OrderTransferController（3个废弃端点）
  // ============================================================

  '/production/order-transfer/pending': (config: AxiosRequestConfig) => {
    console.warn('[API迁移] /pending 已废弃，请使用 /list?type=pending');
    return {
      ...config,
      url: config.url?.replace(/\/pending$/, '/list'),
      params: { ...config.params, type: 'pending' }
    };
  },

  '/production/order-transfer/my-transfers': (config: AxiosRequestConfig) => {
    console.warn('[API迁移] /my-transfers 已废弃，请使用 /list?type=my-transfers');
    return {
      ...config,
      url: config.url?.replace(/\/my-transfers$/, '/list'),
      params: { ...config.params, type: 'my-transfers' }
    };
  },

  '/production/order-transfer/received': (config: AxiosRequestConfig) => {
    console.warn('[API迁移] /received 已废弃，请使用 /list?type=received');
    return {
      ...config,
      url: config.url?.replace(/\/received$/, '/list'),
      params: { ...config.params, type: 'received' }
    };
  },

  // ============================================================
  // Phase 2: TemplateLibraryController（2个废弃端点）
  // ============================================================

  '/template/library/type/:templateType': (config: AxiosRequestConfig) => {
    const templateType = config.url?.match(/type\/([^/]+)/)?.[1];
    console.warn(`[API迁移] /type/${templateType} 已废弃，请使用 /list?templateType=${templateType}`);
    return {
      ...config,
      url: config.url?.replace(/\/type\/[^/]+/, '/list'),
      params: { ...config.params, templateType }
    };
  },

  'POST /template/library/save': (config: AxiosRequestConfig) => {
    console.warn('[API迁移] POST /save 已废弃，请使用 POST / 或 PUT /');
    const hasId = config.data?.id;
    return {
      ...config,
      method: hasId ? 'put' : 'post',
      url: config.url?.replace(/\/save$/, hasId ? '' : '')
    };
  },

  // ============================================================
  // Phase 2: ShipmentReconciliationController（1个废弃端点）
  // ============================================================

  '/finance/shipment-reconciliation/list-all': (config: AxiosRequestConfig) => {
    console.warn('[API迁移] /list-all 已废弃，请使用 /list');
    return {
      ...config,
      url: config.url?.replace(/\/list-all$/, '/list')
    };
  },

  // ============================================================
  // Phase 3: StyleInfoController - 已禁用
  // 原因：后端保留了旧端点（/pattern/start等），不需要转换
  // 新端点 /stage-action 作为可选的统一入口，但不强制迁移
  // ============================================================

  // ============================================================
  // Phase 3: UserController（2个废弃端点）
  // ============================================================

  'POST /system/user/:id/approve': (config: AxiosRequestConfig) => {
    const id = config.url?.match(/\/(\d+)\/approve/)?.[1];
    console.warn(`[API迁移] /${id}/approve 已废弃，请使用 /${id}/approval-action?action=approve`);
    return {
      ...config,
      url: config.url?.replace(/\/approve$/, '/approval-action'),
      params: { ...config.params, action: 'approve' }
    };
  },

  'POST /system/user/:id/reject': (config: AxiosRequestConfig) => {
    const id = config.url?.match(/\/(\d+)\/reject/)?.[1];
    console.warn(`[API迁移] /${id}/reject 已废弃，请使用 /${id}/approval-action?action=reject`);
    return {
      ...config,
      url: config.url?.replace(/\/reject$/, '/approval-action'),
      params: { ...config.params, action: 'reject' }
    };
  },

  // ============================================================
  // Phase 3: PatternProductionController（4个废弃端点）
  // ============================================================

  'POST /production/pattern/:patternId/receive': (config: AxiosRequestConfig) => {
    const patternId = config.url?.match(/pattern\/([^/]+)\/receive/)?.[1];
    console.warn(`[API迁移] /${patternId}/receive 已废弃，请使用 /${patternId}/workflow-action?action=receive`);
    return {
      ...config,
      url: config.url?.replace(/\/receive$/, '/workflow-action'),
      params: { ...config.params, action: 'receive' }
    };
  },

  'POST /production/pattern/:patternId/complete': (config: AxiosRequestConfig) => {
    const patternId = config.url?.match(/pattern\/([^/]+)\/complete/)?.[1];
    console.warn(`[API迁移] /${patternId}/complete 已废弃，请使用 /${patternId}/workflow-action?action=complete`);
    return {
      ...config,
      url: config.url?.replace(/\/complete$/, '/workflow-action'),
      params: { ...config.params, action: 'complete' }
    };
  },

  'POST /production/pattern/:patternId/warehouse-in': (config: AxiosRequestConfig) => {
    const patternId = config.url?.match(/pattern\/([^/]+)\/warehouse-in/)?.[1];
    console.warn(`[API迁移] /${patternId}/warehouse-in 已废弃，请使用 /${patternId}/workflow-action?action=warehouse-in`);
    return {
      ...config,
      url: config.url?.replace(/\/warehouse-in$/, '/workflow-action'),
      params: { ...config.params, action: 'warehouse-in' }
    };
  },

  'POST /production/pattern/:id/maintenance': (config: AxiosRequestConfig) => {
    const id = config.url?.match(/pattern\/([^/]+)\/maintenance/)?.[1];
    console.warn(`[API迁移] /${id}/maintenance 已废弃，请使用 /${id}/workflow-action?action=maintenance`);
    return {
      ...config,
      url: config.url?.replace(/\/maintenance$/, '/workflow-action'),
      params: { ...config.params, action: 'maintenance' }
    };
  },

  // ============================================================
  // Phase 4: StyleBomController（1个废弃端点）
  // ============================================================

  'POST /style/bom/:styleId/sync-material-database/async': (config: AxiosRequestConfig) => {
    const styleId = config.url?.match(/bom\/([^/]+)\/sync-material-database/)?.[1];
    console.warn(`[API迁移] /${styleId}/sync-material-database/async 已废弃，请使用 /${styleId}/sync-material-database?async=true`);
    return {
      ...config,
      url: config.url?.replace(/\/sync-material-database\/async$/, '/sync-material-database'),
      params: { ...config.params, async: true }
    };
  },

  // ============================================================
  // Phase 4: PatternRevisionController（4个废弃端点）
  // ============================================================

  'POST /pattern-revision/:id/submit': (config: AxiosRequestConfig) => {
    const id = config.url?.match(/pattern-revision\/([^/]+)\/submit/)?.[1];
    console.warn(`[API迁移] /${id}/submit 已废弃，请使用 /${id}/workflow?action=submit`);
    return {
      ...config,
      url: config.url?.replace(/\/submit$/, '/workflow'),
      params: { ...config.params, action: 'submit' }
    };
  },

  'POST /pattern-revision/:id/approve': (config: AxiosRequestConfig) => {
    const id = config.url?.match(/pattern-revision\/([^/]+)\/approve/)?.[1];
    console.warn(`[API迁移] /${id}/approve 已废弃，请使用 /${id}/workflow?action=approve`);
    return {
      ...config,
      url: config.url?.replace(/\/approve$/, '/workflow'),
      params: { ...config.params, action: 'approve' }
    };
  },

  'POST /pattern-revision/:id/reject': (config: AxiosRequestConfig) => {
    const id = config.url?.match(/pattern-revision\/([^/]+)\/reject/)?.[1];
    console.warn(`[API迁移] /${id}/reject 已废弃，请使用 /${id}/workflow?action=reject`);
    return {
      ...config,
      url: config.url?.replace(/\/reject$/, '/workflow'),
      params: { ...config.params, action: 'reject' }
    };
  },

  'POST /pattern-revision/:id/complete': (config: AxiosRequestConfig) => {
    const id = config.url?.match(/pattern-revision\/([^/]+)\/complete/)?.[1];
    console.warn(`[API迁移] /${id}/complete 已废弃，请使用 /${id}/workflow?action=complete`);
    return {
      ...config,
      url: config.url?.replace(/\/complete$/, '/workflow'),
      params: { ...config.params, action: 'complete' }
    };
  },

  // ============================================================
  // Phase 4: ProductWarehousingController（1个废弃端点）
  // ============================================================

  'POST /production/warehousing/repair-stats/batch': (config: AxiosRequestConfig) => {
    console.warn('[API迁移] POST /repair-stats/batch 已废弃，请使用 POST /repair-stats（统一端点支持批量）');
    return {
      ...config,
      url: config.url?.replace(/\/repair-stats\/batch$/, '/repair-stats')
    };
  },

  // ============================================================
  // Phase 4: MaterialReconciliationController（2个废弃端点）
  // ============================================================

  'POST /finance/material-reconciliation/update-status': (config: AxiosRequestConfig) => {
    const { id, status } = config.data || {};
    console.warn(`[API迁移] POST /update-status 已废弃，请使用 POST /${id}/status-action?action=update&status=${status}`);
    return {
      ...config,
      url: config.url?.replace(/\/update-status$/, `/${id}/status-action`),
      params: { ...config.params, action: 'update', status },
      data: undefined
    };
  },

  'POST /finance/material-reconciliation/return': (config: AxiosRequestConfig) => {
    const { id, reason } = config.data || {};
    console.warn(`[API迁移] POST /return 已废弃，请使用 POST /${id}/status-action?action=return&reason=${reason}`);
    return {
      ...config,
      url: config.url?.replace(/\/return$/, `/${id}/status-action`),
      params: { ...config.params, action: 'return', reason },
      data: undefined
    };
  },

  // ============================================================
  // Phase 5: 端点名称规范化（page → list）
  // 前端使用 /page，后端使用 /list，自动转换
  // ============================================================

  '/production/material/stock/page': (config: AxiosRequestConfig) => {
    console.warn('[API迁移] /material/stock/page 已废弃，请使用 /material/stock/list');
    return {
      ...config,
      url: config.url?.replace(/\/stock\/page$/, '/stock/list')
    };
  },

  '/finance/finished-settlement/page': (config: AxiosRequestConfig) => {
    console.warn('[API迁移] /finished-settlement/page 已废弃，请使用 /finished-settlement/list');
    return {
      ...config,
      url: config.url?.replace(/\/page$/, '/list')
    };
  },

  '/production/picking/page': (config: AxiosRequestConfig) => {
    console.warn('[API迁移] /picking/page 已废弃，请使用 /picking/list');
    return {
      ...config,
      url: config.url?.replace(/\/page$/, '/list')
    };
  },

  '/production/order/detail/:orderNo': (config: AxiosRequestConfig) => {
    // 检查参数是否为订单号（PO/ORD开头）而非数字ID
    const param = config.url?.match(/\/detail\/([^/?]+)/)?.[1];
    if (param && /^(PO|ORD)\d+/.test(param)) {
      // 订单号直接使用 /list?orderNo={orderNo} 查询（后端统一接口）
      console.warn(`[API迁移] /detail/${param} 已自动转换为 /list?orderNo=${param}`);
      return {
        ...config,
        url: config.url?.replace(/\/detail\/([^/?]+)/, '/list'),
        params: { ...config.params, orderNo: param }
      };
    }
    // 数字ID不转换（使用 /detail/:id）
    return config;
  },
};

/**
 * 检查并适配废弃的API端点
 *
 * @param config Axios请求配置
 * @returns 适配后的请求配置
 */
export function adaptLegacyApi(config: AxiosRequestConfig): AxiosRequestConfig {
  if (!config.url) {
    return config;
  }

  // 遍历所有废弃端点模式
  for (const [pattern, adapter] of Object.entries(DEPRECATED_ENDPOINTS)) {
    // 提取方法前缀（如果有）
    const methodMatch = pattern.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(.+)$/);
    const method = methodMatch ? methodMatch[1].toLowerCase() : null;
    const path = methodMatch ? methodMatch[2] : pattern;

    // 如果指定了方法，检查方法是否匹配
    if (method && config.method?.toLowerCase() !== method) {
      continue;
    }

    // 将路径模式转换为正则表达式
    const regexPattern = path
      .replace(/:[^/]+/g, '[^/]+')  // :id → [^/]+
      .replace(/\//g, '\\/')         // / → \/
      .replace(/\?/g, '\\?');        // ? → \?

    const regex = new RegExp(`${regexPattern}$`);

    // 检查URL是否匹配
    if (regex.test(config.url)) {
      return adapter(config);
    }
  }

  return config;
}

/**
 * Axios拦截器：自动适配废弃端点
 *
 * 使用方法：
 * ```typescript
 * import { setupLegacyApiAdapter } from '@/utils/api/legacyApiAdapter';
 * import axios from 'axios';
 *
 * setupLegacyApiAdapter(axios);
 * ```
 */
export function setupLegacyApiAdapter(axiosInstance: typeof axios) {
  axiosInstance.interceptors.request.use(
    (config) => {
      return adaptLegacyApi(config);
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  console.info('[Legacy API Adapter] 已启用废弃API自动适配器（兼容期至2026-05-01）');
}

/**
 * 获取所有废弃端点列表（用于文档生成）
 */
export function getDeprecatedEndpoints(): string[] {
  return Object.keys(DEPRECATED_ENDPOINTS);
}

/**
 * 检查指定URL是否为废弃端点
 */
export function isDeprecatedEndpoint(url: string, method?: string): boolean {
  const config: AxiosRequestConfig = { url, method: method?.toLowerCase() };
  const adapted = adaptLegacyApi(config);
  // 比较URL是否被修改，而非对象引用
  return adapted.url !== config.url;
}

export default {
  adaptLegacyApi,
  setupLegacyApiAdapter,
  getDeprecatedEndpoints,
  isDeprecatedEndpoint,
};
