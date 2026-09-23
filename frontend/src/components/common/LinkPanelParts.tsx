/**
 * 联动面板通用展示零件（生产端/销售端悬浮卡共用）
 *
 * 原则：**不猜数据**。字段缺失一律显示"—"，整体缺失显示占位文案，
 * 绝不用 0 或默认值伪装成真实数据。
 */
import React from 'react';
import { Tooltip } from 'antd';

/* ------------------------------------------------------------------ */
/* 迷你趋势条（纯 CSS，不引入图表库）                                    */
/* ------------------------------------------------------------------ */

export interface MiniTrendPoint {
  label: string;
  value: number;
  /** 悬浮提示补充说明，如金额 */
  tip?: string;
}

interface MiniTrendProps {
  points: MiniTrendPoint[];
  height?: number;
  barColor?: string;
}

/**
 * 迷你柱状趋势：柱高按本组最大值归一化。
 * 全为 0 时只显示基线，不画任何柱子（0 是事实，不应被放大成"有数据"）。
 */
export const MiniTrendBars: React.FC<MiniTrendProps> = ({
  points,
  height = 26,
  barColor = 'var(--color-primary)',
}) => {
  if (!points.length) return null;
  const max = Math.max(...points.map(p => p.value), 0);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height }}>
      {points.map(p => {
        const ratio = max > 0 ? p.value / max : 0;
        const barH = p.value > 0 ? Math.max(2, Math.round(ratio * height)) : 1;
        return (
          <Tooltip key={p.label} title={p.tip ? `${p.label}：${p.tip}` : `${p.label}：${p.value}`}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height }}>
              <div
                style={{
                  height: barH,
                  borderRadius: 2,
                  background: p.value > 0 ? barColor : 'var(--color-bg-subtle)',
                  opacity: p.value > 0 ? 1 : 0.6,
                }}
              />
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 小组件                                                              */
/* ------------------------------------------------------------------ */

interface RowProps {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}

/** 一行"标签 — 值"，值为 null/undefined 时显示 "—" */
export const InfoRow: React.FC<RowProps> = ({ label, value, strong }) => {
  const empty = value === null || value === undefined || value === '';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, lineHeight: 1.7 }}>
      <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>{label}</span>
      <span
        style={{
          color: empty ? 'var(--color-text-quaternary)' : 'var(--color-text-primary)',
          fontWeight: strong ? 600 : 400,
          textAlign: 'right',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {empty ? '—' : value}
      </span>
    </div>
  );
};

/** 分区标题 */
export const SectionTitle: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({
  children,
  right,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      margin: '8px 0 4px',
      paddingTop: 6,
      borderTop: '1px dashed var(--color-border-secondary)',
    }}
  >
    <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>{children}</span>
    {right}
  </div>
);

/** 空/异常占位：说明原因，不编造数值 */
export const LinkEmpty: React.FC<{ text: string; danger?: boolean }> = ({ text, danger }) => (
  <div
    style={{
      padding: '6px 0',
      color: danger ? 'var(--color-danger)' : 'var(--color-text-quaternary)',
      fontSize: 12,
    }}
  >
    {text}
  </div>
);

/** 数值展示：null 显示 "—"，避免把缺失当成 0 */
export const num = (v: number | null | undefined, suffix = ''): string =>
  v === null || v === undefined ? '—' : `${v}${suffix}`;
