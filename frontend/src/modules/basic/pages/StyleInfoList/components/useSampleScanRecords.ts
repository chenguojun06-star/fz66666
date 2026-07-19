import { useCallback, useState } from 'react';
import api from '@/utils/api';

export interface ScanRecord {
  id: string;
  patternProductionId: string;
  operationType: string;
  processName: string;
  operatorId: string;
  operatorName: string;
  operatorRole: string;
  warehouseCode: string;
  remark: string;
  scanTime: string | null;
  /** P1 修复：单价（元/件），后端 PatternScanRecord.unitPrice 透出 */
  unitPrice?: number | null;
  /** P1 修复：扫码工资（= unitPrice × quantity），后端 PatternScanRecord.scanCost 透出 */
  scanCost?: number | null;
  /** 数量（部分接口返回） */
  quantity?: number | null;
}

const STAGE_KEY_MAP: Record<string, string[]> = {
  procurement: ['采购', 'PROCUREMENT', 'procurement', '采购完成'],
  cutting: ['裁剪', 'CUTTING', 'cutting', '裁剪完成'],
  secondary: ['二次工艺', '绣花', '印花', '洗水', '染色', 'SECONDARY', 'secondary', '二次工艺完成'],
  sewing: ['车缝', 'SEWING', 'sewing', '车缝完成'],
  tail: ['尾部', '整烫', '包装', 'TAIL', 'tail', '尾部完成'],
  warehousing: ['入库', 'WAREHOUSE_IN', 'WAREHOUSE_OUT', 'warehousing', '入库完成', '出库'],
};

function matchesStage(processName: string | null | undefined, stageKey: string): boolean {
  if (!processName) return false;
  const keywords = STAGE_KEY_MAP[stageKey] || [];
  const lower = processName.toLowerCase();
  return keywords.some(k => lower.includes(k.toLowerCase()));
}

export interface UseSampleScanRecordsReturn {
  scanRecords: ScanRecord[];
  scanRecordsLoading: boolean;
  loadScanRecords: (patternProductionId: string) => Promise<void>;
  getFilteredRecords: (stageKey: string | undefined) => ScanRecord[];
  undoScanRecord: (patternId: string, scanRecordId: string) => Promise<string>;
  assignPattern: (patternId: string, assignee: string) => Promise<string>;
}

export default function useSampleScanRecords(): UseSampleScanRecordsReturn {
  const [scanRecords, setScanRecords] = useState<ScanRecord[]>([]);
  const [scanRecordsLoading, setScanRecordsLoading] = useState(false);

  const loadScanRecords = useCallback(async (patternProductionId: string) => {
    setScanRecordsLoading(true);
    try {
      const res: any = await api.get(`/production/pattern/${patternProductionId}/scan-records`);
      const data = Array.isArray(res?.data) ? res.data : [];
      setScanRecords(data as ScanRecord[]);
    } catch {
      setScanRecords([]);
    } finally {
      setScanRecordsLoading(false);
    }
  }, []);

  const getFilteredRecords = useCallback((stageKey: string | undefined): ScanRecord[] => {
    if (!stageKey || stageKey === 'all') return scanRecords;
    return scanRecords.filter(r => matchesStage(r.processName, stageKey));
  }, [scanRecords]);

  const undoScanRecord = useCallback(async (patternId: string, scanRecordId: string) => {
    await api.delete(`/production/pattern/${patternId}/scan-records/${scanRecordId}`);
    setScanRecords(prev => prev.filter(r => r.id !== scanRecordId));
    return '已撤销';
  }, []);

  const assignPattern = useCallback(async (patternId: string, assignee: string) => {
    await api.put(`/production/pattern/${patternId}/assignee`, { assignee });
    return '指派成功';
  }, []);

  return {
    scanRecords,
    scanRecordsLoading,
    loadScanRecords,
    getFilteredRecords,
    undoScanRecord,
    assignPattern,
  };
}
