import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { Tag, Input, Button, Tooltip, Popover } from 'antd';
import {
  ThunderboltOutlined, SyncOutlined, RobotOutlined, SendOutlined,
  WarningOutlined, CheckCircleOutlined, DashboardOutlined,
  FullscreenOutlined, FullscreenExitOutlined,
} from '@ant-design/icons';
import { intelligenceApi, productionOrderApi } from '@/services/production/productionApi';
import type {
  LivePulseResponse, HealthIndexResponse, SmartNotificationResponse,
  WorkerEfficiencyResponse, DefectHeatmapResponse, FactoryLeaderboardResponse,
  MaterialShortageResult, SelfHealingResponse,
  FactoryBottleneckItem,
  BottleneckDetectionResponse, DeliveryRiskResponse, DeliveryRiskItem, AnomalyItem,
  NlQueryResponse, DefectTraceResponse,
} from '@/services/production/productionApi';
import type { ProductionOrder } from '@/types/production';
import Layout from '@/components/Layout';
import WorkerProfilePanel from './WorkerProfilePanel';
import SmartAssignmentPanel from './SmartAssignmentPanel';
import ProfitDeliveryPanel from './ProfitDeliveryPanel';
import LearningReportPanel from './LearningReportPanel';
import RhythmDnaPanel from './RhythmDnaPanel';
import SchedulingSuggestionPanel from './SchedulingSuggestionPanel';
import LiveScanFeed from './LiveScanFeed';
import MindPushPanel from './MindPushPanel';
import { useAuth } from '@/utils/AuthContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { WsMessage } from '@/hooks/useWebSocket';
import './styles.css';

/* ═══════════════════════════════════════════════════
   工具函数 & 小组件
═══════════════════════════════════════════════════ */

const risk2color = (r: string) =>
  ({ HIGH: '#ff4136', MEDIUM: '#f7a600', LOW: '#39ff14' }[r] ?? '#39ff14');

const grade2color = (g: string) =>
  ({ A: '#39ff14', B: '#00e5ff', C: '#f7a600', D: '#ff4136' }[g] ?? '#888');

/** 实时绿色闪烁点 */
const LiveDot: React.FC<{ color?: string; size?: number }> = ({ color = '#39ff14', size = 8 }) => (
  <span className="live-dot" style={{ '--dot-color': color, '--dot-size': `${size}px` } as React.CSSProperties} />
);

