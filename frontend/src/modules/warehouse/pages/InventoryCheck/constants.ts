export const CHECK_TYPE_MAP: Record<string, { label: string; color: string }> = {
  MATERIAL: { label: '物料盘点', color: 'processing' },
  FINISHED: { label: '成品盘点', color: 'success' },
  SAMPLE: { label: '样衣盘点', color: 'info' },
};

export const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: '待盘点', color: 'warning' },
  confirmed: { label: '已确认', color: 'success' },
  cancelled: { label: '已取消', color: 'default' },
};

export const DIFF_TYPE_MAP: Record<string, { label: string; color: string }> = {
  PROFIT: { label: '盘盈', color: 'error' },
  LOSS: { label: '盘亏', color: 'processing' },
  EQUAL: { label: '持平', color: 'success' },
};
