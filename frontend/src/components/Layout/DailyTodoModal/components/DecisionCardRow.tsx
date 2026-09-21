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
  const accentColor = LEVEL_COLOR[card.level] || 'var(--color-gray-700)';

  return (
    <div style={{
      borderRadius: 8, border: `1px solid ${borderColor}`,
      background: bgColor, padding: '14px 16px', marginBottom: 10,
    }}>
      <div className="u-d-flex u-ai-center u-gap-8 u-mb-6">
        <Tag color={card.level === 'danger' ? 'error' : card.level === 'warning' ? 'warning' : card.level === 'success' ? 'success' : 'processing'} style={{ margin: 0 }}>
          {card.level === 'danger' ? '紧急' : card.level === 'warning' ? '注意' : card.level === 'success' ? '良好' : '提示'}
        </Tag>
        <span className="u-fw-600 u-fs-14" style={{ color: 'var(--color-text)' }}>{card.title}</span>
        {card.confidence > 0 && (
          <span className="u-fs-14 u-ml-auto" style={{ color: 'var(--color-text-tertiary)' }}>
            置信度 {card.confidence}%
          </span>
        )}
      </div>
      <div className="u-fs-14 u-mb-6" style={{ color: 'var(--color-text)', lineHeight: 1.6 }}>
        {card.summary}
      </div>
      {card.painPoint && (
        <div style={{ fontSize: 15, color: accentColor, marginBottom: 6 }}>
          <BulbOutlined style={{ marginRight: 4 }} />
          建议：{card.painPoint}
        </div>
      )}
      {card.evidence?.length > 0 && (
        <div className="u-fs-14 u-mb-6" style={{ color: 'var(--color-text-tertiary)' }}>
          {card.evidence.slice(0, 6).map((e, i) => (
            <div key={i} className="u-mb-2">· {e}</div>
          ))}
        </div>
      )}
      {card.actionLabel && card.actionPath && (
        <div
          onClick={() => onNav(card.actionPath)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 15, color: 'var(--primary-color)', cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          {card.actionLabel} <RightOutlined style={{ fontSize: 13 }} />
        </div>
      )}
    </div>
  );
};

export default DecisionCardRow;
