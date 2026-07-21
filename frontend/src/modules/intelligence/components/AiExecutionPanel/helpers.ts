/**
 * AI 智能执行面板 - 纯函数与常量
 */
import dayjs from 'dayjs';

/** AI 建议 action -> 中文标签映射 */
export const ACTION_LABEL_MAP: Record<string, string> = {
  'order:hold': '暂停订单',
  'order:expedite': '加急订单',
  'order:approve': '审核通过',
  'order:reject': '退回订单',
  'style:approve': '款式通过',
  'style:return': '退回款式',
  'quality:reject': '质检退回',
  'settlement:approve': '结算审批',
  'purchase:create': '自动采购',
  'notification:push': '推送通知'
};

/** 风险等级 -> 颜色映射（index 1-5） */
export const RISK_COLORS: string[] = ['', 'green', 'green', 'orange', 'red', 'red'];

/** 风险等级 -> 标签映射（index 1-5） */
export const RISK_LABELS: string[] = ['', '低', '低', '中', '高', '高'];

/** 命令详情抽屉中展示的预期影响列表 */
export const EXPECTED_IMPACTS: string[] = [
  '订单状态将变更为"暂停"',
  '相关工序将暂停推进',
  '财务部门将被通知评估已支付成本',
  '仓库团队将收到库存清点任务'
];

/** 根据 action 获取中文标签 */
export function getActionLabel(action: string): string {
  return ACTION_LABEL_MAP[action] || action;
}

/** 根据风险等级获取 Tag 颜色 */
export function getRiskColor(level: number): string {
  return RISK_COLORS[level] ?? '';
}

/** 根据风险等级获取标签文字 */
export function getRiskLabel(level: number): string {
  return RISK_LABELS[level] ?? String(level);
}

/** 根据创建时间计算已等待分钟数 */
export function getWaitingMinutes(createdAt: string): number {
  return dayjs().diff(dayjs(createdAt), 'minute');
}

/** 根据等待分钟数获取颜色（>60 红 / >10 橙 / 其他 绿） */
export function getWaitingColor(duration: number): string {
  if (duration > 60) return 'red';
  if (duration > 10) return 'orange';
  return 'green';
}

/** 截断文本（用于表格中长文本预览） */
export function truncateText(text: string, max = 30): string {
  if (!text) return '';
  return text.length > max ? `${text.substring(0, max)}...` : text;
}
