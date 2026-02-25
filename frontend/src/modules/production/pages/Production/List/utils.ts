
import { ProductionOrder } from '@/types/production';
import { formatDateTime } from '@/utils/datetime';

/**
 * 安全字符串转换
 */
export const safeString = (value: any, defaultValue: string = '-') => {
  const str = String(value || '').trim();
  return str || defaultValue;
};

/**
 * 获取状态文本和标签颜色
 */
export const getStatusConfig = (status: ProductionOrder['status'] | string | undefined | null) => {
  const statusMap: Record<string, { text: string; color: string }> = {
    pending: { text: '待生产', color: 'default' },
    production: { text: '生产中', color: 'success' },
    completed: { text: '已完成', color: 'default' },
    delayed: { text: '已逾期', color: 'warning' },
    cancelled: { text: '已取消', color: 'error' },
    canceled: { text: '已取消', color: 'error' },
    paused: { text: '已暂停', color: 'default' },
    returned: { text: '已退回', color: 'error' },
  };
  const key = safeString(status, '');
  return statusMap[key] || { text: '未知', color: 'default' };
};

/**
 * 获取关单最低要求数量（裁剪数量的90%）
 */
export const getCloseMinRequired = (cuttingQuantity: number) => {
  const cq = Number(cuttingQuantity ?? 0);
  if (!Number.isFinite(cq) || cq <= 0) return 0;
  return Math.ceil(cq * 0.9);
};

/**
 * 格式化完成时间
 */
export const formatCompletionTime = (timeStr: string) => {
  if (!timeStr) return '';
  try {
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${mm}-${dd} ${hh}:${mi}`;
  } catch { return ''; }
};

// === CSV 导出工具 ===

export const formatCsvCell = (value: unknown) => {
  const v = value == null ? '' : String(value);
  const escaped = v.replace(/"/g, '""');
  return `"${escaped}"`;
};

export const downloadTextFile = (filename: string, content: string) => {
  const blob = new Blob(["\uFEFF", content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const buildOrdersCsv = (rows: ProductionOrder[]) => {
  const headers = [
    '订单号', '款号', '款名', '加工厂', '订单数量', '下单人', '下单时间',
    '采购时间', '采购完成', '采购员', '采购完成率',
    '裁剪时间', '裁剪完成', '裁剪员', '裁剪完成率',
    '缝制开始', '缝制完成', '缝制完成率',
    '质检时间', '质检完成', '质检员', '质检完成率',
    '入库时间', '入库完成', '入库员', '入库完成率',
    '生产进度', '状态',
  ];

  const lines = [headers.map(formatCsvCell).join(',')];
  for (const r of rows) {
    const line = [
      r.orderNo, r.styleNo, r.styleName, r.factoryName, r.orderQuantity,
      (r as any).orderOperatorName || '',
      formatDateTime((r as any).createTime),
      formatDateTime((r as any).procurementStartTime),
      formatDateTime((r as any).procurementEndTime),
      (r as any).procurementOperatorName || '',
      (r as any).procurementCompletionRate == null ? '' : `${(r as any).procurementCompletionRate}%`,
      formatDateTime((r as any).cuttingStartTime),
      formatDateTime((r as any).cuttingEndTime),
      (r as any).cuttingOperatorName || '',
      (r as any).cuttingCompletionRate == null ? '' : `${(r as any).cuttingCompletionRate}%`,
      formatDateTime((r as any).sewingStartTime),
      formatDateTime((r as any).sewingEndTime),
      (r as any).sewingCompletionRate == null ? '' : `${(r as any).sewingCompletionRate}%`,
      formatDateTime((r as any).qualityStartTime),
      formatDateTime((r as any).qualityEndTime),
      (r as any).qualityOperatorName || '',
      (r as any).qualityCompletionRate == null ? '' : `${(r as any).qualityCompletionRate}%`,
      formatDateTime((r as any).warehousingStartTime),
      formatDateTime((r as any).warehousingEndTime),
      (r as any).warehousingOperatorName || '',
      (r as any).warehousingCompletionRate == null ? '' : `${(r as any).warehousingCompletionRate}%`,
      r.productionProgress == null ? '' : `${r.productionProgress}%`,
      getStatusConfig(r.status).text,
    ].map(formatCsvCell).join(',');
    lines.push(line);
  }
  return lines.join('\n');
};

// === 主要阶段定义 ===

export const mainStages = [
  { key: 'procurement', name: '采购', color: '#1e40af', keywords: ['采购', '物料', '备料'] },
  { key: 'cutting', name: '裁剪', color: '#92400e', keywords: ['裁剪', '裁床', '开裁'] },
  { key: 'carSewing', name: '车缝', color: '#065f46', keywords: ['车缝', '缝制', '缝纫', '车工', '生产'] },
  { key: 'secondaryProcess', name: '二次工艺', color: '#5b21b6', keywords: ['二次工艺', '二次', '工艺'] },
  { key: 'tailProcess', name: '尾部', color: '#9d174d', keywords: ['尾部', '整烫', '包装', '质检', '后整', '剪线'] },
  { key: 'warehousing', name: '入库', color: '#374151', keywords: ['入库', '仓库'] },
] as const;

export const stageKeyByType: Record<string, string> = {
  procurement: 'procurement',
  cutting: 'cutting',
  carSewing: 'carSewing',
  secondaryProcess: 'secondaryProcess',
  tailProcess: 'tailProcess',
  warehousing: 'warehousing',
};

export const matchStageKey = (progressStage: string, processName: string) => {
  const text = `${progressStage || ''} ${processName || ''}`;
  for (const stage of mainStages) {
    if (stage.keywords.some(kw => text.includes(kw))) {
      return stage.key;
    }
  }
  return 'tailProcess';
};