/** 折线迷你图 */
const Sparkline: React.FC<{ pts: number[]; color?: string; width?: number; height?: number }> = ({
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

/* ─── KPI Hover 详情弹出卡片 ─── */
type KpiPopItem = { label: string; value: React.ReactNode; color?: string };
const KpiPop: React.FC<{
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

/* ─── 订单滚动面板相关 ─── */
const STAGE_FIELDS = [
  { key: 'procurementCompletionRate', label: '采购' },
  { key: 'cuttingCompletionRate',     label: '裁剪' },
  { key: 'sewingCompletionRate',      label: '车缝' },
  { key: 'qualityCompletionRate',     label: '质检' },
  { key: 'warehousingCompletionRate', label: '入库' },
] as const;

const getAiTip = (prog: number, daysLeft: number | null): string => {
  if (prog >= 95) return '即将完成，建议提前安排入库验收';
  if (daysLeft !== null && daysLeft < 0) return `已逾期 ${-daysLeft} 天，建议立即联系工厂加急处理`;
  if (daysLeft !== null && daysLeft <= 3 && prog < 80) return `交期仅剩 ${daysLeft} 天，进度 ${prog}%，建议安排加班追单`;
  if (daysLeft !== null && daysLeft <= 7 && prog < 50) return `本周内到期，进度 ${prog}% 甄1低，存在延交风险`;
  if (prog < 20 && daysLeft !== null && daysLeft < 14) return '进度偏低，建议联系工厂确认是否有阔碍';
  return `当前进度 ${prog}%，生产节奏正常，预计可按时交货`;
};

/* 严重程度颜色 */
const sev2c = (s: string) => ({ critical: '#ff4136', warning: '#f7a600', normal: '#39ff14' }[s] ?? '#39ff14');

/* 工厂卡点 AI 建议 */
const STAGE_HINTS: Record<string, string> = {
  '裁剪': '建议优先排裁床工序，加快备料节奏',
  '车缝': '车缝产能不足，可安排加班追单',
  '尾部': '尾部整理积压，建议增调辅助工人',
  '质检': '质检积压，建议核查验收人数配置',
  '入库': '入库缓慢，检查仓库收货装箱流程',
  '采购': '采购进度滞后，建议立即催促供应商',
};
const getFactoryAiHint = (stage: string, pct: number): string =>
  pct >= 70 ? '整体健康，持续跟进' : (STAGE_HINTS[stage] ?? '建议深入排查该工序产能瓶颈');

/* 交期风险强度展示 */
const risk2badge = (r: string) => ({
  overdue: { label: '已逾期', color: '#ff4136' },
  danger:  { label: '高风险', color: '#ff4136' },
  warning: { label: '预警',   color: '#f7a600' },
  safe:    { label: '安全',   color: '#39ff14' },
}[r] ?? { label: r, color: '#888' });

const OrderPop: React.FC<{ order: ProductionOrder }> = ({ order }) => {
  const prog = Number(order.productionProgress) || 0;
  const daysLeft = order.plannedEndDate
    ? Math.ceil((new Date(order.plannedEndDate).getTime() - Date.now()) / 86400000)
    : null;
  const aiTip = getAiTip(prog, daysLeft);

  /* 按需懒加载：展开弹窗时发起四个带 orderId 的智能模型 */
  const [intel, setIntel] = useState<{
    bottleneck:   BottleneckDetectionResponse | null;
    riskItem:     DeliveryRiskItem | null;
    anomalies:    AnomalyItem[];
    defectTrace:  DefectTraceResponse | null;
    loading:      boolean;
  }>({ bottleneck: null, riskItem: null, anomalies: [], defectTrace: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [rB, rD, rA, rDT] = await Promise.allSettled([
        intelligenceApi.detectBottleneck({ orderNo: order.orderNo }),
        intelligenceApi.assessDeliveryRisk({ orderId: String(order.id) }),
        intelligenceApi.detectAnomalies(),
        intelligenceApi.getDefectTrace(String(order.id)),
      ]);
      if (cancelled) return;
      const bottleneck: BottleneckDetectionResponse | null =
        rB.status === 'fulfilled' ? ((rB.value as any)?.data ?? null) : null;
      const riskData: DeliveryRiskResponse | null =
        rD.status === 'fulfilled' ? ((rD.value as any)?.data ?? null) : null;
      const riskItem = riskData?.items?.find((i: DeliveryRiskItem) => i.orderNo === order.orderNo) ?? null;
      const anomalyRaw = rA.status === 'fulfilled' ? ((rA.value as any)?.data?.items ?? []) : [];
      const anomalies: AnomalyItem[] = (anomalyRaw as AnomalyItem[]).filter(a =>
        a.targetName?.includes(order.factoryName ?? '') ||
        a.targetName?.includes(order.orderNo ?? '')
      ).slice(0, 2);
      const defectTrace: DefectTraceResponse | null =
        rDT.status === 'fulfilled' ? ((rDT.value as any)?.data ?? null) : null;
      setIntel({ bottleneck, riskItem, anomalies, defectTrace, loading: false });
    })();
    return () => { cancelled = true; };
  }, [order.id, order.orderNo, order.factoryName]);

  return (
    <div className="order-pop-body">
      {/* ─ 头部：订单号 + 风险强度 + 剩余天数 ─ */}
      <div className="order-pop-header">
        <span className="order-pop-no">{order.orderNo}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {intel.riskItem && (() => {
            const b = risk2badge(intel.riskItem.riskLevel);
            return (
              <span style={{ fontSize: 10, fontWeight: 700, color: b.color,
                border: `1px solid ${b.color}55`, padding: '1px 6px', borderRadius: 3 }}>
                {b.label}
              </span>
            );
          })()}
          {daysLeft !== null && (
            <span className="order-pop-days" style={{
              color: daysLeft < 0 ? '#ff4136' : daysLeft <= 3 ? '#f7a600' : '#39ff14',
            }}>
              {daysLeft < 0 ? `⚠ 逾期${-daysLeft}天` : daysLeft === 0 ? '今日交货' : `剩 ${daysLeft} 天`}
            </span>
          )}
        </div>
      </div>

      {/* ─ 概要：工厂、款式、件数 ─ */}
      <div className="order-pop-meta">
        <span>🏭 {order.factoryName}</span>
        <span>👗 {order.styleName}</span>
        <span>📦 {order.orderQuantity} 件</span>
      </div>

      {/* ─ 5个工序进度条 ─ */}
      <div className="order-pop-stages">
        {STAGE_FIELDS.map(({ key, label }) => {
          const pct = Math.min(100, Math.max(0, Number((order as any)[key]) || 0));
          const c = pct >= 100 ? '#39ff14' : pct >= 60 ? '#00e5ff' : pct >= 30 ? '#f7a600' : '#2a4455';
          return (
            <div key={key} className="order-pop-stage-row">
              <span className="order-pop-stage-label">{label}</span>
              <div className="order-pop-stage-bar-wrap">
                <div className="order-pop-stage-bar" style={{ width: `${pct}%`, background: c }} />
              </div>
              <span className="order-pop-stage-pct" style={{ color: c }}>{pct}%</span>
            </div>
          );
        })}
      </div>

      {/* ─ 工序瓶颈检测（第一个需要 orderNo 的智能接口） ─ */}
      {!intel.loading && intel.bottleneck?.hasBottleneck && (
        <div style={{ margin: '8px 0 6px', padding: '6px 8px',
          background: 'rgba(255,65,54,0.04)', borderRadius: 5,
          border: '1px solid rgba(255,65,54,0.15)' }}>
          <div style={{ fontSize: 10, color: '#ff4136', fontWeight: 700,
            marginBottom: 5, letterSpacing: 0.5 }}>⚡ 工序瓶颈 Top{intel.bottleneck.items.length > 1 ? '2' : '1'}</div>
          {intel.bottleneck.items.slice(0, 2).map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center',
              gap: 6, marginBottom: i < 1 ? 3 : 0, fontSize: 11 }}>
              <span style={{ color: sev2c(b.severity), fontWeight: 700, minWidth: 34 }}>{b.stageName}</span>
              <span style={{ color: '#3a5470', flex: 1 }}>积压 {b.backlog} 件</span>
              <span style={{ color: sev2c(b.severity), fontSize: 10,
                border: `1px solid ${sev2c(b.severity)}44`, padding: '0 4px', borderRadius: 3 }}>
                {b.severity === 'critical' ? '严重' : b.severity === 'warning' ? '预警' : '正常'}
              </span>
            </div>
          ))}
          {intel.bottleneck.items[0]?.suggestion && (
            <div style={{ fontSize: 10, color: '#4a6a7a', marginTop: 5, lineHeight: 1.5 }}>
              💡 {intel.bottleneck.items[0].suggestion}
            </div>
          )}
        </div>
      )}

      {/* ─ 交期风险评估（第二个需要 orderId 的智能接口） ─ */}
      {!intel.loading && intel.riskItem && (
        <div style={{ marginBottom: 6, padding: '6px 8px',
          background: `${risk2badge(intel.riskItem.riskLevel).color}08`,
          borderRadius: 5, border: `1px solid ${risk2badge(intel.riskItem.riskLevel).color}22` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: risk2badge(intel.riskItem.riskLevel).color,
              fontWeight: 700 }}>📊 交期风险评估</span>
            <span style={{ fontSize: 10, color: '#3a5470' }}>
              预测: {intel.riskItem.predictedEndDate?.slice(0, 10) ?? '--'}
            </span>
          </div>
          <div style={{ fontSize: 10, color: '#4a7a8a', lineHeight: 1.55 }}>
            {intel.riskItem.riskDescription}
          </div>
          {(intel.riskItem.requiredDailyOutput || intel.riskItem.currentDailyOutput) ? (
            <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10 }}>
              <span style={{ color: '#2a5a70' }}>日产需 <b style={{ color: '#f7a600' }}>{intel.riskItem.requiredDailyOutput}</b> 件</span>
              <span style={{ color: '#2a5a70' }}>当前 <b style={{ color: '#00e5ff' }}>{intel.riskItem.currentDailyOutput}</b> 件</span>
            </div>
          ) : null}
        </div>
      )}

      {/* ─ 异常行为检测（第三个智能接口，按工厂过滤） ─ */}
      {!intel.loading && intel.anomalies.length > 0 && (
        <div style={{ marginBottom: 6, padding: '6px 8px',
          background: 'rgba(255,200,0,0.04)', borderRadius: 5,
          border: '1px solid rgba(255,200,0,0.12)' }}>
          <div style={{ fontSize: 10, color: '#f7a600', fontWeight: 700, marginBottom: 4 }}>
            🔍 异常行为 ({intel.anomalies.length})
          </div>
          {intel.anomalies.map((a, i) => (
            <div key={i} style={{
              fontSize: 10, lineHeight: 1.5, marginBottom: i < intel.anomalies.length - 1 ? 3 : 0,
              color: ({ critical: '#ff4136', warning: '#f7a600', info: '#00e5ff' } as Record<string, string>)[a.severity] ?? '#888',
            }}>
              · <b>{a.title}</b>: {a.description}
            </div>
          ))}
        </div>
      )}

      {/* ─ 加载中占位符 ─ */}
      {intel.loading && (
        <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 10, color: '#1e3348' }}>
          ⁙ 智能分析中...
        </div>
      )}

      {/* ─ 缺陷溯源分析（第四个智能接口） ─ */}
      {!intel.loading && intel.defectTrace && (
        <div style={{ marginBottom: 6, padding: '6px 8px',
          background: 'rgba(180,80,255,0.05)', borderRadius: 5,
          border: '1px solid rgba(180,80,255,0.18)' }}>
          <div style={{ fontSize: 10, color: '#c084fc', fontWeight: 700, marginBottom: 4 }}>🔬 缺陷溯源</div>
          {intel.defectTrace.workers?.slice(0, 2).map((w, i) => (
            <div key={i} style={{ fontSize: 10, color: '#a78bfa', marginBottom: 2 }}>
              👷 {w.operatorName}：缺陷率 <b style={{ color: '#f472b6' }}>{(w.defectRate * 100).toFixed(1)}%</b>
              {w.worstProcess ? ` · ${w.worstProcess}` : ''}
            </div>
          ))}
          {intel.defectTrace.hotProcesses?.slice(0, 1).map((p, i) => (
            <div key={i} style={{ fontSize: 10, color: '#818cf8', marginTop: 2 }}>
              ⚙ 高发工序：{p.processName}（{p.defectCount} 件）
            </div>
          ))}
          {intel.defectTrace.overallDefectRate !== undefined && (
            <div style={{ fontSize: 10, color: '#4a3a60', marginTop: 4 }}>💡 总缺陷率：{(intel.defectTrace.overallDefectRate * 100).toFixed(1)}%（{intel.defectTrace.totalDefects} 件/{intel.defectTrace.totalScans} 件）</div>
          )}
        </div>
      )}

      {/* ─ AI 整体建议 ─ */}
      <div className="order-pop-ai">🤖 AI：{aiTip}</div>
    </div>
  );
};

const fmtD = (d?: string) => (d ? d.slice(5, 10) : '--');

const OrderRow: React.FC<{ order: ProductionOrder }> = ({ order }) => {
  const prog = Number(order.productionProgress) || 0;
  const daysLeft = order.plannedEndDate
    ? Math.ceil((new Date(order.plannedEndDate).getTime() - Date.now()) / 86400000)
    : null;
  const riskColor = daysLeft !== null && daysLeft < 0 ? '#ff4136'
    : daysLeft !== null && daysLeft <= 3 ? '#f7a600'
    : prog < 20 ? '#f7a600'
    : '#39ff14';
  return (
    <Popover
      overlayClassName="cockpit-order-pop"
      placement="left"
      content={<OrderPop order={order} />}
      mouseEnterDelay={0.1}
      mouseLeaveDelay={0.05}
      getPopupContainer={() => (document.fullscreenElement as HTMLElement) || document.body}
    >
      <div className="c-order-row">
        <div className="c-order-row-main">
          {/* 左：工厂名 */}
          <span className="c-order-factory">{order.factoryName ?? '—'}</span>
          {/* 中：订单号 + 进度条 + 日期 */}
          <div className="c-order-center">
            <span className="c-order-no">{order.orderNo}</span>
            <div className="c-order-bar-wrap">
              <div className="c-order-bar" style={{ width: `${prog}%`, background: riskColor }} />
            </div>
            <div className="c-order-dates">
              <span>下单 {fmtD(order.createTime)}</span>
              <span>交期 {fmtD(order.plannedEndDate)}</span>
            </div>
          </div>
          {/* 右：进度% + 天数 */}
          <div className="c-order-right">
            <span className="c-order-pct" style={{ color: riskColor }}>{prog}%</span>
            {daysLeft !== null && (
              <span className="c-order-days" style={{
                color: daysLeft < 0 ? '#ff4136' : daysLeft <= 3 ? '#f7a600' : '#3ab870',
              }}>
                {daysLeft < 0 ? `逾${-daysLeft}d` : `${daysLeft}d`}
              </span>
            )}
          </div>
        </div>
      </div>
    </Popover>
  );
};

