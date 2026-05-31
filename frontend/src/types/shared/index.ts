export interface BaseEntity {
  id?: string | number
  createdAt?: string
  updatedAt?: string
  createdBy?: string
  updatedBy?: string
  tenantId?: string | number
}

export interface ApiResult<T = unknown> {
  code: number
  data: T
  message?: string
  requestId?: string
}

export interface PageResult<T = unknown> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export interface ProductionOrder extends BaseEntity {
  orderNo: string
  styleNo: string
  styleName?: string
  factoryId: string | number
  factoryName?: string
  quantity: number
  currentProgress?: number
  currentProgressStage?: string
  status?: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED' | 'CLOSED'
  deadline?: string
  priority?: number
  remarks?: string
}

export interface OrderProgressNode {
  id: string | number
  orderId: string | number
  processName: string
  processCode: string
  progress: number
  quantity: number
  completedQuantity: number
  startedAt?: string
  completedAt?: string
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
}

export interface StyleInfo extends BaseEntity {
  styleNo: string
  styleName: string
  category?: string
  season?: string
  year?: number
  coverImage?: string
  isTemplate?: boolean
  remarks?: string
}

export interface StyleSize extends BaseEntity {
  styleId: string | number
  sizeName: string
  sizeCode?: string
  sortOrder?: number
}

export interface StyleBom extends BaseEntity {
  styleId: string | number
  materialName: string
  materialCode?: string
  unit?: string
  quantity: number
  unitPrice?: number
  category?: string
  remarks?: string
}

export interface CuttingBundle extends BaseEntity {
  orderId: string | number
  bundleNo: string
  color: string
  size: string
  quantity: number
  status: 'PENDING' | 'CUTTING' | 'COMPLETED'
  cuttingStartedAt?: string
  cuttingCompletedAt?: string
}

export interface ScanRecord extends BaseEntity {
  orderId: string | number
  orderNo?: string
  styleNo?: string
  color?: string
  size?: string
  quantity?: number
  bundleNo?: string
  scanType: 'PRODUCTION' | 'CUTTING' | 'WAREHOUSING' | 'QUALITY'
  progressStage?: string
  processName?: string
  qualityResult?: 'PASSED' | 'FAILED' | 'PENDING'
  scannerId?: string | number
  scannerName?: string
  scannedAt?: string
  qrCode?: string
  remarks?: string
}

export interface MaterialStock extends BaseEntity {
  materialCode: string
  materialName: string
  warehouseId?: string | number
  warehouseName?: string
  locationId?: string | number
  locationName?: string
  quantity: number
  unit?: string
  safetyStock?: number
  lastInboundAt?: string
  lastOutboundAt?: string
}

export interface ProductWarehousing extends BaseEntity {
  orderId: string | number
  orderNo?: string
  styleNo?: string
  warehouseId?: string | number
  warehouseName?: string
  locationId?: string | number
  locationName?: string
  quantity: number
  color?: string
  size?: string
  warehousingAt?: string
  operatorId?: string | number
  operatorName?: string
  remarks?: string
}

export interface WagePayment extends BaseEntity {
  orderId?: string | number
  orderNo?: string
  workerId?: string | number
  workerName?: string
  factoryId?: string | number
  factoryName?: string
  processName?: string
  quantity: number
  unitPrice?: number
  totalAmount?: number
  paymentStatus: 'UNPAID' | 'PAID' | 'SETTLED'
  paymentDate?: string
  remarks?: string
}

export interface Customer extends BaseEntity {
  customerName: string
  customerCode?: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  address?: string
  creditLimit?: number
  creditRating?: string
  status: 'ACTIVE' | 'INACTIVE'
  remarks?: string
}

export interface Receivable extends BaseEntity {
  customerId?: string | number
  customerName?: string
  orderId?: string | number
  orderNo?: string
  amount: number
  paidAmount?: number
  dueDate?: string
  status: 'UNPAID' | 'PARTIAL_PAID' | 'PAID' | 'OVERDUE'
  remarks?: string
}

export interface UserInfo extends BaseEntity {
  username: string
  realName?: string
  email?: string
  phone?: string
  avatar?: string
  role?: string
  factoryId?: string | number
  tenantId?: string | number
}

export interface DictItem {
  id: string | number
  dictType: string
  dictCode: string
  dictLabel: string
  sortOrder?: number
  status: 'ENABLED' | 'DISABLED'
  remark?: string
}

export interface FactoryInfo extends BaseEntity {
  factoryName: string
  factoryCode?: string
  address?: string
  contactName?: string
  contactPhone?: string
  capacity?: number
  status: 'ACTIVE' | 'INACTIVE'
  remarks?: string
}

export interface AgentChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface AiScanTip {
  orderId: string | number
  tipType: 'QUALITY' | 'PROGRESS' | 'WARNING' | 'INFO'
  message: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH'
  createdAt: string
}

export interface AiInsight {
  id: string
  type: 'SALES' | 'PRODUCTION' | 'INVENTORY' | 'QUALITY'
  title: string
  content: string
  data?: Record<string, unknown>
  timestamp: number
}

export interface AppEvent<T = unknown> {
  type: string
  data?: T
  timestamp: number
  source?: 'PC' | 'MINIPROGRAM' | 'H5' | 'BACKEND'
}

export interface OrderChangeEvent extends AppEvent<ProductionOrder> {
  type: 'order:change' | 'order:create' | 'order:update' | 'order:delete'
  changeFields?: (keyof ProductionOrder)[]
}

export interface ScanEvent extends AppEvent<ScanRecord> {
  type: 'scan:create' | 'scan:undo'
}

export interface ProgressChangeEvent extends AppEvent<{
  orderId: string | number
  progress: number
  stage: string
}> {
  type: 'progress:change'
}

export interface DataSyncEvent<T = unknown> {
  eventType: string
  entityType: string
  entityId: string
  tenantId?: string
  data?: T
  source: string
  timestamp: number
}

export interface SelectOption {
  value: string | number
  label: string
  disabled?: boolean
  extra?: Record<string, unknown>
}

export type SortOrder = 'asc' | 'desc'

export interface PageQuery {
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: SortOrder
  keyword?: string
  filters?: Record<string, unknown>
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Record<string, unknown> ? DeepPartial<T[P]> : T[P]
}
