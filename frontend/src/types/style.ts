// 样衣开发模块类型定义

export interface StyleInfo {
  id?: string | number;
  styleNo: string;
  styleName: string;
  category: string;
  price: number;
  cycle: number;
  description?: string;
  year?: number;
  month?: number;
  season?: string;
  color?: string;
  size?: string;
  sampleQuantity?: number;
  cover?: string;
  status?: string;
  createTime?: string;
  updateTime?: string;
  deleteFlag?: number;

  progressNode?: string;
  completedTime?: string;
  latestOrderNo?: string;
  latestOrderStatus?: string;
  latestProductionProgress?: number;

  patternStatus?: string;
  patternStartTime?: string;
  patternCompletedTime?: string;
  sampleStatus?: string;
  sampleProgress?: number;
  sampleCompletedTime?: string;

  maintenanceTime?: string;
  maintenanceMan?: string;
  maintenanceRemark?: string;

  orderCount?: number;
  latestOrderTime?: string;
  latestOrderCreator?: string;
  firstOrderTime?: string;

  // 码数颜色配置（JSON字符串）
  sizeColorConfig?: string;
}

export interface StyleBom {
  id?: string | number;
  styleId: string | number;
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
  materialCode: string;
  materialName: string;
  color: string;
  specification?: string;
  size: string;
  unit: string;
  usageAmount: number;
  lossRate: number;
  unitPrice?: number;
  totalPrice?: number;
  supplier: string;
  remark?: string;

  // 库存检查字段
  stockStatus?: 'sufficient' | 'insufficient' | 'none' | 'unchecked';
  availableStock?: number;
  requiredPurchase?: number;
}

export interface StyleSize {
  id?: string | number;
  styleId: string | number;
  sizeName: string;
  partName: string;
  measureMethod?: string;
  standardValue: number;
  tolerance: number;
  sort: number;
}

export interface StyleProcess {
  id?: string | number;
  styleId: string | number;
  processCode: string;
  processName: string;
  progressStage?: string; // 进度节点：采购/裁剪/车缝/尾部/入库
  machineType: string;
  standardTime: number;
  price: number;
  sortOrder: number;
}

export interface StyleQuotation {
  id?: string | number;
  styleId: string | number;
  materialCost: number;
  processCost: number;
  otherCost: number;
  profitRate: number;
  totalCost: number;
  totalPrice: number;
  currency?: string;
  version?: string;
}

export interface StyleAttachment {
  id?: string | number;
  styleId: string | number;
  fileName: string;
  fileUrl: string;
  fileType: string;
  bizType?: string;
  fileSize: number;
  uploader: string;
  createTime: string;
  version?: number;
  status?: 'active' | 'archived';
}

export interface StyleQueryParams {
  styleNo?: string;
  styleName?: string;
  category?: string;
  keyword?: string;
  onlyCompleted?: boolean | number;
  progressNode?: string;
  page: number;
  pageSize: number;
}

export interface TemplateLibrary {
  id?: string;
  templateType: string;
  templateKey: string;
  templateName: string;
  sourceStyleNo?: string | null;
  templateContent: string;
  locked?: number;
  createTime?: string;
  updateTime?: string;
  operatorName?: string;
}
