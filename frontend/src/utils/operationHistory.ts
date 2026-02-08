export interface OperationHistoryRow {
  type: string;
  stageName: string;
  processName: string;
  operatorName: string;
  quantity: string;
  time: string;
  remark: string;
}

interface BuildListHistoryArgs {
  records: any[];
  activeStageKeys: string[];
  childProcessesByStage: Record<string, any[]>;
  nodeOperations?: Record<string, any> | null;
  formatDateTime: (value?: string) => string;
  matchStageKey: (progressStage: string, processName: string) => string;
  stageNameMap?: Record<string, string>;
}

const defaultStageNameMap: Record<string, string> = {
  procurement: '采购',
  cutting: '裁剪',
  carSewing: '车缝',
  secondaryProcess: '二次工艺',
  tailProcess: '尾部',
  warehousing: '入库',
};

export const buildHistoryRowsForList = (args: BuildListHistoryArgs): OperationHistoryRow[] => {
  const {
    records,
    activeStageKeys,
    childProcessesByStage,
    nodeOperations,
    formatDateTime,
    matchStageKey,
    stageNameMap = defaultStageNameMap,
  } = args;

  const rows: OperationHistoryRow[] = [];

  const normalizeProcessName = (r: any) => String(r?.processName || r?.progressStage || '').trim();
  const normalizeStageKey = (r: any) => matchStageKey(String(r?.progressStage || ''), normalizeProcessName(r));

  const uniqueProcessNamesByStage: Record<string, string[]> = {};
  activeStageKeys.forEach((key) => {
    uniqueProcessNamesByStage[key] = Array.from(
      new Set(
        (childProcessesByStage[key] || [])
          .map((p: any) => String(p?.name || '').trim())
          .filter(Boolean)
      )
    );
  });

  activeStageKeys.forEach((stageKey) => {
    const processNames = uniqueProcessNamesByStage[stageKey] || [];
    processNames.forEach((processName) => {
      const matched = records.filter((r: any) => {
        if (normalizeStageKey(r) !== stageKey) return false;
        return normalizeProcessName(r) === processName;
      });
      if (matched.length === 0) return;

      const sorted = [...matched].sort((a, b) => {
        const ta = new Date(a.scanTime || a.createTime || 0).getTime();
        const tb = new Date(b.scanTime || b.createTime || 0).getTime();
        return ta - tb;
      });
      const first = sorted[0];
      // 聚合所有唯一操作人名称
      const uniqueOperators = new Set<string>();
      for (const r of sorted) {
        const name = String(r?.operatorName || r?.actualOperatorName || '').trim();
        if (name) uniqueOperators.add(name);
      }
      const operatorName = uniqueOperators.size > 0 ? Array.from(uniqueOperators).join(', ') : '-';
      const totalQty = sorted
        .reduce((sum, r) => sum + (Number(r?.quantity) || 0), 0);
      rows.push({
        type: '扫码',
        stageName: stageNameMap[stageKey] || stageKey,
        processName,
        operatorName,
        quantity: totalQty > 0 ? `${totalQty}` : '0',
        time: first?.scanTime || first?.createTime ? formatDateTime(first?.scanTime || first?.createTime) : '-',
        remark: '',
      });
    });
  });

  if (nodeOperations && typeof nodeOperations === 'object') {
    Object.entries(nodeOperations).forEach(([key, value]) => {
      if (!value) return;
      const text = String(value);
      const stageNameMatch = /工序\[(.*?)\]/.exec(text);
      const operatorMatch = /操作人\[(.*?)\]/.exec(text);
      const timeMatch = /操作时间\[(.*?)\]/.exec(text);
      const stageName = stageNameMatch?.[1] || stageNameMap[key] || key;
      if (activeStageKeys.length > 0 && !activeStageKeys.some((k) => stageNameMap[k] === stageName || k === key)) {
        return;
      }
      rows.push({
        type: '委派',
        stageName,
        processName: '-'.toString(),
        operatorName: operatorMatch?.[1] || '-',
        quantity: '-',
        time: timeMatch?.[1] || '-',
        remark: text,
      });
    });
  }

  return rows;
};
