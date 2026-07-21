// 色卡本相关类型与常量（从 index.tsx 抽取，仅本模块内部使用）

// ===== 色卡本子项（颜色） =====
export interface ColorCardItem {
  id?: string;
  colorCardId?: string;
  colorNo: string;
  colorName?: string;
  unitPrice?: number;
  image?: string;
  remark?: string;
  sortOrder?: number;
}

// ===== 色卡本 =====
export interface ColorCard {
  id: string;
  colorCardCode: string;
  colorCardName: string;
  materialType?: string;
  fabricWidth?: string;
  specifications?: string;
  fabricWeight?: string;
  fabricComposition?: string;
  unit?: string;
  supplierId?: string;
  supplierName?: string;
  supplierContactPerson?: string;
  supplierContactPhone?: string;
  image?: string;
  remark?: string;
  status?: string;
  colorCount?: number;
  createTime?: string;
}

// ===== API 响应类型 =====
export interface ApiResult<T> {
  code: number;
  data: T;
  message?: string;
}

export interface PageResult<T> {
  records: T[];
  total: number;
}

export interface ColorCardDetail {
  items: ColorCardItem[];
}

export interface ColorCardListParams {
  keyword: string;
  page: number;
  pageSize: number;
  materialType?: string;
}

export interface RecognizedColorInfo {
  success: boolean;
  color?: { textValue?: string; rawText?: string };
  unitPrice?: { numberValue?: number };
  imageUrl?: string;
  aiHint?: string;
  errorMessage?: string;
}

export interface ImageUploadFile {
  url: string;
}

// SupplierSelect 的 option 参数类型
export interface SupplierSelectOption {
  id?: string;
  supplierId?: string;
  supplierContactPerson?: string;
  supplierContactPhone?: string;
}

// ===== 物料类型选项（筛选/表单） =====
export const MATERIAL_TYPE_OPTIONS = [
  { label: '面料', value: 'fabric' },
  { label: '里料', value: 'lining' },
  { label: '辅料', value: 'accessory' },
];
