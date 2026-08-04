/**
 * 时间线工具函数（备注日志 + 链路节点融合展示用）
 */

/** 将时间字符串/Date/number 转为时间戳（ms）；无法解析返回 0 */
export function toTs(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace('T', ' ').replace(/-/g, '/');
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

/** 截取显示时间 yyyy-MM-dd HH:mm（无法解析返回空串） */
export function displayTime(v: unknown): string {
  if (v == null) return '';
  const s = String(v).replace('T', ' ');
  return s.length >= 16 ? s.substring(0, 16) : s;
}
