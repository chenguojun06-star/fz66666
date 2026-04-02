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
}

/** 智能提示项（与 SmartPredictionStrip 保持一致，方便合并使用） */
export type HintTone = 'danger' | 'warning' | 'orange' | 'red' | 'cyan' | 'green';
export interface HintItem {
  key: string;
  count: number;
  tone: HintTone;
  label: string;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
}

/**
 * 页面统计卡片组 Props
 */
interface PageStatCardsProps {
  /** 卡片配置列表 */
  cards: StatCard[];
  /** 当前选中的卡片 key */
  activeKey?: string;
  /** 智能提示标签列表（可选，count=0 的项自动隐藏） */
  hints?: HintItem[];
  /** 智能提示区域标题，默认 ' 智能提示：' */
  hintTitle?: string;
  /** 清除筛选回调（有值时显示清除按钮） */
  onClearHints?: () => void;
  /** 清除按钮文字，默认 '清除筛选' */
  clearHintsLabel?: string;
  /** 自定义容器样式 */
  style?: React.CSSProperties;
}

// ===== 色调映射（与 SmartPredictionStrip 保持一致） =====
const toneColorMap: Record<HintTone, string> = {
  orange: '#d46b08',
  red: '#cf1322',
  cyan: '#08979c',
  green: '#389e0d',
  danger: '#cf1322',
  warning: '#d46b08',
};

// ===== 样式常量（改这里，所有页面同步生效） =====
const TAG_PADDING = '3px 10px';
const TAG_BORDER_RADIUS = '4px';
const TAG_GAP = '8px';
const CONTAINER_MB = '8px';
const TAG_FONT_SIZE = '12px';
const VALUE_FONT_WEIGHT = 700;
const LABEL_COLOR = 'var(--text-secondary)';
const BORDER_COLOR = 'var(--border-color)';
const NEUTRAL_BORDER = '#d9d9d9';

/**
 * 页面顶部统计 + 智能提示通用组件
 *
 * 将统计数据（stats cards）与智能提示（hints）合并为一行小圆角方形标签，风格统一。
 *
 * - 统计标签：每组 card 渲染为一个可点击标签，多值用 · 分隔
 * - 提示标签：按 tone 着色，count=0 自动不显示
 * - 两区之间用细竖线隔开
 *
 * @example
 * ```tsx
 * <PageStatCards
 *   activeKey={activeFilter}
 *   cards={[
 *     {
 *       key: 'all',
 *       items: [
 *         { label: '订单', value: 100, unit: '个', color: 'var(--color-primary)' },
 *         { label: '数量', value: 5000, unit: '件', color: 'var(--color-success)' },
 *       ],
 *       onClick: () => setFilter('all'),
 *       activeColor: 'var(--color-primary)',
 *     },
 *   ]}
 *   hints={smartItems.map(i => ({ ...i, count: i.value }))}
 *   onClearHints={hasFilter ? () => clearFilter() : undefined}
 * />
 * ```
 */
const PageStatCards: React.FC<PageStatCardsProps> = ({
  cards,
  activeKey,
  hints = [],
  hintTitle = ' 智能提示：',
  onClearHints,
  clearHintsLabel = '清除筛选',
  style,
}) => {
  const visibleHints = hints.filter((h) => h.count > 0);

  return (
    <div
      style={{
        display: 'flex',
        gap: TAG_GAP,
        flexWrap: 'wrap',
        alignItems: 'center',
        marginBottom: CONTAINER_MB,
        ...style,
      }}
    >
      {/* ── 统计标签区域 ── */}
      {cards.map((card) => {
        const isActive = activeKey === card.key;
        const isClickable = Boolean(card.onClick);
        const itemList = Array.isArray(card.items) ? card.items : [card.items];

        const tagStyle: React.CSSProperties = {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: TAG_PADDING,
          borderRadius: TAG_BORDER_RADIUS,
          border: isActive && card.activeColor
            ? `1.5px solid ${card.activeColor}`
            : `1px solid ${BORDER_COLOR}`,
          background: isActive && card.activeColor
            ? `${card.activeColor}14`
            : '#f5f5f5',
          cursor: isClickable ? 'pointer' : 'default',
          fontSize: TAG_FONT_SIZE,
          lineHeight: 1.5,
          whiteSpace: 'nowrap',
        };

        const inner = (
          <>
            {itemList.map((item, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && (
                  <span style={{ color: LABEL_COLOR, fontSize: 11, margin: '0 1px' }}>·</span>
                )}
                <span style={{ color: LABEL_COLOR, fontSize: 11 }}>{item.label}</span>
                <span style={{ fontWeight: VALUE_FONT_WEIGHT, color: item.color || 'var(--text-primary)' }}>
                  {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
                </span>
                {item.unit && (
                  <span style={{ color: LABEL_COLOR, fontSize: 11 }}>{item.unit}</span>
                )}
              </React.Fragment>
            ))}
          </>
        );

        return isClickable ? (
          <button key={card.key} type="button" onClick={card.onClick} style={tagStyle}>
            {inner}
          </button>
        ) : (
          <span key={card.key} style={tagStyle}>
            {inner}
          </span>
        );
      })}

      {/* ── 分隔线 ── */}
      {cards.length > 0 && visibleHints.length > 0 && (
        <div style={{ width: 1, height: 16, background: BORDER_COLOR, flexShrink: 0 }} />
      )}

      {/* ── 提示区域标题 ── */}
      {visibleHints.length > 0 && (
        <span style={{ color: '#595959', fontWeight: 500, fontSize: TAG_FONT_SIZE, flexShrink: 0 }}>
          {hintTitle}
        </span>
      )}

      {/* ── 智能提示标签 ── */}
      {visibleHints.map((item) => {
        const color = toneColorMap[item.tone];
        const isBtn = typeof item.onClick === 'function';
        const hintStyle: React.CSSProperties = {
          display: 'inline-flex',
          alignItems: 'center',
          border: `1px solid ${item.active ? color : NEUTRAL_BORDER}`,
          background: item.active ? `${color}14` : '#fff',
          color,
          borderRadius: TAG_BORDER_RADIUS,
          padding: TAG_PADDING,
          fontSize: TAG_FONT_SIZE,
          fontWeight: 600,
          cursor: isBtn ? 'pointer' : 'default',
          lineHeight: 1.4,
          whiteSpace: 'nowrap',
        };
        const content = <>{item.label} {item.count}</>;

        return isBtn ? (
          <button key={item.key} type="button" title={item.hint} onClick={item.onClick} style={hintStyle}>
            {content}
          </button>
        ) : (
          <span key={item.key} style={hintStyle} title={item.hint}>
            {content}
          </span>
        );
      })}

      {/* ── 清除筛选按钮 ── */}
      {onClearHints && visibleHints.length > 0 && (
        <button
          type="button"
          onClick={onClearHints}
          style={{
            marginLeft: 'auto',
            border: 'none',
            background: 'transparent',
            color: '#8c8c8c',
            cursor: 'pointer',
            fontSize: TAG_FONT_SIZE,
          }}
        >
          {clearHintsLabel}
        </button>
      )}
    </div>
  );
};

export default PageStatCards;
