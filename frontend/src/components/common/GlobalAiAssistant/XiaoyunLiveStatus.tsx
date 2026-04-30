/**
 * 小云实时状态组件 — 在聊天面板顶部显示小云当前状态。
 *
 * 显示内容：
 *  - 小云表情动画（思考/搜索/计算/开心/警告/完成）
 *  - 步骤进度条（当前第几步/总几步）
 *  - 工具执行指示器
 *  - 耗时显示
 *
 * 使用方式：
 *   <XiaoyunLiveStatus
 *     mood={currentMood}
 *     step={{ step: 2, total: 5, phase: 'tool_exec', message: '正在查询订单...' }}
 *     toolExecuting={{ tool: 'query_order', icon: '📦', message: '查询订单进度', parallel: 1 }}
 *     elapsedMs={3200}
 *   />
 */

import React from 'react';
import type { XiaoyunMood } from '../../services/intelligence/xiaoyunUnifiedHandler';
import { getMoodIcon, getMoodMessage, formatElapsed } from '../../services/intelligence/xiaoyunUnifiedHandler';

// ===== Props =====

export interface XiaoyunLiveStatusProps {
  /** 小云当前表情 */
  mood?: XiaoyunMood;
  /** 步骤进度 */
  step?: {
    step: number;
    total: number;
    phase: string;
    message: string;
  };
  /** 当前执行的工具 */
  toolExecuting?: {
    tool: string;
    icon?: string;
    message?: string;
    parallel?: number;
  };
  /** 已耗时 ms */
  elapsedMs?: number;
  /** 是否可见 */
  visible?: boolean;
}

// ===== 组件 =====

export const XiaoyunLiveStatus: React.FC<XiaoyunLiveStatusProps> = ({
  mood,
  step,
  toolExecuting,
  elapsedMs,
  visible = true,
}) => {
  if (!visible) return null;

  const hasContent = mood || step || toolExecuting || elapsedMs;
  if (!hasContent) return null;

  return (
    <div style={styles.container}>
      {/* 小云表情 */}
      {mood && (
        <div style={styles.moodRow}>
          <span style={styles.moodIcon}>{getMoodIcon(mood)}</span>
          <span style={styles.moodText}>{getMoodMessage(mood)}</span>
        </div>
      )}

      {/* 步骤进度条 */}
      {step && step.total > 1 && (
        <div style={styles.progressRow}>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${Math.round((step.step / step.total) * 100)}%`,
              }}
            />
          </div>
          <span style={styles.progressLabel}>
            步骤 {step.step}/{step.total}
          </span>
          {step.message && (
            <span style={styles.progressMsg}>{step.message}</span>
          )}
        </div>
      )}

      {/* 工具执行指示器 */}
      {toolExecuting && (
        <div style={styles.toolRow}>
          <span style={styles.toolIcon}>
            {toolExecuting.icon || '🔧'}
          </span>
          <span style={styles.toolName}>{toolExecuting.tool}</span>
        </div>
      )}

      {/* 耗时 */}
      {elapsedMs != null && elapsedMs > 0 && (
        <span style={styles.timer}>⏱ {formatElapsed(elapsedMs)}</span>
      )}
    </div>
  );
};

// ===== 内联样式（避免 CSS 文件依赖） =====

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '8px 12px',
    background: 'linear-gradient(135deg, #f0f5ff 0%, #e6f0ff 100%)',
    borderRadius: '12px',
    border: '1px solid #d6e4ff',
    marginBottom: '8px',
    transition: 'all 0.3s ease',
  },
  moodRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  moodIcon: {
    fontSize: '20px',
    animation: 'xiaoyun-bounce 0.6s ease-in-out infinite alternate',
  },
  moodText: {
    fontSize: '13px',
    color: '#1a1a2e',
    fontWeight: 500,
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  progressBar: {
    flex: '0 0 80px',
    height: '4px',
    background: '#d6e4ff',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #1890ff, #36cfc9)',
    borderRadius: '2px',
    transition: 'width 0.5s ease',
  },
  progressLabel: {
    fontSize: '11px',
    color: '#8c8c8c',
    minWidth: '35px',
  },
  progressMsg: {
    fontSize: '12px',
    color: '#595959',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  toolRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 8px',
    background: 'rgba(24, 144, 255, 0.06)',
    borderRadius: '6px',
  },
  toolIcon: {
    fontSize: '16px',
  },
  toolName: {
    fontSize: '12px',
    color: '#1890ff',
    fontFamily: 'monospace',
  },
  timer: {
    fontSize: '11px',
    color: '#bfbfbf',
    alignSelf: 'flex-end',
  },
};

export default XiaoyunLiveStatus;
