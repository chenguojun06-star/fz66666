/**
 * 备注与系统操作日志分离工具
 *
 * 背景：历史上系统操作日志被追加进实体 remarks 字段
 * （格式 [yyyy-MM-dd HH:mm:ss] 操作人 动作：详情），污染备注输入框。
 * 本工具在回填备注输入框 / 展示备注时剥离日志行，输入框只保留人工备注。
 * 数据操作日志统一走 t_operation_log / 订单操作时间线，不再进 remarks 列。
 */

/** 系统操作日志行：行首时间戳 [yyyy-MM-dd HH:mm:ss] */
export const SYSTEM_LOG_LINE_RE = /^\s*\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?\]/;

/** AI 巡检行（只读展示，不进输入框，保存时随人工备注写回以保留记录） */
export const AI_PATROL_LINE_RE = /^\[AI巡检\]/;

export interface SplitRemarkResult {
  /** 系统操作日志行（只读展示或忽略，绝不进备注输入框） */
  systemLogs: string[];
  /** AI 巡检行（只读展示，不进输入框） */
  aiLogs: string[];
  /** 人工备注（进输入框） */
  text: string;
}

/** 按行拆分备注：系统日志 / AI巡检 / 人工备注 */
export function splitRemarkAndLogs(remark?: string | null): SplitRemarkResult {
  const raw = (remark || '').split('\n');
  const systemLogs: string[] = [];
  const aiLogs: string[] = [];
  const userLines: string[] = [];
  for (const line of raw) {
    if (SYSTEM_LOG_LINE_RE.test(line)) {
      systemLogs.push(line);
    } else if (AI_PATROL_LINE_RE.test(line)) {
      aiLogs.push(line);
    } else if (line.trim()) {
      userLines.push(line);
    }
  }
  return { systemLogs, aiLogs, text: userLines.join('\n') };
}

/** 过滤后的备注（仅人工备注 + AI巡检行，不含系统日志）——用于回填输入框与保存写回 */
export function cleanRemark(remark?: string | null): string {
  const { aiLogs, text } = splitRemarkAndLogs(remark);
  const parts: string[] = [];
  if (text.trim()) parts.push(text.trim());
  if (aiLogs.length) parts.push(aiLogs.join('\n'));
  return parts.join('\n');
}
