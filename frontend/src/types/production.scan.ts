// 我的订单模块类型定义 —— 扫码域

import type { ProductionOrder } from './production.order';

export interface ScanRecord extends Record<string, unknown> {
  id?: string;
  scanCode?: string;
  requestId?: string;
  orderId: string;
  orderNo: string;
  styleId: string;
  styleNo: string;
  color?: string;
  size?: string;
  quantity?: number;
  unitPrice?: number;
  totalAmount?: number;
  processCode?: string;
  progressStage?: string;
  processName?: string;
  operatorId: string;
  operatorName: string;
  scanTime: string;
  scanType: 'cutting' | 'production' | 'quality' | 'warehouse' | 'pattern' | 'orchestration';
  scanResult: 'success' | 'failure';
  remark?: string;
  settlementStatus?: string;
  scanIp?: string;
  cuttingBundleId?: string;
  cuttingBundleNo?: number;
  cuttingBundleQrCode?: string;
  createTime?: string;
  updateTime?: string;

  // Phase 3-6 新增字段（扫码系统增强）
  /** 当前工序阶段 */
  currentProgressStage?: string;
  /** 工序节点单价列表（JSON格式） */
  progressNodeUnitPrices?: string;
  /** 累计扫码次数 */
  cumulativeScanCount?: number;
  /** 总扫码次数 */
  totalScanCount?: number;
  /** 进度百分比 */
  progressPercentage?: number;
  /** 总成本 */
  totalPieceCost?: number;
  /** 平均成本 */
  averagePieceCost?: number;
  /** 工序指派ID */
  assignmentId?: number;
  /** 指派操作员名称 */
  assignedOperatorName?: string;
  /** 工资结算ID（非空表示已结算，不可撤回） */
  payrollSettlementId?: string;

  // Phase 5/6 新增字段（工序成本、指派、追溯）
  /** 领取/开始时间 */
  receiveTime?: string;
  /** 录入结果/完成时间 */
  confirmTime?: string;
  /** 扫码模式:ORDER/BUNDLE/SKU */
  scanMode?: string;
  /** SKU已完成数 */
  skuCompletedCount?: number;
  /** SKU总数 */
  skuTotalCount?: number;
  /** 工序单价 */
  processUnitPrice?: number;
  /** 本次扫码工序成本 */
  scanCost?: number;
  /** 指派目标类型:internal/external/none */
  delegateTargetType?: string;
  /** 指派目标ID */
  delegateTargetId?: string;
  /** 指派目标名称 */
  delegateTargetName?: string;
  /** 实际操作员ID（追溯） */
  actualOperatorId?: string;
  /** 实际操作员名称 */
  actualOperatorName?: string;
  /** 租户ID */
  tenantId?: number;
  /** 扫码时归属外发工厂ID */
  factoryId?: string;

  extJson?: string | Record<string, unknown> | null;
}

export interface CuttingBundle extends Record<string, unknown> {
  id?: string;
  productionOrderId: string;
  productionOrderNo: string;
  styleId: string;
  styleNo: string;
  color?: string;
  size?: string;
  bundleNo: number;
  quantity: number;
  qrCode: string;
  status?: string;
  createTime?: string;
  updateTime?: string;
}

export interface ScanQueryParams {
  orderNo?: string;
  styleNo?: string;
  operatorName?: string;
  scanType?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  pageSize: number;
}

export interface ScanResult {
  success: boolean;
  message: string;
  data?: {
    orderInfo: ProductionOrder;
    scanRecord: ScanRecord;
    cuttingBundle?: CuttingBundle;
  };
}
