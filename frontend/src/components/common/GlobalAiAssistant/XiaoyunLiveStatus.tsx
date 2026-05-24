import React from 'react';
import type { XiaoyunMood } from '@/services/intelligence/xiaoyunUnifiedHandler';
import { getMoodIcon, getMoodMessage, formatElapsed } from '@/services/intelligence/xiaoyunUnifiedHandler';

export interface XiaoyunLiveStatusProps {
  mood?: XiaoyunMood;
  step?: {
    step: number;
    total: number;
    phase: string;
    message: string;
  };
  toolExecuting?: {
    tool: string;
    icon?: string;
    message?: string;
    parallel?: number;
  };
  elapsedMs?: number;
  visible?: boolean;
}

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
    <>
      <style>{`@keyframes xiaoyun-bounce{0%{transform:translateY(0)}100%{transform:translateY(-3px)}}`}</style>
      <div style={styles.container}>
        {mood && (
          <div style={styles.moodRow}>
            <span style={styles.moodIcon}>{getMoodIcon(mood)}</span>
            <span style={styles.moodText}>{getMoodMessage(mood)}</span>
          </div>
        )}

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

        {toolExecuting && (
          <div style={styles.toolRow}>
            <span style={styles.toolIcon}>
              {toolExecuting.icon || '🔧'}
            </span>
            <span style={styles.toolName}>{toolExecuting.tool}</span>
          </div>
        )}

        {elapsedMs != null && elapsedMs > 0 && (
          <span style={styles.timer}>⏱ {formatElapsed(elapsedMs)}</span>
        )}
      </div>
    </>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '8px 12px',
    background: 'linear-gradient(135deg, var(--color-bg-highlight) 0%, var(--color-bg-container) 100%)',
    borderRadius: '12px',
    border: '1px solid var(--color-border-light)',
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
    color: 'var(--color-text-primary)',
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
    background: 'var(--color-border-light)',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, var(--color-primary), var(--color-accent-cyan))',
    borderRadius: '2px',
    transition: 'width 0.5s ease',
  },
  progressLabel: {
    fontSize: '11px',
    color: 'var(--color-text-tertiary)',
    minWidth: '35px',
  },
  progressMsg: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
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
    background: 'var(--color-bg-highlight)',
    borderRadius: '6px',
  },
  toolIcon: {
    fontSize: '16px',
  },
  toolName: {
    fontSize: '12px',
    color: 'var(--color-primary)',
    fontFamily: 'monospace',
  },
  timer: {
    fontSize: '11px',
    color: 'var(--color-text-quaternary)',
    alignSelf: 'flex-end',
  },
};

export default XiaoyunLiveStatus;
