import React from 'react';

export interface OrderInfoGridItem {
  label?: React.ReactNode;
  value: React.ReactNode;
  fullRow?: boolean;
  labelStyle?: React.CSSProperties;
  valueStyle?: React.CSSProperties;
}

interface OrderInfoGridProps {
  items: OrderInfoGridItem[];
  gap?: number;
  rowGap?: number;
  fontSize?: number;
}

const OrderInfoGrid: React.FC<OrderInfoGridProps> = ({
  items,
  gap = 6,
  rowGap = 5,
  fontSize = 12,
}) => {
  const labelBaseStyle: React.CSSProperties = {
    color: 'var(--neutral-text-light, #98a2b3)',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  };

  const valueBaseStyle: React.CSSProperties = {
    color: 'var(--neutral-text, #111827)',
    minWidth: 0,
    maxWidth: 'fit-content',
    textAlign: 'left',
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto auto',
        alignItems: 'start',
        columnGap: gap,
        rowGap,
        fontSize,
        lineHeight: 1.5,
        textAlign: 'left',
        width: 'fit-content',
        minWidth: 0,
      }}
    >
      {items.map((item, index) => {
        if (item.fullRow) {
          return (
            <div
              key={`full-${index}`}
              style={{
                gridColumn: '1 / -1',
                minWidth: 0,
                ...(item.valueStyle || {}),
              }}
            >
              {item.value}
            </div>
          );
        }

        return (
          <React.Fragment key={`pair-${index}`}>
            <span style={{ ...labelBaseStyle, ...(item.labelStyle || {}) }}>
              {item.label}
            </span>
            <div style={{ ...valueBaseStyle, ...(item.valueStyle || {}) }}>
              {item.value}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default OrderInfoGrid;
