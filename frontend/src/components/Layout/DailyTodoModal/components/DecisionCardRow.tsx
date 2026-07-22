import React from 'react';
import { Tag } from 'antd';
import { BulbOutlined, RightOutlined } from '@ant-design/icons';
import type { DecisionCard } from '../types';
import { LEVEL_BORDER, LEVEL_BG, LEVEL_COLOR } from '../constants';

const DecisionCardRow: React.FC<{
  card: DecisionCard; onNav: (path: string) => void;
}> = ({ card, onNav }) => {
  const borderColor = LEVEL_BORDER[card.level] || 'var(--color-border-antd)';
  const bgColor = LEVEL_BG[card.level] || 'var(--color-bg-container)';
  const accentColor = LEVEL_COLOR[card.level] || '#595959';

  return (
    <div style={{
      borderRadius: 8, border: `1px solid ${borderColor}`,
      background: bgColor, padding: '14px 16px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Tag color={card.level === 'danger' ? 'error' : card.level === 'warning' ? 'warning' : card.level === 'success' ? 'success' : 'processing'} style={{ margin: 0 }}>
          {card.level === 'danger' ? '紧急' : card.level === 'warning' ? '注意' : card.level === 'success' ? '良好' : '提示'}
        </Tag>
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>{card.title}</span>
        {card.confidence > 0 && (
          <span style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
            置信度 {card.confidence}%
          </span>
        )}
      </div>
      <div style={{ fontSize: 14, color: 'var(--color-text)', lineHeight: 1.6, marginBottom: 6 }}>
        {card.summary}
      </div>
      {card.painPoint && (
        <div style={{ fontSize: 14, color: accentColor, marginBottom: 6 }}>
          <BulbOutlined style={{ marginRight: 4 }} />
          建议：{card.painPoint}
        </div>
      )}
      {card.evidence?.length > 0 && (
        <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>
          {card.evidence.slice(0, 6).map((e, i) => (
            <div key={i} style={{ marginBottom: 2 }}>· {e}</div>
          ))}
        </div>
      )}
      {card.actionLabel && card.actionPath && (
        <div
          onClick={() => onNav(card.actionPath)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 14, color: 'var(--primary-color)', cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          {card.actionLabel} <RightOutlined style={{ fontSize: 12 }} />
        </div>
      )}
    </div>
  );
};

export default DecisionCardRow;
