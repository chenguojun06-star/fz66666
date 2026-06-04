export interface BaseEntity {
  id?: string | number
  createTime?: string
  updateTime?: string
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
  orderQuantity: number
  productionProgress?: number
  currentProgressStage?: string
  status: 'pending' | 'production' | 'completed' | 'delayed' | 'scrapped' | 'cancelled' | 'closed' | 'archived' | 'paused' | 'returned'
  plannedEndDate?: string
  urgencyLevel?: 'urgent' | 'normal'
  priority?: number
  operationRemark?: string
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
  status: 'pending' | 'in_progress' | 'completed'
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
  status: 'pending' | 'cutting' | 'completed'
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
  cuttingBundleNo?: number
  scanType: 'cutting' | 'production' | 'quality' | 'warehouse' | 'pattern' | 'orchestration'
  progressStage?: string
  processName?: string
  scanResult: 'success' | 'failure'
  operatorId: string
  operatorName: string
  scanTime: string
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
  operatorId?: string | number
  operatorName?: string
  factoryId?: string | number
  factoryName?: string
  processName?: string
  quantity: number
  unitPrice?: number
  totalAmount?: number
  paidAmount?: number
  remainingAmount?: number
  paymentStatus: 'unpaid' | 'partially_paid' | 'fully_paid'
  paymentTime?: string
  remarks?: string
}

export interface Customer extends BaseEntity {
  customerName: string
  customerCode?: string
  contactPerson?: string
  contactPhone?: string
  contactEmail?: string
  address?: string
  creditLimit?: number
  creditRating?: string
  status: 'active' | 'inactive'
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
  status: 'unpaid' | 'partial_paid' | 'paid' | 'overdue'
  remarks?: string
}

export interface UserInfo extends BaseEntity {
  username: string
  name?: string
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
  status: 'enabled' | 'disabled'
  remark?: string
}

export interface FactoryInfo extends BaseEntity {
  factoryName: string
  factoryCode?: string
  address?: string
  contactPerson?: string
  contactPhone?: string
  dailyCapacity?: number
  status: 'active' | 'inactive'
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
  tipType: 'quality' | 'progress' | 'warning' | 'info'
  message: string
  severity: 'low' | 'medium' | 'high'
  createdAt: string
}

export interface AiInsight {
  id: string
  type: 'sales' | 'production' | 'inventory' | 'quality'
  title: string
  content: string
  data?: Record<string, unknown>
  timestamp: number
}

export interface AppEvent<T = unknown> {
  type: string
  data?: T
  timestamp: number
  source?: 'pc' | 'miniprogram' | 'h5' | 'backend'
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
