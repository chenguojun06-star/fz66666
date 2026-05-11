// 样衣开发模块类型定义

export interface StyleInfo extends Record<string, unknown> {
  id?: string | number;
  styleNo: string;
  skc?: string;
  skuMode?: 'AUTO' | 'MANUAL';
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
  deliveryDate?: string;
  cover?: string;
  status?: 'ENABLED' | 'DISABLED' | 'SCRAPPED' | string;
  createTime?: string;
  updateTime?: string;
  deleteFlag?: number;

  progressNode?: string;
  completedTime?: string;
  latestOrderNo?: string;
  latestOrderStatus?: string;
  latestProductionProgress?: number;
  latestPatternStatus?: string;

  patternStatus?: string;
  patternStartTime?: string;
  patternCompletedTime?: string;
  sampleStatus?: string;
  sampleProgress?: number;
  sampleStartTime?: string;
  sampleCompletedTime?: string;
  developmentSourceType?: 'SELF_DEVELOPED' | 'SELECTION_CENTER' | string;
  developmentSourceDetail?: string;

  maintenanceTime?: string;
  maintenanceMan?: string;
  maintenanceRemark?: string;

  orderCount?: number;
  totalOrderQuantity?: number;
  latestOrderTime?: string;
  latestOrderCreator?: string;
  firstOrderTime?: string;
  scrapQuantity?: number;
  totalWarehousedQuantity?: number;
  pushedToOrder?: number | boolean;
  pushedToOrderTime?: string;

  // 码数颜色配置（JSON字符串）
  sizeColorConfig?: string;

  // 洗水唛 / 标签字段
  fabricComposition?: string;
  /** 多部位面料成分（JSON），格式：[{part, materials}]，用于两件套/拼接款 */
  fabricCompositionParts?: string;
  washInstructions?: string;
  uCode?: string;
  washTempCode?: string;
  bleachCode?: string;
  tumbleDryCode?: string;
  ironCode?: string;
  dryCleanCode?: string;
  /** 洗涤护理图标代码（JSON数组），格式：["wash_W30","bleach_NO"]，优先于旧5字段 */
  careIconCodes?: string;

  // 退回编辑锁定字段
  descriptionLocked?: number;
  descriptionReturnComment?: string;
  descriptionReturnBy?: string;
  descriptionReturnTime?: string;
  patternRevLocked?: number;
  patternRevReturnComment?: string;
  patternRevReturnBy?: string;
  patternRevReturnTime?: string;
}

export interface StyleBom extends Record<string, unknown> {
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
  /** 分组名称（如：上衣、裤子、亲子装-大人款、亲子装-儿童款） */
  groupName?: string;
  fabricComposition?: string;
  color: string;
  specification?: string;
  size: string;
  unit: string;
  /** 开发用量（开发阶段预估用量，输入后自动带入单件用量） */
  devUsageAmount?: number;
  usageAmount: number;
  /** 纸样各码实际用量（JSON，格式：{"S":1.5,"M":1.6}；为空则用统一 usageAmount） */
  sizeUsageMap?: string;
  /** 纸样录入各码实际用量（原始单位） */
  patternSizeUsageMap?: string;
  /** 各码规格尺寸（JSON，常用于拉链长度cm） */
  sizeSpecMap?: string;
  /** 纸样录入单位 */
  patternUnit?: string;
  /** 米重换算值：每公斤对应的米数（米/公斤） */
  conversionRate?: number;
  lossRate: number;
  unitPrice?: number;
  totalPrice?: number;
  supplier: string; // 保留向后兼容
  supplierId?: string; // 供应商ID（关联t_factory）
  supplierContactPerson?: string; // 供应商联系人
  supplierContactPhone?: string; // 供应商联系电话
  remark?: string;

  /** 关联的面辅料档案 ID（MaterialStock.materialId，用于领料/库存扣减） */
  materialId?: string;
  fabricWidth?: string;    // 门幅
  fabricWeight?: string;   // 克重

  // 库存检查字段
  stockStatus?: 'sufficient' | 'insufficient' | 'none' | 'unchecked';
  availableStock?: number;
  requiredPurchase?: number;
  /** 物料图片URLs（JSON数组字符串，自动从面辅料资料带出，也可手动上传） */
  imageUrls?: string;
}

export interface StyleSize extends Record<string, unknown> {
  id?: string | number;
  styleId: string | number;
  sizeName: string;
  partName: string;
  groupName?: string;
  measureMethod?: string;
  baseSize?: string;
  standardValue: number;
  tolerance: number;
  sort: number;
  /** 部位参考图片URLs（JSON数组字符串） */
  imageUrls?: string;
  gradingRule?: string;
}

export interface StyleProcess extends Record<string, unknown> {
  id?: string | number;
  styleId: string | number;
  processCode: string;
  processName: string;
  progressStage?: string; // 进度节点：采购/裁剪/车缝/尾部/入库
  machineType: string;
  difficulty?: string; // 工序难度：易/中/难
  description?: string; // 工序描述
  standardTime: number;
  price: number;
  rateMultiplier?: number | null; // 工序倍率，null 或 1 表示不参与倍率计算
  sortOrder: number;
}

export interface StyleQuotation extends Record<string, unknown> {
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
  standardMaterialCost?: number;
  standardProcessCost?: number;
  standardOtherCost?: number;
  materialVariance?: number;
  processVariance?: number;
  totalVariance?: number;
  varianceRate?: number;
  overheadAllocationRate?: number;
  allocatedOverheadCost?: number;
}

export interface StyleAttachment extends Record<string, unknown> {
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
  claimTime?: string;
  completeTime?: string;
  claimUser?: string;
}

export interface StyleQueryParams {
  styleNo?: string;
  styleNoExact?: string;
  styleName?: string;
  category?: string;
  keyword?: string;
  onlyCompleted?: boolean | number;
  pushedToOrderOnly?: boolean | number;
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
  styleCoverUrl?: string | null;
}

/** 样衣开发工作台可切换的 Tab 段落 */
export type WorkbenchSection = 'bom' | 'pattern' | 'size' | 'process' | 'sizePrice' | 'secondary' | 'production' | 'quotation' | 'files';

export interface ProductSku {
  id?: number;
  skuCode: string;
  styleId?: number;
  styleNo?: string;
  color: string;
  size: string;
  barcode?: string;
  externalSkuId?: string;
  externalPlatform?: string;
  costPrice?: number;
  salesPrice?: number;
  stockQuantity?: number;
  status?: string;
  skuMode?: 'AUTO' | 'MANUAL';
  manuallyEdited?: number;
  remark?: string;
  createTime?: string;
  updateTime?: string;
  tenantId?: number;
  version?: number;
}
