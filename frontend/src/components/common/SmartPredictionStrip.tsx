import React from 'react';

export type SmartPredictionItem = {
  key: string;
  count: number;
  tone: 'danger' | 'warning' | 'orange' | 'red' | 'cyan' | 'green';
  label: string;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
};

interface SmartPredictionStripProps {
  title?: string;
  items: SmartPredictionItem[];
  onClear?: () => void;
  clearLabel?: string;
}

const toneColorMap: Record<SmartPredictionItem['tone'], string> = {
  orange: '#d46b08',
  red: '#cf1322',
  cyan: '#08979c',
  green: '#389e0d',
  danger: '#cf1322',
  warning: '#d46b08',
};

const neutralButtonBorder = '#d9d9d9';
const SmartPredictionStrip: React.FC<SmartPredictionStripProps> = ({
  title = ' 智能提示：',
  items,
  onClear,
  clearLabel = '清除筛选',
}) => {
  const visibleItems = items.filter((item) => item.count > 0);
  if (visibleItems.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        margin: '0 0 12px 0',
        padding: '4px 0',
        background: 'transparent',
        border: 'none',
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      <span style={{ color: '#595959', fontWeight: 500 }}>{title}</span>
      {visibleItems.map((item) => {
        const color = toneColorMap[item.tone];
        const isButton = typeof item.onClick === 'function';
        const content = (
          <>
            {item.label} {item.count}
          </>
        );
        const sharedStyle: React.CSSProperties = {
          border: `1px solid ${item.active ? color : neutralButtonBorder}`,
          background: item.active ? `${color}14` : '#fff',
          color,
          borderRadius: 4,
          padding: '4px 10px',
          fontSize: 12,
          fontWeight: 600,
          cursor: isButton ? 'pointer' : 'default',
          lineHeight: 1.4,
        };

        if (!isButton) {
          return (
            <span key={item.key} style={sharedStyle} title={item.hint}>
              {content}
            </span>
          );
        }

        return (
          <button
            key={item.key}
            type="button"
            title={item.hint}
            onClick={item.onClick}
            style={sharedStyle}
          >
            {content}
          </button>
        );
      })}
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          style={{
            marginLeft: 'auto',
            border: 'none',
            background: 'transparent',
            color: '#8c8c8c',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          {clearLabel}
        </button>
      ) : null}
    </div>
  );
};

export default SmartPredictionStrip;
