import React from 'react';

export type SmartPredictionItem = {
  key: string;
  count: number;
  tone: 'danger' | 'warning';
  label: string;
};

interface SmartPredictionStripProps {
  title?: string;
  items: SmartPredictionItem[];
}

const toneColorMap: Record<SmartPredictionItem['tone'], string> = {
  danger: '#cf1322',
  warning: '#d46b08',
};

const separatorStyle: React.CSSProperties = { color: '#d9d9d9' };

const SmartPredictionStrip: React.FC<SmartPredictionStripProps> = ({ title = '⚡ 智能提示：', items }) => {
  const visibleItems = items.filter((item) => item.count > 0);
  if (visibleItems.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        margin: '0 0 12px 0',
        padding: '8px 14px',
        background: 'linear-gradient(90deg, #fff9f0 0%, #fff0f0 100%)',
        border: '1px solid #ffd591',
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      <span style={{ color: '#595959', fontWeight: 500 }}>{title}</span>
      {visibleItems.map((item, index) => (
        <React.Fragment key={item.key}>
          {index > 0 ? <span style={separatorStyle}>·</span> : null}
          <span style={{ color: toneColorMap[item.tone] }}>
            <strong>{item.count}</strong> {item.label}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
};

export default SmartPredictionStrip;
