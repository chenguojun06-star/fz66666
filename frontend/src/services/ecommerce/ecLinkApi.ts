/**
 * 电商 ↔ 生产 ↔ 仓库 联动面板数据接口
 *
 * 对应后端 EcProductionLinkOrchestrator：
 *  - GET /ecommerce/orders/brief-by-production  生产端看电商动态
 *  - GET /production/orders/brief               销售端看生产动态
 *
 * 约定：后端只返回真实落库数据，查不到时返回 { linked: false, reason }。
 * 前端必须据此显示"暂无关联/暂无数据"，**不得对缺失字段做 0 或默认值兜底**。
 */
import api from '@/utils/api';

/** 近 N 天销量趋势点（来自 t_ec_sales_revenue 真实出库流水，逐日聚合） */
export interface EcSalesTrendPoint {
  date: string;
  quantity: number;
  amount: number;
}

/** 库存联动快照（按款号汇总 t_ec_universal_stock） */
export interface EcStockBrief {
  availableStock: number;
  onWayProduction: number;
  pendingOrders: number;
  totalWarehoused: number;
  totalOutstock: number;
  safeStock: number;
  skuCount: number;
  /** 仅当安全库存被真实设置过（>0）时才可能为 true */
  belowSafeStock: boolean;
}

/** 生产端看到的电商动态 */
export interface EcBrief {
  linked: boolean;
  reason?: string;
  ecOrderNo?: string | null;
  platform?: string | null;
  platformOrderNo?: string | null;
  shopName?: string | null;
  productName?: string | null;
  skuCode?: string | null;
  styleNo?: string | null;
  quantity?: number | null;
  payAmount?: number | null;
  buyerNick?: string | null;
  buyerRemark?: string | null;
  isPresale?: number | null;
  status?: number | null;
  statusText?: string | null;
  warehouseStatus?: number | null;
  warehouseStatusText?: string | null;
  createTime?: string | null;
  payTime?: string | null;
  shipTime?: string | null;
  completeTime?: string | null;
  trackingNo?: string | null;
  expressCompany?: string | null;
  salesTrend?: EcSalesTrendPoint[];
  stock?: EcStockBrief | null;
}

/** 交期推导（仅当计划交期真实存在时才给出） */
export interface DeliveryHint {
  daysLeft: number | null;
  riskLevel: 'done' | 'unknown' | 'normal' | 'warning' | 'danger';
  riskText: string;
}

/** 销售端看到的生产动态 */
export interface ProductionBrief {
  linked: boolean;
  reason?: string;
  orderNo?: string | null;
  styleNo?: string | null;
  styleName?: string | null;
  factoryName?: string | null;
  platformCode?: string | null;
  status?: string | null;
  statusText?: string | null;
  currentProcess?: string | null;
  orderQuantity?: number | null;
  completedQuantity?: number | null;
  productionProgress?: number | null;
  materialArrivalRate?: number | null;
  urgencyLevel?: string | null;
  deliverySlaStatus?: string | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  expectedShipDate?: string | null;
  delivery?: DeliveryHint | null;
  stock?: EcStockBrief | null;
}

const SUCCESS_CODE = 200;

async function getPayload<T>(url: string, params: Record<string, unknown>): Promise<T | null> {
  const res = (await api.get(url, { params })) as unknown as {
    code?: number;
    data?: T;
    message?: string;
  };
  if (res?.code !== SUCCESS_CODE) {
    throw new Error(res?.message || '请求失败');
  }
  return res.data ?? null;
}

export const ecLinkApi = {
  /** 生产端：按生产单号取电商动态 */
  briefByProductionOrder: (productionOrderNo: string) =>
    getPayload<EcBrief>('/ecommerce/orders/brief-by-production', { productionOrderNo }),

  /** 销售端：按生产单号取生产动态 */
  productionBrief: (orderNo: string) =>
    getPayload<ProductionBrief>('/production/orders/brief', { orderNo }),
};

export default ecLinkApi;
