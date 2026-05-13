import React from 'react';
import { Button, Tag } from 'antd';

export const SMART_CARD_CONTENT_WIDTH = 280;
export const SMART_CARD_OVERLAY_WIDTH = 308;

export interface DecisionInsight {
  level?: 'danger' | 'warning' | 'info' | 'success';
  title: string;
  summary: string;
  painPoint?: string;
  confidence?: string;
  source?: string;
  evidence?: string[];
  note?: string;
  execute?: string;
  actionLabel?: string;
  labels?: {
    summary?: string;
    painPoint?: string;
    execute?: string;
    evidence?: string;
    note?: string;
    action?: string;
  };
  onAction?: () => void;
}

const paletteMap: Record<NonNullable<DecisionInsight['level']>, { bg: string; border: string; title: string; dot: string }> = {
  danger: { bg: '#fff1f0', border: '#ffccc7', title: '#cf1322', dot: '#ff4d4f' },
  warning: { bg: '#fff7e6', border: '#ffd591', title: '#d46b08', dot: '#fa8c16' },
  info: { bg: '#f0f5ff', border: '#adc6ff', title: '#1d39c4', dot: '#1677ff' },
  success: { bg: '#f6ffed', border: '#b7eb8f', title: '#389e0d', dot: '#52c41a' },
};

const DecisionInsightCard: React.FC<{
  insight: DecisionInsight;
  compact?: boolean;
}> = ({ insight, compact = false }) => {
  const tone = paletteMap[insight.level ?? 'info'];
  const evidence = (insight.evidence ?? []).filter(Boolean).slice(0, compact ? 2 : 3);

  /** 彩色圆点 */
  const dot = (color: string) => (
    <span style={{
      display: 'inline-block',
      width: 6, height: 6, borderRadius: '50%',
      background: color, flexShrink: 0,
      marginTop: compact ? 5 : 6,
    }} />
  );

  /**
   * 单行：圆点 + 文字，无任何标签文字
   * dotColor 随字段语义变化，传达紧急程度
   */
  const row = (dotColor: string, text?: string, textColor = '#262626') => {
    if (!text) return null;
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
        {dot(dotColor)}
        <span style={{ color: textColor, fontSize: compact ? 11 : 12, lineHeight: 1.6, wordBreak: 'break-word', flex: 1 }}>
          {text}
        </span>
      </div>
    );
  };

  return (
    <div
      style={{
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: 8,
        padding: compact ? '8px 12px' : '10px 12px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* 标题行 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: tone.dot, flexShrink: 0 }} />
          <span style={{ color: tone.title, fontSize: compact ? 12 : 13, fontWeight: 700 }}>{insight.title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {insight.source ? <Tag color="default" style={{ margin: 0, fontSize: 10 }}>{insight.source}</Tag> : null}
          {insight.confidence ? <Tag color="blue" style={{ margin: 0, fontSize: 10 }}>{insight.confidence}</Tag> : null}
        </div>
      </div>

      {/* 内容行：圆点颜色随紧急程度区分 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* 现状 → 卡片主色调点 */}
        {row(tone.dot, insight.summary)}
        {/* 卡点 → 最强调色（danger=红/warning=橙/info=蓝/success=绿） */}
        {row(tone.title, insight.painPoint, tone.title)}
        {/* 下一步 → 始终蓝色点（可执行动作） */}
        {row('#1677ff', insight.execute, '#595959')}
        {/* 数据 → 灰色点（中性事实） */}
        {evidence.map((item, i) => (
          <React.Fragment key={`ev-${i}`}>
            {row('#8c8c8c', item, '#595959')}
          </React.Fragment>
        ))}
        {/* 补充 → 浅灰点（次要信息） */}
        {row('#bfbfbf', insight.note, '#8c8c8c')}
      </div>

      {/* 操作按钮 */}
      {insight.actionLabel ? (
        <div style={{ marginTop: 6, paddingLeft: 13 }}>
          {insight.onAction ? (
            <Button type="link" onClick={insight.onAction}
              style={{ padding: 0, height: 'auto', fontSize: 12, justifyContent: 'flex-start' }}>
              {insight.actionLabel}
            </Button>
          ) : (
            <span style={{ fontSize: 11, fontWeight: 600, color: tone.title }}>{insight.actionLabel}</span>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default DecisionInsightCard;
