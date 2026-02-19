/**
 * 业务规则常量
 */

// 物料到货率阈值（百分比），低于此值警告
export const MATERIAL_ARRIVAL_RATE_THRESHOLD = 50;

// 备注最小长度
export const REMARK_MIN_LENGTH = 10;

// 物料采购状态
export const MATERIAL_PURCHASE_STATUS = {
  PENDING: 'pending',
  RECEIVED: 'received',
  PARTIAL: 'partial',
  PARTIAL_ARRIVAL: 'partial_arrival',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

// 物料类型
export const MATERIAL_TYPES = {
  FABRIC: 'fabric',
  LINING: 'lining',
  ACCESSORY: 'accessory',
} as const;

// 分页默认大小
export const DEFAULT_PAGE_SIZE = 10;

// 轮询间隔 (ms)
export const POLLING_INTERVAL = 30000;

// 上传文件大小限制 (bytes)
export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB
