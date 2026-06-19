import React, { useMemo } from 'react';
import { Progress, Tag } from 'antd';
import {
  formatBudgetHours,
  calculateActualDuration,
  calculateWaitingDuration,
  computeBudgetStatus,
} from '@/utils/workingTimeCalculator';

const DEFAULT_BUDGET_HOURS = 5;

interface BudgetLabel {
  text: string;
  color: string;
}

interface ProgressStage {
  key: string;
  title: string;
  count?: string;
  meta: { label: string; color: 'success' | 'processing' | 'default'; percent: number };
  helper?: string;
  budgetHours?: number;
  budgetCustomized?: boolean;
  budgetField?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  completed?: boolean;
  availableTime?: string | null;
}

interface StageStatus extends Omit<ProgressStage, 'endTime' | 'startTime' | 'availableTime' | 'helper' | 'count'> {
  budgetLabel?: BudgetLabel;
  actualDuration?: string | null;
  waitDuration?: string | null;
  endTime?: string | null;
  startTime?: string | null;
  availableTime?: string | null;
  helper?: string;
  count?: string;
}

interface StyleDevelopmentProgressBannerProps {
  stages: ProgressStage[];
  activeKey?: string;
  onStageClick?: (key: ProgressStage['key']) => void;
  style?: React.CSSProperties;
}

const getProgressColor = (meta: ProgressStage['meta']) => {
  switch (meta.color) {
    case 'success': return 'var(--color-success)';
    case 'processing': return 'var(--color-info)';
    default: return 'var(--color-border-antd)';
  }
};

const StyleDevelopmentProgressBanner: React.FC<StyleDevelopmentProgressBannerProps> = ({
  stages,
  activeKey,
  onStageClick,
  style,
}) => {
  const stageStatus = useMemo(() => {
    return stages.map((item, index): StageStatus => {
      let budgetLabel: BudgetLabel | undefined = undefined;
      if (item.budgetField && item.budgetHours != null) {
        if (!item.budgetCustomized) {
          budgetLabel = { text: `默认${formatBudgetHours(item.budgetHours)}`, color: 'var(--color-text-quaternary)' };
        } else {
          const status = computeBudgetStatus(item.budgetHours, item.availableTime || null, item.startTime || null, item.endTime || null);
          if (status?.text) {
            budgetLabel = { text: `预算${formatBudgetHours(item.budgetHours)} · ${status.text}`, color: status.color };
          } else {
            budgetLabel = { text: `预算${formatBudgetHours(item.budgetHours)}`, color: 'var(--color-text-quaternary)' };
          }
        }
      }

      const actualDuration = item.completed && item.startTime && item.endTime
        ? calculateActualDuration(item.startTime, item.endTime)
        : null;

      const prevItem = index > 0 ? stages[index - 1] : null;
      const waitDuration = prevItem?.endTime && item.startTime
        ? calculateWaitingDuration(prevItem.endTime, item.startTime)
        : null;

      return { ...item, budgetLabel, actualDuration: actualDuration as string | null, waitDuration: waitDuration as string | null };
    });
  }, [stages]);

  return (
    <div 
      style={{ 
        background: 'var(--color-bg-subtle, var(--color-bg-container))',
        borderRadius: 10,
        padding: '16px 20px',
        border: '1px solid var(--color-border-light, var(--color-border-light))',
        ...style 
      }}
    >
      <div style={{ 
        display: 'flex', 
        gap: 16, 
        alignItems: 'stretch',
        overflowX: 'auto',
        paddingBottom: 4,
      }}>
        {stageStatus.map((item, index) => {
          const isActive = activeKey === item.key;
          const progressColor = getProgressColor(item.meta);

          return (
            <div
              key={item.key}
              onClick={() => onStageClick?.(item.key)}
              style={{
                flex: '0 0 auto',
                minWidth: 180,
                maxWidth: 220,
                background: isActive ? 'white' : 'var(--color-bg-container, var(--color-bg-base))',
                borderRadius: 8,
                padding: 12,
                cursor: 'pointer',
                border: isActive 
                  ? '2px solid var(--color-primary, var(--color-info))' 
                  : '1px solid var(--color-border-light, var(--color-border-light))',
                boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: 8 
              }}>
                <span style={{ 
                  fontWeight: 600, 
                  fontSize: 14,
                  color: 'var(--color-text-primary)' 
                }}>
                  {item.title}
                </span>
                <Tag color={item.meta.color} style={{ margin: 0, fontSize: 11, padding: '0 6px', height: 20, lineHeight: '18px' }}>
                  {item.meta.label}
                </Tag>
              </div>

              {item.count && (
                <div style={{ 
                  fontSize: 12, 
                  color: 'var(--color-text-secondary)', 
                  marginBottom: 8 
                }}>
                  {item.count}
                </div>
              )}

              <Progress 
                percent={item.meta.percent} 
                strokeColor={progressColor}
                showInfo={false}
                size="small"
                strokeLinecap="round"
                style={{ marginBottom: 10 }}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
                {item.budgetLabel && (
                  <div style={{ 
                    color: item.budgetLabel.color,
                    display: 'flex',
                    gap: 4,
                    alignItems: 'center',
                  }}>
                    <span style={{ color: 'var(--color-text-quaternary)' }}>预算:</span>
                    <span>{item.budgetLabel.text.replace('预算', '')}</span>
                  </div>
                )}

                {item.actualDuration != null && (
                  <div style={{ 
                    color: 'var(--color-text-secondary)',
                    display: 'flex',
                    gap: 4,
                    alignItems: 'center',
                  }}>
                    <span style={{ color: 'var(--color-text-quaternary)' }}>实际:</span>
                    <span>{item.actualDuration}</span>
                  </div>
                )}

                {item.waitDuration != null && (
                  <div style={{ 
                    color: 'var(--color-text-tertiary)',
                    display: 'flex',
                    gap: 4,
                    alignItems: 'center',
                  }}>
                    <span style={{ color: 'var(--color-text-quaternary)' }}>等待:</span>
                    <span>{item.waitDuration}</span>
                  </div>
                )}

                {item.helper && !item.actualDuration && (
                  <div style={{ 
                    color: 'var(--color-text-tertiary)',
                    fontSize: 11,
                  }}>
                    {item.helper}
                  </div>
                )}
              </div>

              {index < stages.length - 1 && (
                <div style={{
                  position: 'absolute',
                  right: -12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 24,
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-border-light)',
                  fontSize: 14,
                }}>
                  →
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StyleDevelopmentProgressBanner;
