import React, { useState, useEffect, useRef } from 'react';
import type { ProductionOrder } from '@/types/production';

/* ═══════════════════════════════════════════════════
   工具函数
═══════════════════════════════════════════════════ */

export const risk2color = (r: string) =>
  ({ HIGH: '#ff4136', MEDIUM: '#f7a600', LOW: '#39ff14' }[r] ?? '#39ff14');

export const grade2color = (g: string) =>
  ({ A: '#39ff14', B: '#00e5ff', C: '#f7a600', D: '#ff4136' }[g] ?? '#888');

/** 严重程度颜色 */
export const sev2c = (s: string) => ({ critical: '#ff4136', warning: '#f7a600', normal: '#39ff14' }[s] ?? '#39ff14');

/** 交期风险强度展示 */
export const risk2badge = (r: string) => ({
  overdue: { label: '已逾期', color: '#ff4136' },
  danger:  { label: '高风险', color: '#ff4136' },
  warning: { label: '预警',   color: '#f7a600' },
  safe:    { label: '安全',   color: '#39ff14' },
}[r] ?? { label: r, color: '#888' });

export const STAGE_FIELDS = [
  { key: 'procurementCompletionRate', label: '采购' },
  { key: 'cuttingCompletionRate',     label: '裁剪' },
  { key: 'sewingCompletionRate',      label: '车缝' },
  { key: 'qualityCompletionRate',     label: '质检' },
  { key: 'warehousingCompletionRate', label: '入库' },
] as const;

export const STAGE_HINTS: Record<string, string> = {
  '裁剪': '建议优先排裁床工序，加快备料节奏',
  '车缝': '车缝产能不足，可安排加班追单',
  '尾部': '尾部整理积压，建议增调辅助工人',
  '质检': '质检积压，建议核查验收人数配置',
  '入库': '入库缓慢，检查仓库收货装箱流程',
  '采购': '采购进度滞后，建议立即催促供应商',
};

export const getFactoryAiHint = (stage: string, pct: number): string =>
  pct >= 70 ? '整体健康，持续跟进' : (STAGE_HINTS[stage] ?? '建议深入排查该工序产能瓶颈');

export const getAiTip = (prog: number, daysLeft: number | null): string => {
  if (prog >= 95) return '即将完成，建议提前安排入库验收';
  if (daysLeft !== null && daysLeft < 0) return `已逾期 ${-daysLeft} 天，建议立即联系工厂加急处理`;
  if (daysLeft !== null && daysLeft <= 3 && prog < 80) return `交期仅剩 ${daysLeft} 天，进度 ${prog}%，建议安排加班追单`;
  if (daysLeft !== null && daysLeft <= 7 && prog < 50) return `本周内到期，进度 ${prog}% 偏低，存在延交风险`;
  if (prog < 20 && daysLeft !== null && daysLeft < 14) return '进度偏低，建议联系工厂确认是否有阻碍';
  return `当前进度 ${prog}%，生产节奏正常，预计可按时交货`;
};

export const fmtD = (d?: string) => (d ? d.slice(5, 10) : '--');

export const medalColor = ['#ffd700', '#c0c0c0', '#cd7f32'];

/* ═══════════════════════════════════════════════════
   小组件
═══════════════════════════════════════════════════ */

/** 实时绿色闪烁点 */
export const LiveDot: React.FC<{ color?: string; size?: number }> = ({ color = '#39ff14', size = 8 }) => (
  <span className="live-dot" style={{ '--dot-color': color, '--dot-size': `${size}px` } as React.CSSProperties} />
);

/** 折线迷你图 */
export const Sparkline: React.FC<{ pts: number[]; color?: string; width?: number; height?: number }> = ({
  pts, color = '#00e5ff', width = 160, height = 44,
}) => {
  if (!pts || !pts.length) return null;
  const safe = pts.map(v => (typeof v === 'number' && isFinite(v) ? v : 0));
  const max = Math.max(...safe, 1);
  const n = safe.length;
  const xs = safe.map((_, i) => {
    const x = (i / Math.max(n - 1, 1)) * width;
    return isFinite(x) ? x : 0;
  });
  const ys = safe.map(v => {
    const y = height - (v / max) * (height - 4) - 2;
    return isFinite(y) ? y : height - 2;
  });
  const poly = xs.map((x, i) => `${x},${ys[i]}`).join(' ');
  const area = `${xs[0]},${height} ${poly} ${xs[xs.length - 1]},${height}`;
  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#sg)" />
      <polyline points={poly} fill="none" stroke={color} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" />
      {safe.map((_, i) => (
        <circle key={i} cx={xs[i]} cy={ys[i]} r={i === n - 1 ? 4 : 2.5}
          fill={color} opacity={i === n - 1 ? 1 : 0.6} />
      ))}
    </svg>
  );
};

/** KPI Hover 详情弹出卡片 */
export type KpiPopItem = { label: string; value: React.ReactNode; color?: string };
export const KpiPop: React.FC<{
  title: string;
  items: KpiPopItem[];
  aiTip?: string;
  warning?: string;
}> = ({ title, items, aiTip, warning }) => (
  <div className="kpi-pop-body">
    <div className="kpi-pop-title">{title}</div>
    {items.map((it, i) => (
      <div key={i} className="kpi-pop-row">
        <span className="kpi-pop-label">{it.label}</span>
        <span className="kpi-pop-value" style={it.color ? { color: it.color } : undefined}>{it.value}</span>
      </div>
    ))}
    {warning && <div className="kpi-pop-warn">⚠️ {warning}</div>}
    {aiTip   && <div className="kpi-pop-ai">🤖 AI 预测：{aiTip}</div>}
  </div>
);

/** 数字飞升动画组件 */
export const AnimatedNum: React.FC<{ val: number | string; color?: string; className?: string }> = ({ val, color, className }) => {
  const [display, setDisplay] = useState(val);
  const [delta, setDelta]     = useState<'up' | 'down' | null>(null);
  const prevRef = useRef(val);
  useEffect(() => {
    const prev = prevRef.current;
    const pNum = typeof prev === 'number' ? prev : parseFloat(String(prev));
    const cNum = typeof val  === 'number' ? val  : parseFloat(String(val));
    if (!isNaN(pNum) && !isNaN(cNum) && cNum !== pNum) {
      setDelta(cNum > pNum ? 'up' : 'down');
      setTimeout(() => setDelta(null), 1800);
    }
    prevRef.current = val;
    setDisplay(val);
  }, [val]);
  return (
    <span className={className} style={color ? { color } : undefined}>
      {display}
      {delta === 'up'   && <span className="kpi-delta kpi-delta-up">↑</span>}
      {delta === 'down' && <span className="kpi-delta kpi-delta-down">↓</span>}
    </span>
  );
};
