/**
 * 小云统一事件处理器 — 接收后端 EnhancedStreamingCallback 推送的所有事件类型。
 *
 * 新增事件类型（在原有 thinking/tool_call/tool_result/answer/done 基础上）：
 *   step_progress  → 步骤进度（当前第几步/总几步）
 *   tool_executing → 工具执行中动画（图标+消息）
 *   data_card      → 结构化数据卡片（图表/操作卡/报表）
 *   time_budget    → 时间预算（已用/剩余）
 *   xiaoyun_mood   → 小云表情切换（思考/搜索/计算/开心/警告/完成）
 *
 * 使用方式：
 *   import { createXiaoyunHandler } from './xiaoyunUnifiedHandler';
 *   const handler = createXiaoyunHandler(callbacks);
 *   // 在 SSE 事件循环中调用 handler(eventType, data)
 */

// ===== 类型定义 =====

export interface StepProgressEvent {
  step: number;
  total: number;
  phase: 'route' | 'tool_select' | 'tool_exec' | 'critic' | 'answer';
  message: string;
  elapsedMs: number;
}

export interface ToolExecutingEvent {
  tool: string;
  icon: string;
  message: string;
  parallel: number;
  elapsedMs: number;
}

export interface DataCardEvent {
  type: 'chart' | 'action_card' | 'insight_card' | 'step_wizard' | 'report' | 'order_card' | 'factory_card';
  title: string;
  data: any;
  elapsedMs: number;
}

export interface TimeBudgetEvent {
  elapsedMs: number;
  remainingMs: number;
  timeoutMs: number;
}

export type XiaoyunMood = 'thinking' | 'searching' | 'calculating' | 'happy' | 'warning' | 'done';

export interface XiaoyunMoodEvent {
  mood: XiaoyunMood;
  message: string;
  elapsedMs: number;
}

export interface XiaoyunCallbacks {
  onStepProgress?: (e: StepProgressEvent) => void;
  onToolExecuting?: (e: ToolExecutingEvent) => void;
  onDataCard?: (e: DataCardEvent) => void;
  onTimeBudget?: (e: TimeBudgetEvent) => void;
  onXiaoyunMood?: (e: XiaoyunMoodEvent) => void;
  /** 原有事件 */
  onThinking?: (message: string) => void;
  onToolCall?: (tool: string, args: string) => void;
  onToolResult?: (tool: string, success: boolean, summary: string) => void;
  onAnswerChunk?: (chunk: string) => void;
  onAnswer?: (content: string) => void;
  onFollowUpActions?: (actions: any[]) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
}

// ===== 小云表情图标映射 =====

const MOOD_ICONS: Record<XiaoyunMood, string> = {
  thinking: '💭',
  searching: '🔍',
  calculating: '🧮',
  happy: '😊',
  warning: '⚠️',
  done: '✨',
};

const MOOD_MESSAGES: Record<XiaoyunMood, string> = {
  thinking: '小云正在思考...',
  searching: '小云正在查询数据...',
  calculating: '小云正在分析...',
  happy: '查询完成！',
  warning: '遇到了点小问题',
  done: '回答已生成',
};

// ===== 事件处理器工厂 =====

export function createXiaoyunHandler(callbacks: XiaoyunCallbacks) {
  const _moodIcons = { ...MOOD_ICONS };
  const _moodMessages = { ...MOOD_MESSAGES };

  return function handleEvent(eventType: string, rawData: string): void {
    try {
      const data = rawData ? JSON.parse(rawData) : {};

      switch (eventType) {
        // ===== 新增事件 =====
        case 'step_progress':
          callbacks.onStepProgress?.(data as StepProgressEvent);
          break;

        case 'tool_executing':
          callbacks.onToolExecuting?.(data as ToolExecutingEvent);
          break;

        case 'data_card':
          callbacks.onDataCard?.(data as DataCardEvent);
          break;

        case 'time_budget':
          callbacks.onTimeBudget?.(data as TimeBudgetEvent);
          break;

        case 'xiaoyun_mood':
          callbacks.onXiaoyunMood?.(data as XiaoyunMoodEvent);
          break;

        // ===== 原有事件（兼容） =====
        case 'thinking':
          callbacks.onThinking?.(data?.message || data?.content || '');
          break;

        case 'tool_call':
          callbacks.onToolCall?.(data?.tool || '', data?.arguments || '');
          break;

        case 'tool_result':
          callbacks.onToolResult?.(
            data?.tool || '',
            data?.success !== false,
            data?.summary || ''
          );
          break;

        case 'answer_chunk':
          callbacks.onAnswerChunk?.(data?.chunk || '');
          break;

        case 'answer':
          callbacks.onAnswer?.(data?.content || '');
          break;

        case 'follow_up_actions':
          callbacks.onFollowUpActions?.(data?.actions || []);
          break;

        case 'error':
          callbacks.onError?.(data?.message || '未知错误');
          break;

        case 'token_budget_exceeded':
          callbacks.onError?.(data?.message || '今天的回答次数已消耗完成，请明天再来或联系管理员调整额度');
          break;

        case 'max_iterations_exceeded':
          callbacks.onError?.(data?.message || '当前问题较复杂，小云已尽力分析，请尝试分步提问');
          break;

        case 'done':
          callbacks.onDone?.();
          break;
      }
    } catch (e) {
      console.warn('[小云] 事件解析失败:', eventType, e);
    }
  };
}

// ===== 辅助函数 =====

/**
 * 自定义小云表情图标
 */
export function customizeMoodIcons(icons: Partial<Record<XiaoyunMood, string>>): void {
  Object.assign(MOOD_ICONS, icons);
}

/**
 * 自定义小云表情文案
 */
export function customizeMoodMessages(messages: Partial<Record<XiaoyunMood, string>>): void {
  Object.assign(MOOD_MESSAGES, messages);
}

/**
 * 获取小云表情图标
 */
export function getMoodIcon(mood: XiaoyunMood): string {
  return MOOD_ICONS[mood] || '🤔';
}

/**
 * 获取小云表情文案
 */
export function getMoodMessage(mood: XiaoyunMood): string {
  return MOOD_MESSAGES[mood] || '处理中...';
}

/**
 * 格式化耗时
 */
export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}
