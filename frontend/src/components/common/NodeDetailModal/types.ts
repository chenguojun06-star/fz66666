/** 节点类型定义 */
export type NodeType = 'procurement' | 'cutting' | 'sewing' | 'ironing' | 'quality' | 'packaging' | 'secondaryProcess';

/** 历史记录项 */
export interface HistoryItem {
  time: string;
  operatorName: string;
  action: string; // 'create' | 'update' | 'clear'
  changes?: string; // 修改内容描述
}

/** 单个节点的操作数据 */
export interface NodeOperationData {
  assignee?: string;
  assigneeId?: string;
  assigneeQuantity?: number;
  receiveTime?: string;
  completeTime?: string;
  delegateType?: 'factory' | 'person';
  delegateFactoryId?: string;
  delegateFactoryName?: string;
  delegatePrice?: number;
  delegateProcessName?: string;
  processType?: string;
  remark?: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByName?: string;
  history?: HistoryItem[];
}

/** 所有节点操作数据 */
export type NodeOperations = Partial<Record<NodeType, NodeOperationData>>;

/** 工厂信息 */
export interface Factory {
  id: string;
  factoryName: string;
}

/** 节点统计信息 */
export interface NodeStats {
  done: number;
  total: number;
  percent: number;
  remaining: number;
}

/** 扫码记录 */
export interface ScanRecord {
  id: string;
  scanCode?: string;
  orderNo?: string;
  styleNo?: string;
  color?: string;
  size?: string;
  quantity?: number;
  unitPrice?: number;
  processName?: string;
  progressStage?: string;
  operatorId?: string;
  operatorName?: string;
  scanTime?: string;
  cuttingBundleNo?: number;
  cuttingBundleQrCode?: string;
}

/** 菲号（裁剪扎号）记录 */
export interface BundleRecord {
  id: string;
  bundleNo?: number;
  color?: string;
  size?: string;
  quantity?: number;
  qrCode?: string;
  status?: string;
  completed?: boolean;
  completedQty?: number;
}

/** 操作员汇总 */
export interface OperatorSummary {
  operatorId: string;
  operatorName: string;
  totalQty: number;
  scanCount: number;
  lastScanTime?: string;
}

/** 工序单价项 */
export interface ProcessPriceItem {
  id?: string;
  processCode?: string;
  code?: string;
  name: string;
  processName?: string;
  unitPrice?: number;
  quantity?: number;
  completedQuantity?: number;
  estimatedMinutes?: number;
}

/** 组件属性 */
export interface NodeDetailModalProps {
  visible: boolean;
  onClose: () => void;
  orderId?: string;
  orderNo?: string;
  nodeType: string;
  nodeName: string;
  stats?: NodeStats;
  unitPrice?: number;
  /** 该节点下的所有子工序列表（含单价） */
  processList?: ProcessPriceItem[];
  /** 款号（用于工序名称匹配上下文） */
  styleNo?: string;
  /** 是否是样板生产（样板生产不显示菲号明细、扫码记录等） */
  isPatternProduction?: boolean;
  /** 额外数据（如采购进度信息、时间节点等） */
  extraData?: {
    procurementProgress?: {
      total: number;
      completed: number;
      percent: number;
      completedTime?: string;
      receiver?: string;
    };
    // 时间节点信息
    releaseTime?: string;
    deliveryTime?: string;
    receiveTime?: string;
    completeTime?: string;
    // 人员信息
    patternMaker?: string;
    receiver?: string;
  };
  onSaved?: () => void;
}
