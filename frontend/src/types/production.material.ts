// 我的订单模块类型定义 —— 物料采购域

export interface MaterialPurchase extends Record<string, unknown> {
  id?: string;
  purchaseNo: string;
  materialId?: string;
  materialCode: string;
  materialName: string;
  materialType?:
  | 'fabric'
  | 'fabricA'
  | 'fabricB'
  | 'fabricC'
  | 'fabricD'
  | 'fabricE'
  | 'lining'
  | 'liningA'
  | 'liningB'
  | 'liningC'
  | 'liningD'
  | 'liningE'
  | 'accessory'
  | 'accessoryA'
  | 'accessoryB'
  | 'accessoryC'
  | 'accessoryD'
  | 'accessoryE';
  specifications?: string;
  unit?: string;
  purchaseQuantity: number;
  conversionRate?: number;
  arrivedQuantity: number;
  supplierId: string;
  supplierName: string;
  unitPrice?: number;
  totalAmount?: number;
  receiverId?: string;
  receiverName?: string;
  receivedTime?: string;
  remark?: string;
  orderId?: string;
  orderNo?: string;
  orderQuantity?: number;
  styleId?: string;
  styleNo?: string;
  styleName?: string;
  styleCover?: string;
  returnConfirmed?: boolean;
  returnQuantity?: number;
  returnConfirmerId?: string;
  returnConfirmerName?: string;
  returnConfirmTime?: string;
  evidenceImageUrls?: string;  // 回料确认凭证图片，多个URL逗号分隔
  status: 'pending' | 'received' | 'partial' | 'awaiting_confirm' | 'completed' | 'cancelled';
  createTime?: string;
  updateTime?: string;
  // 到货日期字段
  expectedArrivalDate?: string;
  expectedShipDate?: string;
  actualArrivalDate?: string;
  // 采购来源字段
  sourceType?: 'order' | 'sample';  // order=生产订单, sample=样衣开发
  patternProductionId?: string;     // 样衣生产ID
  // 生产方信息（从关联生产订单富化）
  factoryName?: string;
  factoryType?: 'INTERNAL' | 'EXTERNAL';
  orderBizType?: string;  // 下单类型: CMT / FOB / ODM / OEM
  // 颜色/尺码/成分/规格（从物料资料库或样衣同步）
  color?: string;
  size?: string;
  fabricComposition?: string;
  fabricWidth?: string;   // 面料幅宽（从物料资料库同步）
  fabricWeight?: string;  // 面料克重（从物料资料库同步）
  // 发票/单据图片URL列表（JSON数组字符串），用于财务留底
  invoiceUrls?: string;
  // 初审工作流（内部采购专属）
  auditStatus?: 'pending_audit' | 'passed' | 'rejected';
  auditReason?: string;
  auditTime?: string;
  auditOperatorId?: string;
  auditOperatorName?: string;
  isOrphan?: boolean;  // 孤儿单：父订单已被删除（由后端 enrichRecord 填充）
}

export interface MaterialQueryParams {
  purchaseNo?: string;
  materialCode?: string;
  materialName?: string;
  orderNo?: string;
  supplier?: string;
  materialType?: string;
  status?: string;
  sourceType?: 'order' | 'sample' | 'batch' | '';  // 采购来源: order=生产订单, sample=样衣开发, batch=批量采购
  factoryType?: 'INTERNAL' | 'EXTERNAL' | '';
  orgUnitId?: string;
  page: number;
  pageSize: number;
}

// 面辅料数据库类型
export interface MaterialDatabase extends Record<string, unknown> {
  id?: string;
  materialCode: string;
  materialName: string;
  styleNo?: string;
  materialType:
  | 'fabric'
  | 'fabricA'
  | 'fabricB'
  | 'fabricC'
  | 'fabricD'
  | 'fabricE'
  | 'lining'
  | 'liningA'
  | 'liningB'
  | 'liningC'
  | 'liningD'
  | 'liningE'
  | 'accessory'
  | 'accessoryA'
  | 'accessoryB'
  | 'accessoryC'
  | 'accessoryD'
  | 'accessoryE';
  color?: string;
  fabricWidth?: string;
  fabricWeight?: string;
  fabricComposition?: string;
  specifications?: string;
  unit?: string;
  supplierName?: string;
  unitPrice?: number;
  conversionRate?: number;
  description?: string;
  image?: string;
  remark?: string;
  status?: 'pending' | 'completed';
  disabled?: number;
  completedTime?: string;
  createTime?: string;
  updateTime?: string;
}

// 面辅料数据库查询参数
export interface MaterialDatabaseQueryParams {
  keyword?: string;
  materialCode?: string;
  materialName?: string;
  materialType?: string;
  supplierName?: string;
  styleNo?: string;
  disabled?: number;
  page: number;
  pageSize: number;
}