/* ─── 通用自动滚动容器：悬停暂停，离开续滚（无缝循环版）─── */
// 只有内容高度 > 容器高度时才渲染复本并启动滚动，避免短列表重复显示
const AutoScrollBox: React.FC<{
  children: React.ReactNode;
  className?: string;
  speed?: number;  // px/s，默认 28
}> = ({ children, className = '', speed = 28 }) => {
  const outerRef    = useRef<HTMLDivElement>(null);
  const pausedRef   = useRef(false);
  const rafRef      = useRef<number>(0);
  const lastTsRef   = useRef<number>(0);
  const lastSHRef   = useRef(0);
  const [showClone, setShowClone] = useState(false);

  // 每次渲染后测量：单份内容高度是否超出容器
  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    // showClone 时 scrollHeight = 2x，除以 2 得单份高度
    const singleH = el.scrollHeight / (showClone ? 2 : 1);
    if (el.scrollHeight === lastSHRef.current) return; // 未变化，跳过防抖
    lastSHRef.current = el.scrollHeight;
    const needed = singleH > el.clientHeight;
    if (needed !== showClone) setShowClone(needed);
  });

  // 只在需要滚动时才启动 rAF
  useEffect(() => {
    const el = outerRef.current;
    if (!el || !showClone) return;

    const tick = (ts: number) => {
      if (lastTsRef.current === 0) lastTsRef.current = ts;
      const delta = ts - lastTsRef.current;
      lastTsRef.current = ts;

      if (!pausedRef.current) {
        const halfH = el.scrollHeight / 2;
        if (halfH > el.clientHeight) {
          el.scrollTop += speed * delta / 1000;
          if (el.scrollTop >= halfH) el.scrollTop -= halfH;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(rafRef.current); lastTsRef.current = 0; };
  }, [speed, showClone]);

  return (
    <div
      ref={outerRef}
      className={`c-auto-scroll ${className}`}
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; lastTsRef.current = 0; }}
    >
      <div>{children}</div>
      {showClone && <div aria-hidden="true">{children}</div>}
    </div>
  );
};

const OrderScrollPanel: React.FC<{ orders: ProductionOrder[] }> = ({ orders }) => (
  <div className="c-card c-breathe-green">
    <div className="c-card-title">
      <LiveDot size={7} />
      活跃订单实时滚动
      <span className="c-card-badge cyan-badge">{orders.length} 单进行中</span>
      <span style={{ marginLeft: 'auto', fontSize: 10, color: '#1e3348', letterSpacing: 0 }}>悬停暂停 · 离开续滚 →</span>
    </div>
    <AutoScrollBox className="c-orders-scroll">
      {orders.map(o => <OrderRow key={String(o.id)} order={o} />)}
      {!orders.length && <div className="c-empty">暂无进行中订单</div>}
    </AutoScrollBox>
  </div>
);

/* ─── 工厂卡点行（与 OrderRow 同款布局）─── */
const BottleneckRow: React.FC<{ item: FactoryBottleneckItem }> = ({ item }) => {
  const c = item.stuckPct < 20 ? '#ff4136' : item.stuckPct < 50 ? '#f7a600' : '#39ff14';
  return (
    <div className="c-order-row">
      <div className="c-order-row-main">
        {/* 左：工厂名（与活跃订单同款列宽，不截断） */}
        <span className="c-order-factory">{item.factoryName}</span>
        {/* 中：三行结构与 OrderRow 完全一致 */}
        <div className="c-order-center">
          {/* 第一行：卡点工序 + 订单数（对应订单号位置） */}
          <span className="c-order-no" style={{ color: c }}>
            卡在 {item.stuckStage}&nbsp;·&nbsp;{item.orderCount} 单
          </span>
          {/* 第二行：进度条 */}
          <div className="c-order-bar-wrap">
            <div className="c-order-bar" style={{ width: `${item.stuckPct}%`, background: c }} />
          </div>
          {/* 第三行：最差订单号（对应日期位置） */}
          <div className="c-order-dates">
            {item.worstOrders.slice(0, 2).map(w => (
              <span key={w.orderNo}>{w.orderNo}</span>
            ))}
          </div>
        </div>
        {/* 右：百分比（与活跃订单完全一致） */}
        <div className="c-order-right">
          <span className="c-order-pct" style={{ color: c }}>{item.stuckPct}%</span>
        </div>
      </div>
    </div>
  );
};

/* ─── 数据 hook ─── */
interface CockpitData {
  pulse:   LivePulseResponse | null;
  health:  HealthIndexResponse | null;
  notify:  SmartNotificationResponse | null;
  workers: WorkerEfficiencyResponse | null;
  heatmap: DefectHeatmapResponse | null;
  ranking: FactoryLeaderboardResponse | null;
  shortage: MaterialShortageResult | null;
  healing: SelfHealingResponse | null;
  bottleneck: FactoryBottleneckItem[] | null;
  orders: ProductionOrder[];
  loading: boolean;
  ts: number;
}

