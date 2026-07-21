// 我的订单模块类型定义 —— 订单域

export interface ProductionOrder extends Record<string, unknown> {
  id?: string;
  orderNo: string;
  styleId: string;
  skc?: string;
  styleNo: string;
  styleName: string;
  /** 关联电商单号（出库后由后端批量填充，未关联时为空） */
  ecOrderNo?: string;
  /** 关联电商平台：TB/JD/PDD/DY/XHS/WC/SFY 等 */
  ecPlatform?: string;
  /** 次品数量汇总（由后端批量填充，有次品记录的订单 >0，用于前端进度球红点预显示） */
  unqualifiedQuantity?: number;
  color?: string;
  size?: string;
  factoryId: string;
  factoryName: string;
  factoryType?: 'INTERNAL' | 'EXTERNAL';
  orgUnitId?: string;
  parentOrgUnitId?: string;
  parentOrgUnitName?: string;
  orgPath?: string;
  factoryContactPerson?: string; // 工厂联系人
  factoryContactPhone?: string; // 工厂联系电话
  merchandiser?: string; // 跟单员（选填，可选择系统用户）
  company?: string; // 客户公司名称（选填，冗余快照）
  customerName?: string; // CRM客户名称快照（优先于company显示）
  productCategory?: string; // 品类（选填）
  patternMaker?: string; // 纸样师（选填，可选择系统用户）
  orderQuantity: number;
  completedQuantity: number;
  cuttingQuantity?: number;
  cuttingBundleCount?: number;
  currentProcessName?: string;
  warehousingQualifiedQuantity?: number;
  outstockQuantity?: number;
  inStockQuantity?: number;
  materialArrivalRate: number;
  productionProgress: number;
  status: 'pending' | 'production' | 'completed' | 'delayed' | 'scrapped' | 'cancelled' | 'closed' | 'archived' | 'paused' | 'returned';
  /** 紧急程度: urgent=急单, normal=普通，默认普通 */
  urgencyLevel?: 'urgent' | 'normal';
  plateType?: 'FIRST' | 'REORDER';
  isQuickResponse?: boolean;
  standardDeliveryDays?: number;
  actualDeliveryDays?: number;
  deliverySlaStatus?: 'on_track' | 'at_risk' | 'breached' | 'completed';
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate?: string;
  actualEndDate?: string;
  createTime?: string;
  updateTime?: string;
  qrCode?: string;
  styleCover?: string;
  orderDetails?: string;

  progressWorkflowJson?: string;
  progressWorkflowLocked?: boolean;
  progressWorkflowLockedAt?: string;
  progressWorkflowLockedBy?: string;
  progressWorkflowLockedByName?: string;

  orderStartTime?: string;
  orderEndTime?: string;
  orderOperatorName?: string;
  orderCompletionRate?: number;

  procurementStartTime?: string;
  procurementEndTime?: string;
  procurementOperatorName?: string;
  procurementCompletionRate?: number;

  cuttingStartTime?: string;
  cuttingEndTime?: string;
  cuttingOperatorName?: string;
  cuttingCompletionRate?: number;

  sewingStartTime?: string;
  sewingEndTime?: string;
  sewingOperatorName?: string;
  sewingCompletionRate?: number;
  carSewingStartTime?: string;
  carSewingEndTime?: string;
  carSewingOperatorName?: string;
  carSewingCompletionRate?: number;
  ironingStartTime?: string;
  ironingEndTime?: string;
  ironingOperatorName?: string;
  ironingCompletionRate?: number;
  packagingStartTime?: string;
  packagingEndTime?: string;
  packagingOperatorName?: string;
  packagingCompletionRate?: number;

  secondaryProcessStartTime?: string;
  secondaryProcessEndTime?: string;
  secondaryProcessOperatorName?: string;
  secondaryProcessCompletionRate?: number;
  secondaryProcessRate?: number;

  tailProcessRate?: number;
  hasSecondaryProcess?: boolean;

