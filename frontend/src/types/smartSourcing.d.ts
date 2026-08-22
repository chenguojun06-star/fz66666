// ── 智能采购推荐 V2：待采购订单列表 & 批量概览 & 详情缓存 ──
// ⚠️ 本文件字段必须与后端 DTO 一一对应，修改前先核对：
//   backend/.../production/dto/smart/SmartSourcingFilter.java
//   backend/.../production/dto/smart/OrderBasicDto.java
//   backend/.../production/dto/smart/SmartSourcingOrdersPage.java
//   backend/.../production/dto/smart/SmartSourcingOverviewResponse.java
//   backend/.../production/dto/smart/OrderOverviewDto.java

/**
 * 订单筛选条件（与后端 SmartSourcingFilter 逐字段对齐）
 * 所有字段可选；不传时走后端默认值：
 *   arrivalRateLessThan=80 / createdWithinDays=60 / 排除终态 / createTime desc
 */
export interface SmartSourcingFilter {
  /** 物料到位率阈值（< 此值才返回），默认80；传100=全部订单 */
  arrivalRateLessThan?: number;
  /** 要排除的订单状态（终态），默认 completed/scrapped/cancelled/closed/archived */
  excludeStatuses?: string[];
  /** 创建时间范围（N天内），默认60；传 null/0 = 不限 */
  createdWithinDays?: number | null;
  /** 订单号/款号/款名模糊搜索 */
  searchKeyword?: string;
  /** 只看某些状态（优先级高于 excludeStatuses） */
  statuses?: string[];
  /** 是否只看急单（urgencyLevel = 'urgent'） */
  onlyUrgent?: boolean;
  /** 分页页码（从1开始，后端默认1） */
  page?: number;
  /** 每页条数（后端默认20，clamp 1~50） */
  pageSize?: number;
  /** 排序字段：createTime / plannedEndDate / materialArrivalRate / orderQuantity */
  sortBy?: 'createTime' | 'plannedEndDate' | 'materialArrivalRate' | 'orderQuantity';
  /** 排序方向：asc / desc */
  sortDir?: 'asc' | 'desc';
}

/** 订单基本信息（轻量，后端仅查 t_production_order，0计算） */
export interface OrderBasicDto {
  orderNo: string;
  styleNo?: string;
  styleName?: string;
  coverImage?: string;
  orderQuantity?: number;
  /** 物料到位率 0-100 */
  materialArrivalRate?: number;
  /** 订单状态：pending/production/delayed/completed/scrapped/cancelled/closed/archived/paused/returned */
  status?: string;
  createTime?: string;
  /** 计划完成日期（交期） */
  plannedEndDate?: string;
  /** 紧急程度：urgent / normal */
  urgencyLevel?: string;
  /** 跟单人 */
  merchandiser?: string;
}

/** 订单列表分页响应（与后端 SmartSourcingOrdersPage 对齐） */
export interface SmartSourcingOrdersPage {
  /** 当前页订单（未计算，前端再调 orders-overview 拿缺料汇总） */
  list: OrderBasicDto[];
  total: number;
  /** 后端 clamp 后实际生效的筛选条件（回显用） */
  appliedFilter?: SmartSourcingFilter;
}

/** 采购提示 */
export interface SourcingHint {
  /** success / warn / risk / info */
  type: 'success' | 'warn' | 'risk' | 'info';
  message: string;
}

/** 单订单缺料概览（与后端 OrderOverviewDto 对齐） */
export interface OrderOverviewDto {
  orderNo: string;
  /** BOM物料种类数 */
  bomItemsCount?: number;
  /** 缺料种类数 */
  shortageCount?: number;
  /** 充足种类数 */
  sufficientCount?: number;
  /** 缺料采购金额预估（元） */
  shortageAmount?: number;
  /** BOM总金额参考（元） */
  totalBomAmount?: number;
  /** 关键缺料名 TOP3 */
  criticalMaterials?: string[];
  /** 关键路径一句话，例如"面料缺2种，辅料缺3种（无法开裁）" */
  criticalPath?: string;
  /** 采购提示（多个） */
  hints?: SourcingHint[];
  /** 计算时间（缓存新鲜度展示） */
  computedAt?: string;
  /** 是否来自缓存 */
  fromCache?: boolean;
}

/** 批量概览响应（与后端 SmartSourcingOverviewResponse 对齐） */
export interface SmartSourcingOverviewResponse {
  /** 每个订单号 → 概览计算结果（成功的都有） */
  overviews: Record<string, OrderOverviewDto>;
  /** 哪些订单命中了缓存 */
  fromCache?: string[];
  /** 哪些订单是本次新计算的 */
  computed?: string[];
  /** 计算失败的订单 + 原因 */
  failed?: Record<string, string>;
  /** 缺料订单数（汇总栏直接显示） */
  shortageOrderCount?: number;
  /** 所有缺料单的预计金额合计 */
  totalShortageAmount?: number;
}

/**
 * 单条净需求明细（后端 calculateNetDemand 返回的 Map 结构）
 * 字段名以后端 buildNetDemandDetails 实际 put 的 key 为准（2026-08-22 核实）：
 *   materialCode / materialName / materialType / specification / unit / color /
 *   bomUsageAmount / orderQuantity / lossRate / demand / availableStock /
 *   inTransit / netDemand / needPurchase / bomUnitPrice / recommendedSupplier（嵌套）/
 *   lastPurchasePrice / lastPurchaseTime / lastPurchaseSupplier /
 *   recommendReason / priceAlert
 */
export interface NetDemandDetail {
  materialCode: string;
  materialName?: string;
  materialType?: string;
  specification?: string;
  unit?: string;
  color?: string;
  /** 单耗用量（BOM） */
  bomUsageAmount?: number;
  orderQuantity?: number;
  /** 损耗率% */
  lossRate?: number;
  /** 总需求 = 单耗 × 订单数量 × (1+损耗率) */
  demand?: number;
  availableStock?: number;
  inTransit?: number;
  /** 净需求 = 需求 - 库存 - 在途，负数截断为0 */
  netDemand?: number;
  /** 是否需采购（netDemand > 0），推送购物车仅包含 true 的行 */
  needPurchase?: boolean;
  /** BOM 预估单价 */
  bomUnitPrice?: number;
  /** 最近一次采购价 */
  lastPurchasePrice?: number;
  lastPurchaseTime?: string | number;
  lastPurchaseSupplier?: string;
  /** 价格对比提示：历史采购价高于/低于BOM预估 */
  priceAlert?: string;
  /** 推荐理由 */
  recommendReason?: string;
  /** 推荐供应商（嵌套对象） */
  recommendedSupplier?: {
    supplierId?: string;
    supplierName?: string;
    supplierTier?: string;
    overallScore?: number;
    qualityScore?: number;
    contactPhone?: string;
    isBomDesignated?: boolean;
  };
}
