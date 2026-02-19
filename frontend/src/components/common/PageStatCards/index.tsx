import React from 'react';

/**
 * 单个统计值
 */
export interface StatValue {
  /** 标签文字 */
  label: string;
  /** 数值 */
  value: number | string;
  /** 单位后缀（如 "个"、"件"） */
  unit?: string;
  /** 数值颜色 */
  color?: string;
}

/**
 * 统计卡片配置
 */
export interface StatCard {
  /** 唯一标识，用于筛选匹配 */
  key: string;
  /** 单值卡片用 StatValue，复合卡片用 StatValue[] */
  items: StatValue | StatValue[];
  /** 点击回调（有此属性时显示为可点击样式） */
  onClick?: () => void;
  /** 选中时的高亮颜色（如 '#2D7FF9' 或 'var(--color-primary)'），仅在可点击时生效 */
  activeColor?: string;
  /** @deprecated 不再使用，已改用基于 activeColor 的半透明背景以适配深浅主题 */
  activeBg?: string;
}

/**
 * 页面统计卡片组 Props
 */
interface PageStatCardsProps {
  /** 卡片配置列表 */
  cards: StatCard[];
  /** 当前选中的卡片 key */
  activeKey?: string;
  /** 自定义容器样式 */
  style?: React.CSSProperties;
}

// ===== 样式常量（改这里，所有页面同步生效） =====
const CARD_PADDING = '6px 12px';
const CARD_BORDER_RADIUS = '6px';
const CARD_GAP = '8px';
const CONTAINER_MARGIN_BOTTOM = '8px';
const VALUE_FONT_SIZE = '16px';
const LABEL_FONT_SIZE = '11px';
const UNIT_FONT_SIZE = '11px';
const LABEL_MARGIN_BOTTOM = '2px';
const DIVIDER_HEIGHT = '20px';
const COMPOUND_GAP = '16px';
const LABEL_COLOR = 'var(--text-secondary)';
const BORDER_COLOR = 'var(--border-color)';

/**
 * 页面顶部统计卡片通用组件
 *
 * 支持两种卡片模式：
 * 1. 单值卡片：items 传单个 StatValue
 * 2. 复合卡片：items 传 StatValue[]，多个值用竖线分隔
 *
 * 支持点击筛选：设置 onClick + activeColor，通过 activeKey 控制高亮
 *
 * @example
 * ```tsx
 * <PageStatCards
 *   activeKey={activeFilter}
 *   cards={[
 *     {
 *       key: 'all',
 *       items: [
 *         { label: '订单个数', value: 100, unit: '个', color: 'var(--color-primary)' },
 *         { label: '总数量', value: 5000, unit: '件', color: 'var(--color-success)' },
 *       ],
 *       onClick: () => setFilter('all'),
 *       activeColor: 'var(--color-primary)',
 *       activeBg: 'rgba(45, 127, 249, 0.1)',
 *     },
 *     {
 *       key: 'pending',
 *       items: { label: '待处理', value: 23, unit: '个', color: 'var(--color-warning)' },
 *       onClick: () => setFilter('pending'),
 *       activeColor: 'var(--color-warning)',
 *       activeBg: '#fff7e6',
 *     },
 *   ]}
 * />
 * ```
 */
const PageStatCards: React.FC<PageStatCardsProps> = ({ cards, activeKey, style }) => {
  return (
    <div style={{ display: 'flex', gap: CARD_GAP, marginBottom: CONTAINER_MARGIN_BOTTOM, ...style }}>
      {cards.map((card) => {
        const isActive = activeKey === card.key;
        const isClickable = Boolean(card.onClick);
        const itemList = Array.isArray(card.items) ? card.items : [card.items];
        const isCompound = itemList.length > 1;

        return (
          <div
            key={card.key}
            onClick={card.onClick}
            style={{
              flex: 1,
              padding: CARD_PADDING,
              background: isActive && card.activeColor
                ? `linear-gradient(135deg, ${card.activeColor}10 0%, ${card.activeColor}05 100%)`
                : 'var(--card-bg)',
              border: isActive && card.activeColor
                ? `1.5px solid ${card.activeColor}`
                : `1px solid ${BORDER_COLOR}`,
              borderRadius: CARD_BORDER_RADIUS,
              cursor: isClickable ? 'pointer' : 'default',
              ...(isCompound ? { display: 'flex', alignItems: 'center', gap: COMPOUND_GAP } : {}),
            }}
          >
            {itemList.map((item, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && (
                  <div style={{ width: '1px', height: DIVIDER_HEIGHT, background: BORDER_COLOR }} />
                )}
                <div>
                  <div style={{ fontSize: LABEL_FONT_SIZE, color: LABEL_COLOR, marginBottom: LABEL_MARGIN_BOTTOM }}>
                    {item.label}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: VALUE_FONT_SIZE, fontWeight: 700, color: item.color || 'var(--text-primary)' }}>
                      {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
                    </span>
                    {item.unit && (
                      <span style={{ fontSize: UNIT_FONT_SIZE, color: LABEL_COLOR }}>{item.unit}</span>
                    )}
                  </div>
                </div>
              </React.Fragment>
            ))}
          </div>
        );
      })}
    </div>
  );
};

export default PageStatCards;