function useCockpit() {
  const { user, isAuthenticated } = useAuth();
  const [data, setData] = useState<CockpitData>({
    pulse: null, health: null, notify: null, workers: null,
    heatmap: null, ranking: null, shortage: null, healing: null, bottleneck: null, orders: [], loading: true, ts: 0,
  });
  const load = useCallback(async () => {
    setData(d => ({ ...d, loading: true }));
    const [rPulse, rHealth, rNotify, rWorkers, rHeatmap, rRanking, rShortage, rHealing, rBottleneck, rOrders] =
      await Promise.allSettled([
        intelligenceApi.getLivePulse(), intelligenceApi.getHealthIndex(),
        intelligenceApi.getSmartNotifications(), intelligenceApi.getWorkerEfficiency(),
        intelligenceApi.getDefectHeatmap(), intelligenceApi.getFactoryLeaderboard(),
        intelligenceApi.getMaterialShortage(), intelligenceApi.runSelfHealing(),
        intelligenceApi.getFactoryBottleneck(),
        productionOrderApi.list({ pageSize: 50 } as any),
      ]);
    const v = <T,>(r: PromiseSettledResult<{ code: number; data: T } | T>): T | null =>
      r.status === 'fulfilled' ? ((r.value as any)?.data ?? (r.value as T)) : null;
    const orderResult: ProductionOrder[] = rOrders.status === 'fulfilled'
      ? ((rOrders.value as any)?.data?.records ?? (rOrders.value as any)?.records ?? [])
      : [];
    setData({
      pulse: v(rPulse), health: v(rHealth), notify: v(rNotify), workers: v(rWorkers),
      heatmap: v(rHeatmap), ranking: v(rRanking), shortage: v(rShortage), healing: v(rHealing),
      bottleneck: v(rBottleneck),
      orders: orderResult.filter(o => o.status !== 'completed'), loading: false, ts: Date.now(),
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  /* ── 10 秒快刷：仅更新实时脉搏（今日扫码/速率/在线数），比全量 30s 刷新更有实时感 ── */
  const fetchPulseOnly = useCallback(async () => {
    try {
      const res = await intelligenceApi.getLivePulse();
      const newPulse = (res as any)?.data ?? res;
      if (newPulse) setData(prev => ({ ...prev, pulse: newPulse }));
    } catch { /* silent */ }
  }, []);
  useEffect(() => {
    const t = setInterval(fetchPulseOnly, 10_000);
    return () => clearInterval(t);
  }, [fetchPulseOnly]);

  /* ── WebSocket: 扫码事件 → todayScanQty 立刻跳 + 2s 防抖刷新工厂心跳 ── */
  const { subscribe } = useWebSocket({
    userId: user?.id,
    enabled: isAuthenticated && !!user?.id,
  });
  const wsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return subscribe('scan:realtime', (msg: WsMessage) => {
      const qty: number = (msg.payload as any)?.quantity ?? 0;
      // 立即把扫码件数累加到大字 KPI → AnimatedNum ↑ 跳
      if (qty > 0) {
        setData(prev => {
          if (!prev.pulse) return prev;
          return { ...prev, pulse: { ...prev.pulse, todayScanQty: prev.pulse.todayScanQty + qty } };
        });
      }
      // 防抖 2s：等连续扫码平息后，一次拉取最新 factoryActivity（工厂圆点变绿）
      if (wsDebounceRef.current) clearTimeout(wsDebounceRef.current);
      wsDebounceRef.current = setTimeout(() => fetchPulseOnly(), 2000);
    });
  }, [subscribe, fetchPulseOnly]);

  /* ── 每分钟本地递增 minutesSinceLastScan / minutesSilent，让时间在轮询间隙自然流逝 ── */
  useEffect(() => {
    const t = setInterval(() => {
      setData(prev => {
        if (!prev.pulse) return prev;
        return {
          ...prev,
          pulse: {
            ...prev.pulse,
            factoryActivity: (prev.pulse.factoryActivity ?? []).map(f => ({
              ...f,
              minutesSinceLastScan: f.minutesSinceLastScan + 1,
              active: (f.minutesSinceLastScan + 1) < 30,
            })),
            stagnantFactories: (prev.pulse.stagnantFactories ?? []).map(sf => ({
              ...sf,
              minutesSilent: sf.minutesSilent + 1,
            })),
          },
        };
      });
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  return { data, reload: load };
}

const medalColor = ['#ffd700', '#c0c0c0', '#cd7f32'];

/* ═══════════════════════════════════════════════════
   主页面组件
═══════════════════════════════════════════════════ */
/* ─── 数字飞升动画组件 ─── */
const AnimatedNum: React.FC<{ val: number | string; color?: string; className?: string }> = ({ val, color, className }) => {
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

const IntelligenceCenter: React.FC = () => {
  const { data, reload } = useCockpit();
  const [countdown, setCountdown]   = useState(30);
  const [now, setNow]               = useState(new Date());
  const [chatQ, setChatQ]           = useState('');
  const [chatA, setChatA]           = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [aiAdvisorReady, setAiAdvisorReady] = useState<boolean>(true);
  const [nlQ, setNlQ]               = useState('');
  const [nlResult, setNlResult]     = useState<NlQueryResponse | null>(null);
  const [nlLoading, setNlLoading]   = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [kpiFlash, setKpiFlash] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rootRef  = useRef<HTMLDivElement>(null);

  /* KPI 刷新闪光：data.ts 每次全量刷新完成后更新，触发各 KPI 卡短暂氖灯闪光 */
  useEffect(() => {
    if (!data.ts) return;
    setKpiFlash(true);
    const t = setTimeout(() => setKpiFlash(false), 900);
    return () => clearTimeout(t);
  }, [data.ts]);

  /* 全屏：F 键切换 */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        if (!document.fullscreenElement) {
          rootRef.current?.requestFullscreen?.();
          setIsFullscreen(true);
        } else {
          document.exitFullscreen?.();
          setIsFullscreen(false);
        }
      }
    };
    const fsChange = () => setIsFullscreen(!!document.fullscreenElement);
    window.addEventListener('keydown', handler);
    document.addEventListener('fullscreenchange', fsChange);
    return () => {
      window.removeEventListener('keydown', handler);
      document.removeEventListener('fullscreenchange', fsChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      rootRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  /* 秒计时：倒计时 + 时钟 */
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setNow(new Date());
      setCountdown(c => { if (c <= 1) { reload(); return 30; } return c - 1; });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [reload]);

  const handleReload = () => { reload(); setCountdown(30); };

  /* ai-advisor 状态预检 */
  useEffect(() => {
    intelligenceApi.getAiAdvisorStatus()
      .then(r => setAiAdvisorReady((r as any)?.data?.enabled ?? true))
      .catch(() => setAiAdvisorReady(false));
  }, []);

  const handleChat = async () => {
    if (!chatQ.trim()) return;
    if (!aiAdvisorReady) { setChatA('AI 顾问服务当前不可用，请稍后再试。'); return; }
    setChatLoading(true); setChatA('');
    try {
      const res = await intelligenceApi.aiAdvisorChat(chatQ) as any;
      setChatA(res?.data?.answer || res?.answer || '暂无回复');
    } catch { setChatA('AI 服务暂不可用，请稍后重试。'); }
    finally { setChatLoading(false); }
  };

  const handleNlQuery = async (q?: string) => {
    const query = (q ?? nlQ).trim();
    if (!query) return;
    if (q) setNlQ(q);
    setNlLoading(true); setNlResult(null);
    try {
      const res = await intelligenceApi.nlQuery({ question: query }) as any;
      setNlResult(res?.data ?? res);
    } catch { setNlResult(null); }
    finally { setNlLoading(false); }
  };

  const { pulse, health, notify, workers, heatmap, ranking, shortage, healing, bottleneck, orders } = data;

  /* ── 逾期 & 延期风险订单（纯前端推导，无需额外接口） ── */
  const overdueRisk = useMemo(() => {
    const overdue: typeof orders = [];
    const highRisk: typeof orders = [];
    const watch: typeof orders = [];
    for (const o of orders) {
      const prog = Number(o.productionProgress) || 0;
      const daysLeft = o.plannedEndDate
        ? Math.ceil((new Date(o.plannedEndDate).getTime() - Date.now()) / 86400000)
        : null;
      if (daysLeft !== null && daysLeft < 0)                        overdue.push(o);
      else if (daysLeft !== null && daysLeft <= 7 && prog < 50)     highRisk.push(o);
      else if (daysLeft !== null && daysLeft <= 14 && prog < 30)    watch.push(o);
    }
    return { overdue, highRisk, watch };
  }, [orders]);

  /* ── 工厂卡点分析：来自后端真实扫码统计（替代旧的从未写入的 *CompletionRate 字段） ── */
  const factoryBottleneck = bottleneck ?? [];

  /* 派生警报数量 */
  const alertCount = (pulse?.stagnantFactories?.length ?? 0) + (shortage?.shortageItems?.length ?? 0);
  const healWarnCount = healing?.items?.filter(i => i.status !== 'OK' && !i.autoFixed).length ?? 0;
  const totalWarn = alertCount + healWarnCount + (notify?.pendingCount ?? 0);

  /* 格式化时钟 */
  const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });
  const dateStr = now.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' });

  /* ── 跑马灯：紧急订单（预留，暂未渲染）── */
  const _tickerItems = useMemo(() => {
    const items: string[] = [];
    overdueRisk.overdue.forEach(o => {
      const d = o.plannedEndDate ? Math.abs(Math.ceil((new Date(o.plannedEndDate).getTime() - Date.now()) / 86400000)) : 0;
      items.push(`⚠ ${o.orderNo} · ${o.factoryName ?? '—'} · 已逾期 ${d} 天 · 进度 ${Number(o.productionProgress)||0}%`);
    });
    overdueRisk.highRisk.forEach(o => {
      const d = o.plannedEndDate ? Math.ceil((new Date(o.plannedEndDate).getTime() - Date.now()) / 86400000) : 0;
      items.push(`🔴 ${o.orderNo} · ${o.factoryName ?? '—'} · 剩 ${d} 天 · 进度 ${Number(o.productionProgress)||0}%`);
    });
    return items;
  }, [overdueRisk]);

  /* ── 各 KPI 卡片悬浮详情内容 ── */
  const hourNow = Math.max(now.getHours(), 1);
  const projectedToday = ((pulse?.scanRatePerHour ?? 0) * (24 - hourNow) + (pulse?.todayScanQty ?? 0));

  const scanPop = (
    <KpiPop
      title="今日扫码详情"
      items={[
        { label: '扫码总量',  value: `${pulse?.todayScanQty?.toLocaleString() ?? '—'} 件`, color: '#00e5ff' },
        { label: '实时速率',  value: `${pulse?.scanRatePerHour ?? '—'} 件/时` },
        { label: '在线员工',  value: `${pulse?.activeWorkers ?? '—'} 人` },
        { label: '活跃工厂',  value: `${pulse?.activeFactories ?? '—'} 家` },
        ...(pulse?.timeline?.length ? [{ label: '最新采样点', value: pulse.timeline[pulse.timeline.length - 1]?.time.slice(-5) }] : []),
      ]}
      aiTip={pulse ? `按当前速率，今日预计完成 ${projectedToday.toLocaleString()} 件` : undefined}
    />
  );

  const factoryPop = (
    <KpiPop
      title="工厂在线状态"
      items={[
        { label: '活跃工厂',  value: `${pulse?.activeFactories ?? '—'} 家`, color: '#39ff14' },
        { label: '在线员工',  value: `${pulse?.activeWorkers ?? '—'} 人` },
        { label: '停工预警',  value: `${pulse?.stagnantFactories?.length ?? 0} 家`, color: (pulse?.stagnantFactories?.length ?? 0) > 0 ? '#ff4136' : '#39ff14' },
        ...(ranking?.rankings?.slice(0, 3).map((r, i) => ({
          label: (['🥇 ', '🥈 ', '🥉 '][i] ?? '') + r.factoryName,
          value: `${r.totalScore} 分`,
          color: (['#ffd700', '#c0c0c0', '#cd7f32'][i] as string | undefined),
        })) ?? []),
      ]}
      aiTip="高产工厂建议持续跟踪，停工工厂建议立即联系确认"
    />
  );

  const healthPop = (
    <KpiPop
      title="供应链健康分析"
      items={[
        { label: '健康指数',  value: `${health?.healthIndex ?? '—'} 分`, color: grade2color(health?.grade ?? '') },
        { label: '评级',      value: `${health?.grade ?? '—'} 级`,       color: grade2color(health?.grade ?? '') },
        { label: '异常项目',  value: `${healing?.issuesFound ?? 0} 项`,  color: (healing?.issuesFound ?? 0) > 0 ? '#f7a600' : '#39ff14' },
        { label: '自愈健康',  value: `${healing?.healthScore ?? '—'} 分` },
      ]}
      aiTip={health?.grade === 'A' ? '系统运行优秀，继续保持' : health?.grade === 'B' ? '整体良好，关注预警项' : '建议立即处理异常，提升供应链健康'}
    />
  );

  const stagnantPop = (
    <KpiPop
      title="停工预警详情"
      items={pulse?.stagnantFactories?.length
        ? pulse.stagnantFactories.slice(0, 5).map(f => ({
            label: f.factoryName,
            value: `停滞 ${Math.floor(f.minutesSilent / 60)}h ${Math.round(f.minutesSilent % 60)}m`,
            color: '#ff4136',
          }))
        : [{ label: '状态', value: '所有工厂正常运转', color: '#39ff14' }]}
      warning={(pulse?.stagnantFactories?.length ?? 0) > 0 ? '建议 15 分钟内联系工厂确认原因' : undefined}
      aiTip={(pulse?.stagnantFactories?.length ?? 0) > 0
        ? `${pulse!.stagnantFactories.length} 家工厂停工，订单交付风险上升，建议立即介入`
        : '停工率 0%，生产节拍正常，供应链健康'}
    />
  );

  const shortagePop = (
    <KpiPop
      title="面料缺口预警"
      items={shortage?.shortageItems?.length
        ? shortage.shortageItems.slice(0, 5).map(item => ({
            label: item.materialName,
            value: `缺 ${item.shortageQuantity} ${item.unit}`,
            color: risk2color(item.riskLevel),
          }))
        : [{ label: '状态', value: '所有面辅料库存充足', color: '#39ff14' }]}
      warning={(shortage?.shortageItems?.length ?? 0) > 0 ? (shortage?.summary ?? undefined) : undefined}
      aiTip={(shortage?.shortageItems?.length ?? 0) > 0
        ? 'HIGH 级缺料将影响 3 天内生产，建议立即下补采购单'
        : '面辅料储备率良好，暂无补单压力'}
    />
  );

  const notifyPop = (
    <KpiPop
      title="智能通知概况"
      items={[
        { label: '待发送', value: `${notify?.pendingCount ?? '—'} 条`, color: '#a78bfa' },
        { label: '今日已发', value: `${notify?.sentToday ?? 0} 条` },
        { label: '通知命中率', value: notify?.sentToday
          ? `${Math.round(Math.min(100, ((notify.sentToday) / Math.max(notify.sentToday + (notify.pendingCount ?? 0), 1)) * 100))}%`
          : '—' },
      ]}
      aiTip={`待处理 ${notify?.pendingCount ?? 0} 条，建议及时下发确保工厂按时接收指令`}
    />
  );

  return (
    <Layout>
      <div className={`cockpit-root${isFullscreen ? ' cockpit-fullscreen' : ''}`} ref={rootRef}>

        {/* ╔══════════════════════════════════════════════╗
            ║   顶栏  标题 · 时钟 · 系统状态 · 刷新      ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-header">
          {/* 左：LIVE + 标题 */}
          <div className="cockpit-header-left">
            <LiveDot size={10} />
            <span className="cockpit-badge-live">LIVE</span>
            <ThunderboltOutlined style={{ color: '#00e5ff', fontSize: 18 }} />
            <span className="cockpit-title">智能运营驾驶舱</span>
            <span className="cockpit-subtitle">全链路实时指挥 · AI 决策引擎</span>
          </div>

          {/* 中：实时时钟 */}
          <div className="cockpit-clock">
            <span className="cockpit-time">{timeStr}</span>
            <span className="cockpit-date">{dateStr}</span>
          </div>

          {/* 右：告警数 + 系统状态 + 刷新 */}
          <div className="cockpit-header-right">
            {totalWarn > 0
              ? <span className="cockpit-alert-badge">
                  <WarningOutlined />
                  {totalWarn} 项预警
                </span>
              : <span className="cockpit-ok-badge">
                  <CheckCircleOutlined />
                  系统正常
                </span>
            }
            <Tooltip title={`${countdown}s 后自动刷新`}>
              <button className="cockpit-refresh-btn" onClick={handleReload} disabled={data.loading}>
                <SyncOutlined spin={data.loading} />
                {data.loading ? '加载中' : `${countdown}s`}
              </button>
            </Tooltip>
            <Tooltip title={isFullscreen ? '退出全屏 (F)' : '全屏投屏 (F)'}>
              <button className="cockpit-fs-btn" onClick={toggleFullscreen}>
                {isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              </button>
            </Tooltip>
          </div>
        </div>

        {/* 刷新倒计时进度条：从 100% 线性消耗到 0%，reload 后复位 */}
        <div className="cockpit-refresh-bar">
          <div className="cockpit-refresh-bar-fill" style={{ width: `${(countdown / 30) * 100}%` }} />
        </div>

        {/* 紧急预警跑马灯：逾期 & 高风险订单滚动提示（有数据时才渲染） */}
        {_tickerItems.length > 0 && (
          <div className="cockpit-ticker">
            <span className="cockpit-ticker-label">⚠ 紧急预警</span>
            <div className="cockpit-ticker-track">
              <div className="cockpit-ticker-inner"
                style={{ animationDuration: `${Math.max(12, _tickerItems.length * 5)}s` }}>
                {[..._tickerItems, ..._tickerItems].map((item, i) => (
                  <span key={i} className="cockpit-ticker-item">{item}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ╔══════════════════════════════════════════════╗
            ║   第一行：6 大核心 KPI 闪光数字卡            ║
            ╚══════════════════════════════════════════════╝ */}
        <div className={`cockpit-grid-6${kpiFlash ? ' kpi-flash' : ''}`}>

          {/* 今日生产扫码量 */}
          <Popover overlayClassName="cockpit-kpi-pop" placement="bottom" content={scanPop} mouseEnterDelay={0.15} mouseLeaveDelay={0.1} getPopupContainer={() => rootRef.current || document.body}>
          <div className="c-card c-kpi c-kpi-hoverable">
            <div className="c-kpi-label"><LiveDot size={7} />今日扫码量</div>
            <div className="c-kpi-val cyan neon-cyan"><AnimatedNum val={pulse?.todayScanQty?.toLocaleString() ?? '—'} /></div>
            <div className="c-kpi-unit">件</div>
            <div className="c-kpi-sub">速率&nbsp;<b style={{ color: '#00e5ff' }}><AnimatedNum val={pulse?.scanRatePerHour ?? '—'} /></b>&nbsp;件/时</div>
            <div className="c-kpi-hover-hint">悬停查看详情 ↑</div>
          </div>
          </Popover>

          {/* 活跃工厂 */}
          <Popover overlayClassName="cockpit-kpi-pop" placement="bottom" content={factoryPop} mouseEnterDelay={0.15} mouseLeaveDelay={0.1} getPopupContainer={() => rootRef.current || document.body}>
          <div className="c-card c-kpi c-kpi-hoverable">
            <div className="c-kpi-label"><LiveDot size={7} />活跃工厂</div>
            <div className="c-kpi-val green neon-green"><AnimatedNum val={pulse?.activeFactories ?? '—'} /></div>
            <div className="c-kpi-unit">家</div>
            <div className="c-kpi-sub">员工&nbsp;<b style={{ color: '#39ff14' }}><AnimatedNum val={pulse?.activeWorkers ?? '—'} /></b>&nbsp;人在线</div>
            <div className="c-kpi-hover-hint">悬停查看详情 ↑</div>
          </div>
          </Popover>

          {/* 供应链健康 */}
          <Popover overlayClassName="cockpit-kpi-pop" placement="bottom" content={healthPop} mouseEnterDelay={0.15} mouseLeaveDelay={0.1} getPopupContainer={() => rootRef.current || document.body}>
          <div className="c-card c-kpi c-kpi-hoverable">
            <div className="c-kpi-label"><LiveDot size={7} color={grade2color(health?.grade ?? '')} />供应链健康</div>
            <div className="c-kpi-val" style={{ color: grade2color(health?.grade ?? ''), textShadow: `0 0 18px ${grade2color(health?.grade ?? '')}88` }}>
              <AnimatedNum val={health?.healthIndex ?? '—'} />
            </div>
            <div className="c-kpi-unit">分</div>
            <div className="c-kpi-sub">等级&nbsp;<b style={{ color: grade2color(health?.grade ?? '') }}>{health?.grade ?? '—'}&nbsp;级</b></div>
            <div className="c-kpi-hover-hint">悬停查看详情 ↑</div>
          </div>
          </Popover>

          {/* 停工预警 */}
          <Popover overlayClassName="cockpit-kpi-pop" placement="bottom" content={stagnantPop} mouseEnterDelay={0.15} mouseLeaveDelay={0.1} getPopupContainer={() => rootRef.current || document.body}>
          <div className={`c-card c-kpi c-kpi-hoverable ${(pulse?.stagnantFactories?.length ?? 0) > 0 ? 'c-kpi-danger' : ''}`}>
            <div className="c-kpi-label">
              <LiveDot size={7} color={(pulse?.stagnantFactories?.length ?? 0) > 0 ? '#ff4136' : '#39ff14'} />
              停工预警
            </div>
            <div className="c-kpi-val" style={{ color: (pulse?.stagnantFactories?.length ?? 0) > 0 ? '#ff4136' : '#39ff14' }}>
              <AnimatedNum val={pulse?.stagnantFactories?.length ?? 0} />
            </div>
            <div className="c-kpi-unit">家停滞</div>
            <div className="c-kpi-sub">
              {(pulse?.stagnantFactories?.length ?? 0) > 0
                ? <span className="blink-text">⚠️ 需立即处理</span>
                : '生产运转正常'}
            </div>
            <div className="c-kpi-hover-hint">悬停查看详情 ↑</div>
          </div>
          </Popover>

          {/* 面料缺口 */}
          <Popover overlayClassName="cockpit-kpi-pop" placement="bottom" content={shortagePop} mouseEnterDelay={0.15} mouseLeaveDelay={0.1} getPopupContainer={() => rootRef.current || document.body}>
          <div className={`c-card c-kpi c-kpi-hoverable ${(shortage?.shortageItems?.length ?? 0) > 0 ? 'c-kpi-warn' : ''}`}>
            <div className="c-kpi-label">
              <LiveDot size={7} color={(shortage?.shortageItems?.length ?? 0) > 0 ? '#f7a600' : '#39ff14'} />
              面料缺口
            </div>
            <div className="c-kpi-val" style={{ color: (shortage?.shortageItems?.length ?? 0) > 0 ? '#f7a600' : '#39ff14' }}>
              <AnimatedNum val={shortage?.shortageItems?.length ?? 0} />
            </div>
            <div className="c-kpi-unit">项缺料</div>
            <div className="c-kpi-sub">
              {(shortage?.shortageItems?.length ?? 0) > 0
                ? <span style={{ color: '#f7a600' }}>⚡ 请及时补单</span>
                : '库存储备充足'}
            </div>
            <div className="c-kpi-hover-hint">悬停查看详情 ↑</div>
          </div>
          </Popover>

          {/* 待处理通知 */}
          <Popover overlayClassName="cockpit-kpi-pop" placement="bottom" content={notifyPop} mouseEnterDelay={0.15} mouseLeaveDelay={0.1} getPopupContainer={() => rootRef.current || document.body}>
          <div className="c-card c-kpi c-kpi-hoverable">
            <div className="c-kpi-label"><LiveDot size={7} color="#7c4dff" />待处理通知</div>
            <div className="c-kpi-val purple"><AnimatedNum val={notify?.pendingCount ?? '—'} /></div>
            <div className="c-kpi-unit">条待发</div>
            <div className="c-kpi-sub">今日已发&nbsp;<b style={{ color: '#7c4dff' }}><AnimatedNum val={notify?.sentToday ?? 0} /></b>&nbsp;条</div>
            <div className="c-kpi-hover-hint">悬停查看详情 ↑</div>
          </div>
          </Popover>

        </div>

        {/* ╔══════════════════════════════════════════════╗
            ║   第二行：实时生产脉搏(左) + 人效实时动态(右) ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-grid-2">

          {/* 实时生产脉搏 */}
          <div className="c-card c-scanline-card">
            <div className="c-card-title">
              <LiveDot />
              实时生产脉搏
              <span className="c-card-badge cyan-badge">{pulse?.scanRatePerHour ?? 0} 件/时</span>
            </div>
            <div style={{ margin: '6px 0 4px' }}>
              <Sparkline pts={(pulse?.timeline ?? []).map(p => Number(p.count) || 0)} color="#00e5ff" width={340} height={52} />
              <div className="c-sparkline-label">
                {(pulse?.timeline ?? []).map((p, i) => <span key={i}>{p.time.slice(-5)}</span>)}
              </div>
            </div>
            {/* 各工厂活跃状态 — 动态展示哪个工厂在扫码 */}
            {(pulse?.factoryActivity?.length ?? 0) > 0 ? (
              <div className="c-factory-activity-list">
                {pulse!.factoryActivity.map(f => {
                  const mins = f.minutesSinceLastScan;
                  const timeStr = mins < 1 ? '刚刚' : mins < 60 ? `${mins}分钟前` : `${Math.floor(mins/60)}h${mins%60}m前`;
                  return (
                    <div key={f.factoryName} className={`c-factory-activity-row${f.active ? '' : ' inactive'}`}>
                      <span className="c-fa-dot" style={{ background: f.active ? '#39ff14' : mins < 90 ? '#f7a600' : '#ff4136' }} />
                      <span className="c-fa-name">{f.factoryName}</span>
                      <span className="c-fa-time" style={{ color: f.active ? '#39ff14' : mins < 90 ? '#f7a600' : '#ff4136' }}>{timeStr}</span>
                      <span className="c-fa-qty">{f.todayQty.toLocaleString()}<em>件</em></span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="c-all-ok">
                <CheckCircleOutlined style={{ marginRight: 6 }} />
                今日暂无扫码记录
              </div>
            )}
            {/* WebSocket 驱动的实时扫码事件流，有扫码时自动出现 */}
            <LiveScanFeed />
          </div>

          {/* 人效实时动态 */}
          <div className="c-card">
            <div className="c-card-title">
              <LiveDot size={7} />
              人效实时动态
            </div>
            <table className="c-table">
              <thead>
                <tr><th>姓名</th><th>速度</th><th>质量</th><th>稳定</th><th>多能</th><th>出勤</th><th>综合</th><th>评级</th></tr>
              </thead>
              <tbody>
                {workers?.workers?.slice(0, 7).map(w => (
                  <tr key={w.workerName ?? w.workerId}>
                    <td>{w.workerName}</td>
                    <td style={{ color: w.speedScore >= 80 ? '#39ff14' : '#f7a600' }}>{w.speedScore}</td>
                    <td style={{ color: w.qualityScore >= 80 ? '#39ff14' : '#f7a600' }}>{w.qualityScore}</td>
                    <td>{w.stabilityScore}</td>
                    <td>{w.versatilityScore}</td>
                    <td>{w.attendanceScore}</td>
                    <td><b style={{ color: '#00e5ff' }}>{w.overallScore}</b></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {(() => {
                        const grd = w.overallScore >= 85 ? { g: 'A', c: '#39ff14' }
                          : w.overallScore >= 70 ? { g: 'B', c: '#00e5ff' }
                          : w.overallScore >= 55 ? { g: 'C', c: '#f7a600' }
                          : { g: 'D', c: '#ff4136' };
                        return (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <b style={{ color: grd.c, border: `1px solid ${grd.c}55`, padding: '0 3px', borderRadius: 3, fontSize: 10 }}>{grd.g}</b>
                            {w.trend === 'UP' ? '📈' : w.trend === 'DOWN' ? '📉' : '➡️'}
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                )) ?? <tr><td colSpan={8} className="c-empty-td">暂无数据</td></tr>}
              </tbody>
            </table>
          </div>

        </div>

        {/* ╔══════════════════════════════════════════════╗
            ║   第三行：活跃订单实时滚动 + 工厂工序卡点 + 逾期&延期风险订单 ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-grid-3">

          {/* 活跃订单实时滚动面板（左侧） */}
          <OrderScrollPanel orders={orders} />

          {/* 工厂卡点分析 */}
          <div className="c-card c-breathe-cyan">
            <div className="c-card-title">
              <LiveDot size={7} color="#00e5ff" />
              工厂工序卡点
              <span className="c-card-badge cyan-badge">{factoryBottleneck.length} 家工厂</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: '#1e3348', letterSpacing: 0 }}>悬停暂停 · 离开续滚 →</span>
            </div>
            <AutoScrollBox className="c-orders-scroll">
              {factoryBottleneck.map(f => <BottleneckRow key={f.factoryName} item={f} />)}
              {!factoryBottleneck.length && <div className="c-empty">暂无在制订单</div>}
            </AutoScrollBox>
          </div>

          {/* 逾期 & 预计延期订单 */}
          <div className="c-card c-breathe-red">
            <div className="c-card-title">
              <LiveDot color={overdueRisk.overdue.length > 0 ? '#ff4136' : '#f7a600'} />
              逾期 &amp; 延期风险订单
              {overdueRisk.overdue.length > 0 && (
                <span className="c-card-badge" style={{ background: 'rgba(255,65,54,0.15)', color: '#ff4136', borderColor: '#ff413644' }}>
                  逾期 {overdueRisk.overdue.length} 单
                </span>
              )}
              {overdueRisk.highRisk.length > 0 && (
                <span className="c-card-badge" style={{ background: 'rgba(247,166,0,0.12)', color: '#f7a600', borderColor: '#f7a60044' }}>
                  高风险 {overdueRisk.highRisk.length} 单
                </span>
              )}
            </div>
            {overdueRisk.overdue.length === 0 && overdueRisk.highRisk.length === 0 && overdueRisk.watch.length === 0 ? (
              <div className="c-all-ok"><CheckCircleOutlined style={{ marginRight: 6 }} />所有订单均在健康交期内</div>
            ) : (
              <AutoScrollBox className="c-risk-list">
                {overdueRisk.overdue.map(o => {
                  const d = Math.ceil((new Date(o.plannedEndDate!).getTime() - Date.now()) / 86400000);
                  return (
                    <div key={String(o.id)} className="c-risk-row">
                      <span className="c-risk-badge" style={{ color: '#ff4136', borderColor: '#ff413655' }}>逾{-d}天</span>
                      <span className="c-risk-order">{o.orderNo}</span>
                      <span className="c-risk-factory">{o.factoryName}</span>
                      <span className="c-risk-prog" style={{ color: '#ff4136' }}>{Number(o.productionProgress)||0}%</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: '#ff4136', flexShrink: 0, fontWeight: 600 }}>📞 立即联系</span>
                    </div>
                  );
                })}
                {overdueRisk.highRisk.map(o => {
                  const d = Math.ceil((new Date(o.plannedEndDate!).getTime() - Date.now()) / 86400000);
                  return (
                    <div key={String(o.id)} className="c-risk-row">
                      <span className="c-risk-badge" style={{ color: '#f7a600', borderColor: '#f7a60055' }}>剩{d}天</span>
                      <span className="c-risk-order">{o.orderNo}</span>
                      <span className="c-risk-factory">{o.factoryName}</span>
                      <span className="c-risk-prog" style={{ color: '#f7a600' }}>{Number(o.productionProgress)||0}%</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: '#f7a600', flexShrink: 0, fontWeight: 600 }}>⚡ 加急协调</span>
                    </div>
                  );
                })}
                {overdueRisk.watch.map(o => {
                  const d = Math.ceil((new Date(o.plannedEndDate!).getTime() - Date.now()) / 86400000);
                  return (
                    <div key={String(o.id)} className="c-risk-row">
                      <span className="c-risk-badge" style={{ color: '#3a8aff', borderColor: '#3a8aff55' }}>关注{d}d</span>
                      <span className="c-risk-order">{o.orderNo}</span>
                      <span className="c-risk-factory">{o.factoryName}</span>
                      <span className="c-risk-prog" style={{ color: '#3a8aff' }}>{Number(o.productionProgress)||0}%</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: '#3a8aff', flexShrink: 0 }}>👁 持续关注</span>
                    </div>
                  );
                })}
              </AutoScrollBox>
            )}
          </div>

        </div>

        {/* ╔══════════════════════════════════════════════╗
            ║   监控：面料缺口 + 缺陷热力图                ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-grid-5-7">

          {/* 面料缺口预警 */}
          <div className="c-card">
            <div className="c-card-title">
              <LiveDot color={(shortage?.shortageItems?.length ?? 0) > 0 ? '#f7a600' : '#39ff14'} />
              面料 &amp; 辅料缺口预警
            </div>
            {shortage?.shortageItems?.length ? (
              shortage.shortageItems.slice(0, 6).map(item => (
                <div key={item.materialCode} className="c-shortage-row">
                  <span className="c-shortage-risk" style={{ color: risk2color(item.riskLevel), borderColor: risk2color(item.riskLevel) }}>
                    {item.riskLevel}
                  </span>
                  <span className="c-shortage-name">{item.materialName}</span>
                  <span className="c-shortage-qty">缺&nbsp;{item.shortageQuantity}&nbsp;{item.unit}</span>
                  <span style={{
                    marginLeft: 'auto', fontSize: 10, flexShrink: 0, fontWeight: 600,
                    color: item.riskLevel === 'HIGH' ? '#ff4136' : item.riskLevel === 'MEDIUM' ? '#f7a600' : '#39ff14',
                  }}>
                    {item.riskLevel === 'HIGH' ? '⚠ 库存严重不足' : item.riskLevel === 'MEDIUM' ? '库存偏紧' : '适量补充'}
                  </span>
                </div>
              ))
            ) : (
              <div className="c-all-ok">
                <CheckCircleOutlined style={{ marginRight: 6 }} />
                所有面辅料库存充足
              </div>
            )}
            {shortage?.summary && <div className="c-summary">{shortage.summary}</div>}
          </div>

          {/* 缺陷热力图 */}
          <div className="c-card">
            <div className="c-card-title">
              <LiveDot size={7} color={(heatmap?.totalDefects ?? 0) > 0 ? '#ff4136' : '#39ff14'} />
              质量缺陷热力图
              {heatmap && (
                <span className="c-card-badge red-badge">
                  总缺陷 {heatmap.totalDefects}
                </span>
              )}
            </div>
            {heatmap?.cells?.length ? (
              <>
                <div className="c-heatmap-meta">
                  风险工序：<b style={{ color: '#ff4136' }}>{heatmap.worstProcess}</b>
                  &nbsp;·&nbsp;风险工厂：<b style={{ color: '#ff4136' }}>{heatmap.worstFactory}</b>
                </div>
                <div className="c-heatmap-grid" style={{ gridTemplateColumns: `52px repeat(${heatmap.factories.length}, 1fr)` }}>
                  <div />
                  {heatmap.factories.map(f => (
                    <Tooltip key={f} title={f} placement="top">
                      <div className="c-heat-head">{f}</div>
                    </Tooltip>
                  ))}
                  {heatmap.processes.map(proc => (
                    <React.Fragment key={proc}>
                      <div className="c-heat-row-label">{proc}</div>
                      {heatmap.factories.map(fac => {
                        const cell = heatmap.cells.find(c => c.process === proc && c.factory === fac);
                        const alpha = cell ? Math.min(cell.intensity, 0.9) : 0;
                        return (
                          <div key={fac} className="c-heat-cell"
                            style={{ background: `rgba(255,65,54,${alpha})`, color: alpha > 0.45 ? '#fff' : '#444' }}>
                            {cell?.defectCount || ''}
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </>
            ) : <div className="c-empty">暂无缺陷数据</div>}
          </div>

        </div>

        {/* ╔══════════════════════════════════════════════╗
            ║   系统异常自愈诊断(左) + 工厂绩效排行榜(右)  ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-grid-2">

          {/* 异常自愈诊断 */}
          <div className="c-card">
            <div className="c-card-title">
              <LiveDot size={7} color={healing && healing.healthScore < 80 ? '#d48806' : '#73d13d'} />
              系统异常自愈诊断
              {healing && (
                <span className="c-card-badge" style={{
                  background: healing.healthScore >= 80 ? 'rgba(82,196,26,0.12)' : 'rgba(212,137,6,0.12)',
                  color: healing.healthScore >= 80 ? '#73d13d' : '#d48806',
                  borderColor: healing.healthScore >= 80 ? '#73d13d55' : '#d4880655',
                }}>
                  健康 <AnimatedNum val={healing.healthScore} /> 分 · 发现 <AnimatedNum val={healing.issuesFound} /> 项
                </span>
              )}
            </div>
            {healing?.items?.length ? (
              healing.items.slice(0, 7).map((item, i) => (
                <div key={i} className="c-heal-item">
                  <span className={`c-heal-dot ${item.status === 'OK' ? 'dot-ok' : item.autoFixed ? 'dot-fixed' : 'dot-warn'}`} />
                  <span className="c-heal-name">{item.checkName}</span>
                  <span className="c-heal-detail">{item.detail}</span>
                  <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    {item.autoFixed
                      ? <Tag style={{ fontSize: 11, background: '#1677ff22', color: '#4096ff', borderColor: '#4096ff55' }}>已自修</Tag>
                      : item.status !== 'OK'
                        ? <Tag style={{ fontSize: 11, background: '#d4880622', color: '#d48806', borderColor: '#d4880655' }}>需处理</Tag>
                        : <Tag style={{ fontSize: 11, background: '#52c41a22', color: '#73d13d', borderColor: '#73d13d55' }}>正常</Tag>
                    }
                  </span>
                </div>
              ))
            ) : <div className="c-empty">暂无诊断数据</div>}
          </div>

          {/* 工厂绩效排行 */}
          <div className="c-card">
            <div className="c-card-title">
              <LiveDot size={7} color="#ffd700" />
              工厂绩效排行榜
              <span className="c-card-badge purple-badge">实时评分</span>
            </div>
            {ranking?.rankings?.length ? (
              ranking.rankings.slice(0, 5).map((r, i) => (
                <div key={r.factoryId} className="c-rank-row">
                  <span className="c-rank-medal" style={{ color: medalColor[i] ?? '#7a8999' }}>
                    {i < 3 ? ['🥇','🥈','🥉'][i] : `#${r.rank}`}
                  </span>
                  <span className="c-rank-name">{r.factoryName}</span>
                  <div className="c-rank-bar-wrap">
                    <div className="c-rank-bar" style={{ width: `${r.totalScore}%`, background: i === 0 ? 'linear-gradient(90deg,#ffd700,#f7a600)' : 'linear-gradient(90deg,#00e5ff,#0098aa)' }} />
                  </div>
                  <span className="c-rank-score"><AnimatedNum val={r.totalScore} /></span>
                </div>
              ))
            ) : <div className="c-empty">暂无排行数据</div>}
          </div>

        </div>

        {/* ╔══════════════════════════════════════════════╗
            ║   MindPush 主动推送中枢                      ║
            ╚══════════════════════════════════════════════╝ */}
        <div style={{ margin: '4px 24px 0', padding: '5px 14px', background: 'rgba(255,140,0,0.04)', border: '1px solid rgba(255,140,0,0.15)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#ff8c00', fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>🔔 MindPush 主动推送</span>
          <span style={{ fontSize: 11, color: '#4a6d8a' }}>交期风险 · 停滞预警 · 工资提醒 — 系统主动触达</span>
        </div>
        <div style={{ padding: '0 24px 8px' }}>
          <MindPushPanel />
        </div>

        {/* ╔══════════════════════════════════════════════╗
            ║   运营工具：智能派工 + AI 排程建议           ║
            ╚══════════════════════════════════════════════╝ */}
        <div style={{ margin: '4px 24px 0', padding: '5px 14px', background: 'rgba(255,215,0,0.04)', border: '1px solid rgba(255,215,0,0.12)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#ffd700', fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>⚡ AI 运营工具</span>
          <span style={{ fontSize: 11, color: '#4a6d8a' }}>智能派工 · AI排程 — 日常高频使用</span>
        </div>
        <div className="cockpit-grid-2">
          <SmartAssignmentPanel />
          <SchedulingSuggestionPanel />
        </div>

        {/* ╔══════════════════════════════════════════════╗
            ║   深度分析：工人画像 + 生产节奏DNA           ║
            ╚══════════════════════════════════════════════╝ */}
        <div style={{ margin: '4px 24px 0', padding: '5px 14px', background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#00e5ff', fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>🔬 深度分析</span>
          <span style={{ fontSize: 11, color: '#4a6d8a' }}>工人能力画像 · 节奏DNA可视化 — 按需查阅</span>
        </div>
        <div className="cockpit-grid-2">
          <WorkerProfilePanel />
          <RhythmDnaPanel />
        </div>

        {/* AI学习进化报告（最底部，技术性指标） */}
        <div style={{ margin: '4px 24px 0', padding: '5px 14px', background: 'rgba(57,255,20,0.02)', border: '1px solid rgba(57,255,20,0.08)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#39ff14', fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>📊 AI 自学报告</span>
          <span style={{ fontSize: 11, color: '#4a6d8a' }}>模型进化 · 预测准确率 — 技术指标参考</span>
        </div>
        <div style={{ padding: '0 24px 12px' }}>
          <LearningReportPanel />
        </div>

        {/* ╔════════════════════════════════════════════╗
            ║ 底部：利润/完工双引擎(左) + AI智能顾问(右)  ║
            ╚════════════════════════════════════════════╝ */}
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 0, padding: '0 24px 28px', alignItems: 'stretch' }}>
          {/* 左：利润估算&完工预测 */}
          <div style={{ paddingRight: 6 }}>
            <ProfitDeliveryPanel />
          </div>
          {/* 右：AI 智能顾问 */}
          <div style={{ paddingLeft: 6 }}>
            <div className="c-card c-chat-card" style={{ height: '100%' }}>
              <div className="c-card-title" style={{ marginBottom: 10 }}>
                <RobotOutlined style={{ marginRight: 7, color: '#a78bfa', fontSize: 16 }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#c4b5fd' }}>AI 智能顾问</span>
                <LiveDot size={7} color="#a78bfa" />
              </div>

              {/* ai-advisor 服务状态警告 */}
              {!aiAdvisorReady && (
                <div style={{ fontSize: 10, color: '#f7a600', background: 'rgba(247,166,0,0.08)',
                  border: '1px solid rgba(247,166,0,0.25)', borderRadius: 4,
                  padding: '4px 8px', marginBottom: 8 }}>
                  ⚠ AI 顾问服务当前不可用，数据查询功能正常
                </div>
              )}

              {/* 自然语言数据查询区 */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: '#4a6d8a', marginBottom: 5 }}>📊 数据快查（自然语言）</div>
                <div className="c-chat-row" style={{ marginBottom: 4 }}>
                  <Input
                    size="small"
                    className="c-chat-input"
                    placeholder="查本周逾期 / 哪个工厂效率最低？"
                    value={nlQ}
                    onChange={e => setNlQ(e.target.value)}
                    onPressEnter={() => handleNlQuery()}
                  />
                  <Button size="small" type="default" loading={nlLoading}
                    onClick={() => handleNlQuery()} className="c-chat-send"
                    style={{ borderColor: '#4a5a8a', color: '#a0b0d0' }}>查</Button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {['本周逾期订单', '效率最低工厂', '面料库存缺口', '今日扫码异常'].map(q => (
                    <button key={q} className="c-suggest-btn"
                      style={{ fontSize: 9, padding: '1px 5px' }}
                      onClick={() => handleNlQuery(q)}>{q}</button>
                  ))}
                </div>
                {nlLoading && <div style={{ fontSize: 10, color: '#4a6d8a', paddingTop: 4 }}>⌛ 查询中...</div>}
                {nlResult && (
                  <div style={{ fontSize: 11, color: '#c4b5fd', marginTop: 5,
                    padding: '5px 8px', background: 'rgba(100,80,200,0.08)',
                    borderRadius: 4, border: '1px solid rgba(100,80,200,0.2)', lineHeight: 1.6 }}>
                    {nlResult.answer}
                    {nlResult.confidence !== undefined && (
                      <span style={{ fontSize: 9, color: '#4a5a7a', marginLeft: 6 }}>
                        置信度 {Math.round(nlResult.confidence * 100)}%
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: '#4a6d8a', marginBottom: 5 }}>💬 AI 对话（深度分析）</div>
                <div style={{ fontSize: 11, color: '#3a5060', marginBottom: 6 }}
                  >直接问询生产、订单、库存、财务任何问题</div>
              </div>
              <div className="c-chat-row" style={{ marginBottom: 8 }}>
                <Input
                  className="c-chat-input"
                  placeholder="例如：今天哪个工厂效率最高？面料缺口怎么处理？"
                  value={chatQ}
                  onChange={e => setChatQ(e.target.value)}
                  onPressEnter={handleChat}
                />
                <Button type="primary" icon={<SendOutlined />} loading={chatLoading}
                  onClick={handleChat} className="c-chat-send">发送</Button>
              </div>
              {chatLoading && (
                <div className="c-chat-thinking">
                  <DashboardOutlined spin style={{ marginRight: 6 }} />
                  AI 正在分析...
                </div>
              )}
              {chatA && <div className="c-chat-answer" style={{ fontSize: 12 }}>{chatA}</div>}
              <div className="c-chat-suggestions" style={{ marginTop: 'auto', paddingTop: 8 }}>
                {['今日生产进度如何？', '有哪些订单停工？', '面料库存是否充足？', '本月工厂绩效？', '异常订单处理吗？'].map(q => (
                  <button key={q} className="c-suggest-btn" onClick={() => setChatQ(q)}>{q}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </Layout>
  );
};

export default IntelligenceCenter;
