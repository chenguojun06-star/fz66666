/**
 * MiniCard — 通用迷你数字卡片
 * 可用于：生产看板、财务统计、仓库状态等任意模块
 *
 * Props:
 *   icon      — 图标（Antd Icon 或任意 ReactNode）
 *   label     — 标签文字
 *   value     — 主显示值（数字/字符串）
 *   sub       — 副文字（小字）
 *   color     — 主色
 *   bg        — 背景色（省略时自动用 color+'11'）
 *   tooltip   — 鼠标悬停 Tooltip
 *   onClick   — 点击回调（有值时显示手型光标 + hover抬起）
 *   trend     — 趋势方向 'up'|'down'|undefined
 *   trendText — 趋势说明文字
 *   badge     — 右上角数字徽标
 *   style     — 根容器额外样式
 */
import React from 'react';
import { Tooltip, Badge } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

export interface MiniCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  color: string;
  bg?: string;
  tooltip?: string;
  onClick?: () => void;
  trend?: 'up' | 'down';
  trendText?: string;
  badge?: number;
  style?: React.CSSProperties;
}

const MiniCard: React.FC<MiniCardProps> = ({
  icon, label, value, sub, color, bg, tooltip, onClick,
  trend, trendText, badge, style,
}) => {
  const bgColor = bg ?? color + '12';
  const clickable = !!onClick;

  const inner = (
    <div
      onClick={onClick}
      style={{
        flex: '1 1 0',
        minWidth: 96,
        background: bgColor,
        borderRadius: 10,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        cursor: clickable ? 'pointer' : tooltip ? 'help' : 'default',
        transition: 'transform 0.15s, box-shadow 0.15s',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (clickable || tooltip) {
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
          if (clickable) (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 12px ${color}33`;
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* 图标圆块 */}
      <div style={{
        width: 36, height: 36, borderRadius: 9,
        background: color + '22',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color, fontSize: 16, flexShrink: 0,
      }}>
        {icon}
      </div>

      {/* 文字区 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 2 }}>{label}</div>
        {(sub || trend) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            {trend && (
              <span style={{ color: trend === 'up' ? '#52c41a' : '#ff4d4f', fontSize: 10 }}>
                {trend === 'up' ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
              </span>
            )}
            {(sub || trendText) && (
              <span style={{ fontSize: 10, color: color + 'aa' }}>{trendText ?? sub}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const withBadge = badge != null && badge > 0
    ? <Badge count={badge} size="small">{inner}</Badge>
    : inner;

  return tooltip
    ? <Tooltip title={tooltip}>{withBadge}</Tooltip>
    : withBadge;
};

export default MiniCard;