  qualityStartTime?: string;
  qualityEndTime?: string;
  qualityOperatorName?: string;
  qualityCompletionRate?: number;

  warehousingStartTime?: string;
  warehousingEndTime?: string;
  warehousingOperatorName?: string;
  warehousingCompletionRate?: number;

  operationRemark?: string;

  extJson?: string | Record<string, unknown> | null;

  factoryUnitPrice?: number;
  quotationUnitPrice?: number;
  pricingMode?: 'PROCESS' | 'SIZE' | 'QUOTE' | 'MANUAL';
  scatterPricingMode?: 'FOLLOW_ORDER' | 'MANUAL';
  scatterCuttingUnitPrice?: number;

  // 工序单价和明细
  progressNodeUnitPrices?: any[]; // 工序节点单价数组

  // 采购手动确认相关字段（后端 Integer 0/1，前端用 === 1 判断）
  procurementManuallyCompleted?: number | boolean;
  procurementConfirmedBy?: string;
  procurementConfirmedByName?: string;
  procurementConfirmedAt?: string;
  procurementConfirmRemark?: string;
  /** 下单业务类型：FOB=离岸价交货, ODM=原创设计制造, OEM=代工贴牌, CMT=纯加工 */
  orderBizType?: 'FOB' | 'ODM' | 'OEM' | 'CMT';
  /** 订单来源类型：BULK=大货, SAMPLE=样衣 */
  sourceBizType?: 'BULK' | 'SAMPLE';
}

export interface CuttingTask {
  id?: string;
  productionOrderId: string;
  productionOrderNo: string;
  orderQrCode?: string;
  qrCode?: string;
  styleId: string;
  styleNo: string;
  styleName?: string;
  color?: string;
  size?: string;
  orderQuantity?: number;
  cuttingQuantity?: number;
  cuttingBundleCount?: number;
  status?: string;
  receiverId?: string;
  receiverName?: string;
  receivedTime?: string;
  bundledTime?: string;
  createTime?: string;
  updateTime?: string;
  orderCreatorName?: string;
  creatorName?: string;
  orderTime?: string;
  remarks?: string;
  expectedShipDate?: string;
  factoryName?: string;
  factoryType?: 'INTERNAL' | 'EXTERNAL';
  styleCover?: string;
  hasScanRecords?: boolean;
}

export interface ProductionQueryParams {
  orderNo?: string;
  styleNo?: string;
  factoryName?: string;
  orgUnitId?: string;
  parentOrgUnitId?: string;
  factoryType?: 'INTERNAL' | 'EXTERNAL' | '';
  /** 按工厂ID精确筛选（管理员在外发工厂页面选择侧边栏工厂时使用） */
  factoryId?: string;
  status?: string;
  /** 紧急程度筛选: urgent=急单, normal=普通 */
  urgencyLevel?: string;
  /** 订单类型筛选: FIRST=首单, REORDER=翻单 */
  plateType?: string;
  /** 跟单员筛选（模糊匹配） */
  merchandiser?: string;
  /** CRM客户ID筛选（精确匹配，映射customer_id列） */
  customerId?: string;
  /** CRM客户名称筛选（模糊匹配） */
  customerName?: string;
  keyword?: string;
  /** 我的订单页传 true，显示报废订单；其他页面不传，默认过滤掉报废订单 */
  includeScrapped?: boolean;
  /** 仅显示延期订单 */
  delayedOnly?: string | boolean;
  /** 仅显示今日订单 */
  todayOnly?: string | boolean;
  /** 排除终态订单（completed/cancelled/scrapped/archived/closed） */
  excludeTerminal?: string | boolean;
  page: number;
  pageSize: number;
}

export type OrderLine = {
  id?: string;
  color: string;
  size: string;
  quantity: number;
  skuNo?: string;
  totalPrice?: number;
  qualityQuantity?: number;
  defectiveQuantity?: number;
  warehousingQuantity?: number;
  warehousedQuantity?: number;
};
