// ProcessKanbanDrawer 类型定义
// 抽离自原 ProcessKanbanDrawer.tsx，保持业务逻辑不变

export interface ProcessKanbanDrawerProps {
  visible: boolean;
  onClose: () => void;
  orderId?: string;
  orderNo?: string;
  styleNo?: string;
}

export interface NodeStatsItem {
  stageName: string;
  totalRecords: number;
  scannedRecords: number;
  pendingRecords: number;
  completionRate: number;
  processBreakdown: Record<string, { total: number; completed: number; pending: number }>;
}

export interface TrackingRecord {
  id: string;
  bundleNo: number;
  color?: string;
  size?: string;
  quantity: number;
  processName: string;
  processCode: string;
  processOrder?: number;
  progressStage?: string;
  scanStatus: 'pending' | 'scanned' | 'reset';
  operatorName?: string;
  scanTime?: string;
  unitPrice?: number;
  settlementAmount?: number;
  isSettled?: boolean;
  scanBlocked?: boolean;
  cuttingBundleId?: string;
  qualityStatus?: string;
  defectQuantity?: number;
  defectCategory?: string;
  defectRemark?: string;
  defectProblems?: string[];
  qualityOperatorName?: string;
  qualityTime?: string;
  repairStatus?: string;
  repairCompletedTime?: string;
}

/** 质检筛选类型 */
export type QcFilter = 'all' | 'pending' | 'unqualified' | 'repair_done';

/** 质检结果 */
export type QcResult = 'qualified' | 'unqualified';

/** 批量质检模式 */
export type BatchQcMode = false | 'qualified' | 'unqualified';
