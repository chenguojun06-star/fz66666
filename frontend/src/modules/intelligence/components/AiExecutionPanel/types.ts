/**
 * AI 智能执行面板 - 类型定义
 *
 * 与后端 PendingCommandItem / CommandExecuteResult 对齐（见 services/intelligence/intelligenceApi.ts）
 */

/** 待审批命令条目 */
export interface PendingCommand {
  commandId: string;
  action?: string;
  targetId?: string;
  reason?: string;
  riskLevel?: number;
  waitingFor?: string[];
  createdAt?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

/** 命令执行结果展示模型 */
export interface ExecuteResult {
  success: boolean;
  message?: string;
  data?: unknown;
  cascadedTasks?: number;
  notifiedRecipients?: string[];
  error?: unknown;
}

/** 查看命令详情回调签名 */
export type ViewDetailHandler = (command: PendingCommand) => void;
