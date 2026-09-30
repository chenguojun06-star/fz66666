/**
 * 工厂汇总（加工费结算）相关类型定义。
 *
 * 单独成文件的原因：`utils.ts` 需要引用这些类型，若仍定义在
 * `useFactorySummaryData.ts` 中，会形成 utils ↔ hook 的循环依赖。
 */

export interface FactorySummaryRow {
  factoryId: string;
  factoryName: string;
  factoryType?: string;
  parentOrgUnitName?: string;
  orgPath?: string;
  orderCount: number;
  totalOrderQuantity: number;
  totalWarehousedQuantity: number;
  totalDefectQuantity: number;
  totalMaterialCost: number;
  totalProductionCost: number;
  totalAmount: number;
  totalProfit: number;
  /** D-134：已审批订单的扣款合计（未抵扣部分） */
  totalDeduction?: number;
  /** D-134：已审批订单的补款合计（SUPPLEMENT） */
  totalSupplement?: number;
  /** D-134：净额 = 加工费 − 扣款 + 补款（终审推送默认金额） */
  netAmount?: number;
  /** D-136：抵扣清单（含上期结转项），前端勾选后随推送回传 deductionIds */
  deductionItems?: Array<{
    id: string;
    deductionType?: string;
    description?: string;
    amount: number;
    isSupplement?: boolean;
    orderNo?: string;
    carryOver?: boolean;
  }>;
  orderNos: string[];
  approvedOrderNos?: string[];
  [key: string]: unknown;
}

export interface FactorySummaryStats {
  total: number;
  pendingCount: number;
  approvedCount: number;
  totalAmount: number;
}

export interface FactorySummaryTotals {
  totalOrders: number;
  totalQty: number;
  totalWarehoused: number;
  totalDefect: number;
  totalMaterialCost: number;
  totalProductionCost: number;
  totalAmount: number;
  totalProfit: number;
}
