import React from 'react';
import { Descriptions } from 'antd';
import type { DescriptionsProps } from 'antd';

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
  column?: number;
  /** antd Descriptions 标准 styles API（优先级高于 labelStyle/valueStyle） */
  styles?: DescriptionsProps['styles'];
  /** antd Descriptions 标准 size */
  size?: DescriptionsProps['size'];
  className?: string;
  bordered?: boolean;
}

/**
 * 信息网格组件 — 内部基于 antd Descriptions 实现
 * 同时支持自定义 labelStyle/valueStyle（向后兼容）和标准 styles API
 */
const OrderInfoGrid: React.FC<OrderInfoGridProps> = ({
  items,
  gap = 6,
  rowGap = 5,
  fontSize = 12,
  column = 2,
  styles,
  size,
  className,
  bordered = false,
}) => {
  // 合并默认 label/content 样式
  const mergedStyles: DescriptionsProps['styles'] = React.useMemo(() => {
    const baseLabelStyle: React.CSSProperties = {
      color: 'var(--neutral-text-light, #98a2b3)',
      whiteSpace: 'nowrap',
      textAlign: 'left',
      fontSize,
    };
    const baseContentStyle: React.CSSProperties = {
      color: 'var(--neutral-text, #111827)',
      minWidth: 0,
      maxWidth: 'fit-content',
      textAlign: 'left',
      fontSize,
    };
    return {
      label: baseLabelStyle,
      content: baseContentStyle,
      ...styles,
    };
  }, [fontSize, styles]);

  // 构建 Descriptions items（处理 fullRow）
  const descriptionsItems = React.useMemo(() => {
    const result: DescriptionsProps['items'] = [];
    for (const item of items) {
      if (item.fullRow) {
        result.push({
          key: `full-${item.label || result.length}`,
          label: item.label,
          children: <div style={item.valueStyle}>{item.value}</div>,
        });
      } else {
        result.push({
          key: `pair-${item.label}`,
          label: (
            <span style={item.labelStyle}>
              {item.label}
            </span>
          ),
          children: (
            <div style={item.valueStyle}>
              {item.value}
            </div>
          ),
        });
      }
    }
    return result;
  }, [items]);

  return (
    <Descriptions
      className={className}
      column={column}
      size={size ?? 'default'}
      bordered={bordered}
      styles={{
        ...mergedStyles,
        content: { ...mergedStyles.content, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
      }}
    >
      {descriptionsItems.map((item) => (
        <Descriptions.Item key={item.key} label={item.label}>
          {item.children}
        </Descriptions.Item>
      ))}
    </Descriptions>
  );
};

export default OrderInfoGrid;
