import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Popover } from 'antd';
import { UpOutlined, DownOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type {
  BottleneckDetectionResponse, DeliveryRiskResponse, DeliveryRiskItem,
  AnomalyItem, DefectTraceResponse, FactoryBottleneckItem,
} from '@/services/intelligence/intelligenceApi';
import type { ProductionOrder } from '@/types/production';
import { calcOrderProgress } from '@/modules/production/utils/calcOrderProgress';
import {
  LiveDot, sev2c, risk2badge,
  STAGE_FIELDS, getAiTip, fmtD,
} from './IntelligenceWidgets';

/* ═══════════════════════════════════════════════════
   OrderPop — 悬浮订单卡片（4 个智能 API 懒加载）
═══════════════════════════════════════════════════ */

const OrderPop: React.FC<{ order: ProductionOrder }> = ({ order }) => {
  const prog = calcOrderProgress(order);
  const daysLeft = order.plannedEndDate
    ? Math.ceil((new Date(order.plannedEndDate).getTime() - Date.now()) / 86400000)
    : null;
  const aiTip = getAiTip(prog, daysLeft);

  const [intel, setIntel] = useState<{
    bottleneck:  BottleneckDetectionResponse | null;
    riskItem:    DeliveryRiskItem | null;
    anomalies:   AnomalyItem[];
    defectTrace: DefectTraceResponse | null;
    loading:     boolean;
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
      const bottleneckRaw: any =
        rB.status === 'fulfilled' ? ((rB.value as any)?.data ?? null) : null;
      const bottleneck: BottleneckDetectionResponse | null = bottleneckRaw ? {
        ...bottleneckRaw,
        items: bottleneckRaw.items || bottleneckRaw.bottlenecks || []
      } : null;
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
      {/* 头部：订单号 + 风险强度 + 剩余天数 */}
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
              {daysLeft < 0 ? ` 逾期${-daysLeft}天` : daysLeft === 0 ? '今日交货' : `剩 ${daysLeft} 天`}
            </span>
          )}
        </div>
      </div>

      {/* 概要 */}
      <div className="order-pop-meta">
        <span> {order.factoryName}</span>
        <span> {order.styleName}</span>
        <span> {order.orderQuantity} 件</span>
      </div>

      {/* 5 个工序进度条 */}
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

      {/* 工序瓶颈检测 */}
      {!intel.loading && intel.bottleneck?.hasBottleneck && (
        <div style={{ margin: '8px 0 6px', padding: '6px 8px',
          background: 'rgba(255,65,54,0.04)', borderRadius: 5,
          border: '1px solid rgba(255,65,54,0.15)' }}>
          <div style={{ fontSize: 10, color: '#ff4136', fontWeight: 700,
            marginBottom: 5, letterSpacing: 0.5 }}> 工序瓶颈 Top{intel.bottleneck.items.length > 1 ? '2' : '1'}</div>
          {intel.bottleneck.items.slice(0, 2).map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center',
              gap: 6, marginBottom: i < 1 ? 3 : 0, fontSize: 11 }}>
              <span style={{ color: sev2c(b.severity), fontWeight: 700, minWidth: 34 }}>{b.stageName}</span>
              <span style={{ color: '#7aaec8', flex: 1 }}>积压 {b.backlog} 件</span>
              <span style={{ color: sev2c(b.severity), fontSize: 10,
                border: `1px solid ${sev2c(b.severity)}44`, padding: '0 4px', borderRadius: 3 }}>
                {b.severity === 'critical' ? '严重' : b.severity === 'warning' ? '预警' : '正常'}
              </span>
            </div>
          ))}
          {intel.bottleneck.items[0]?.suggestion && (
            <div style={{ fontSize: 10, color: '#8ab4c8', marginTop: 5, lineHeight: 1.5 }}>
               {intel.bottleneck.items[0].suggestion}
            </div>
          )}
        </div>
      )}

      {/* 交期风险评估 */}
      {!intel.loading && intel.riskItem && (
        <div style={{ marginBottom: 6, padding: '6px 8px',
          background: `${risk2badge(intel.riskItem.riskLevel).color}08`,
          borderRadius: 5, border: `1px solid ${risk2badge(intel.riskItem.riskLevel).color}22` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: risk2badge(intel.riskItem.riskLevel).color,
              fontWeight: 700 }}> 交期风险评估</span>
            <span style={{ fontSize: 10, color: '#7aaec8' }}>
              预测: {intel.riskItem.predictedEndDate?.slice(0, 10) ?? '--'}
            </span>
          </div>
          <div style={{ fontSize: 10, color: '#8ab4c8', lineHeight: 1.55 }}>
            {intel.riskItem.riskDescription}
          </div>
          {(intel.riskItem.requiredDailyOutput || intel.riskItem.currentDailyOutput) ? (
            <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10 }}>
              <span style={{ color: '#7aaec8' }}>日产需 <b style={{ color: '#f7a600' }}>{intel.riskItem.requiredDailyOutput}</b> 件</span>
              <span style={{ color: '#7aaec8' }}>当前 <b style={{ color: '#00e5ff' }}>{intel.riskItem.currentDailyOutput}</b> 件</span>
            </div>
          ) : null}
        </div>
      )}

      {/* 异常行为检测 */}
      {!intel.loading && intel.anomalies.length > 0 && (
        <div style={{ marginBottom: 6, padding: '6px 8px',
          background: 'rgba(255,200,0,0.04)', borderRadius: 5,
          border: '1px solid rgba(255,200,0,0.12)' }}>
          <div style={{ fontSize: 10, color: '#f7a600', fontWeight: 700, marginBottom: 4 }}>
             异常行为 ({intel.anomalies.length})
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
      {!intel.loading && intel.anomalies.length === 0 && (
        <div style={{ marginBottom: 6, padding: '5px 8px',
          background: 'rgba(57,255,20,0.03)', borderRadius: 5,
          border: '1px solid rgba(57,255,20,0.10)', fontSize: 10, color: '#5a9a6a' }}>
           暂无异常行为
        </div>
      )}

      {/* 加载中占位符 */}
      {intel.loading && (
        <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 10, color: '#4a8aaa' }}>
          ⁙ 智能分析中...
        </div>
      )}

      {/* 缺陷溯源分析 */}
      {!intel.loading && intel.defectTrace && (
        <div style={{ marginBottom: 6, padding: '6px 8px',
          background: 'rgba(180,80,255,0.05)', borderRadius: 5,
          border: '1px solid rgba(180,80,255,0.18)' }}>
          <div style={{ fontSize: 10, color: '#c084fc', fontWeight: 700, marginBottom: 4 }}> 缺陷溯源</div>
          {intel.defectTrace.workers?.slice(0, 2).map((w, i) => (
            <div key={i} style={{ fontSize: 10, color: '#a78bfa', marginBottom: 2 }}>
               {w.operatorName}：缺陷率 <b style={{ color: '#f472b6' }}>{(w.defectRate * 100).toFixed(1)}%</b>
              {w.worstProcess ? ` · ${w.worstProcess}` : ''}
            </div>
          ))}
          {intel.defectTrace.hotProcesses?.slice(0, 1).map((p, i) => (
            <div key={i} style={{ fontSize: 10, color: '#818cf8', marginTop: 2 }}>
               高发工序：{p.processName}（{p.defectCount} 件）
            </div>
          ))}
          {intel.defectTrace.overallDefectRate !== undefined && (
            <div style={{ fontSize: 10, color: '#9d87c0', marginTop: 4 }}> 总缺陷率：{(intel.defectTrace.overallDefectRate * 100).toFixed(1)}%（{intel.defectTrace.totalDefects} 件/{intel.defectTrace.totalScans} 件）</div>
          )}
        </div>
      )}

      {/* AI 整体建议 */}
      <div className="order-pop-ai"> AI：{aiTip}</div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════
   OrderRow — 单行订单（Popover 包裹 OrderPop）
═══════════════════════════════════════════════════ */

const OrderRow: React.FC<{ order: ProductionOrder }> = ({ order }) => {
  const prog = calcOrderProgress(order);
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
          <span className="c-order-factory">{order.factoryName ?? '—'}</span>
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

/* ═══════════════════════════════════════════════════
   AutoScrollBox — 通用自动滚动容器（悬停暂停，无缝循环）
═══════════════════════════════════════════════════ */

export const AutoScrollBox: React.FC<{
  children: React.ReactNode;
  className?: string;
  speed?: number;
}> = ({ children, className = '', speed = 28 }) => {
  const outerRef  = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const rafRef    = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const lastSHRef = useRef(0);
  const [showClone, setShowClone] = useState(false);

  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const singleH = el.scrollHeight / (showClone ? 2 : 1);
    if (el.scrollHeight === lastSHRef.current) return;
    lastSHRef.current = el.scrollHeight;
    const needed = singleH > el.clientHeight;
    if (needed !== showClone) setShowClone(needed);
  });

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
    <div ref={outerRef} className={`c-auto-scroll ${className}`}
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; lastTsRef.current = 0; }}
    >
      <div>{children}</div>
      {showClone && <div aria-hidden="true">{children}</div>}
    </div>
  );
};

/* ═══════════════════════════════════════════════════
   OrderScrollPanel — 活跃订单实时滚动面板
═══════════════════════════════════════════════════ */

export const OrderScrollPanel: React.FC<{
  orders: ProductionOrder[];
  collapsed?: boolean;
  onToggle?: () => void;
}> = ({ orders, collapsed = false, onToggle }) => (
  <div className="c-card c-breathe-green">
    <div className="c-card-title" style={{ cursor: onToggle ? 'pointer' : undefined }} onClick={onToggle}>
      <LiveDot size={7} />
      活跃订单实时滚动
      <span className="c-card-badge cyan-badge">{orders.length} 单进行中</span>
      <span style={{ fontSize: 10, color: '#4a8aaa', letterSpacing: 0 }}>悬停暂停 · 离开续滚 →</span>
      {onToggle && (
        <span
          style={{ marginLeft: 'auto', cursor: 'pointer', color: collapsed ? '#a78bfa' : '#5a7a9a', fontSize: 12, padding: '0 4px', display: 'inline-flex', alignItems: 'center', flexShrink: 0, userSelect: 'none' }}
          title={collapsed ? '展开面板' : '收起面板'}
        >
          {collapsed ? <DownOutlined /> : <UpOutlined />}
        </span>
      )}
    </div>
    <div style={{ overflow: 'hidden', maxHeight: collapsed ? 0 : 600, transition: 'max-height 0.28s ease' }}>
      <AutoScrollBox className="c-orders-scroll">
        {orders.map(o => <OrderRow key={String(o.id)} order={o} />)}
        {!orders.length && <div className="c-empty">暂无进行中订单</div>}
      </AutoScrollBox>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════
   BottleneckRow — 工厂工序卡点行
═══════════════════════════════════════════════════ */

export const BottleneckRow: React.FC<{ item: FactoryBottleneckItem }> = ({ item }) => {
  const navigate = useNavigate();
  const c = item.stuckPct < 20 ? '#ff4136' : item.stuckPct < 50 ? '#f7a600' : '#39ff14';
  const focusNode = String(item.stuckStage || '').trim();
  const primaryOrderNo = String(item.worstOrders?.[0]?.orderNo || '').trim();

  const openOrder = (orderNo?: string) => {
    const safeOrderNo = String(orderNo || '').trim();
    if (!safeOrderNo) return;
    const query = new URLSearchParams({ orderNo: safeOrderNo });
    if (focusNode) query.set('focusNode', focusNode);
    navigate(`/production/progress-detail?${query.toString()}`);
  };

  return (
    <div
      className={`c-order-row c-bottleneck-row-clickable${primaryOrderNo ? ' clickable' : ''}`}
      role={primaryOrderNo ? 'button' : undefined}
      tabIndex={primaryOrderNo ? 0 : -1}
      onClick={() => openOrder(primaryOrderNo)}
      onKeyDown={(event) => {
        if (!primaryOrderNo) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openOrder(primaryOrderNo);
        }
      }}
      title={primaryOrderNo ? `打开 ${primaryOrderNo} 查看 ${focusNode || '工序'} 卡点` : undefined}
    >
      <div className="c-order-row-main">
        <span className="c-order-factory">{item.factoryName}</span>
        <div className="c-order-center">
          <span className="c-order-no" style={{ color: c }}>
            卡在 {item.stuckStage}&nbsp;·&nbsp;{item.stuckOrderCount ?? (item.worstOrders || []).length} 单
          </span>
          <div className="c-order-bar-wrap">
            <div className="c-order-bar" style={{ width: `${item.stuckPct}%`, background: c }} />
          </div>
          <div className="c-order-dates">
            {(item.worstOrders || []).slice(0, 2).map(w => (
              <button
                key={w.orderNo}
                type="button"
                className="c-order-chip-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  openOrder(w.orderNo);
                }}
                title={`打开 ${w.orderNo}`}
              >
                {w.orderNo}
              </button>
            ))}
          </div>
        </div>
        <div className="c-order-right">
          <span className="c-order-pct" style={{ color: c }}>{item.stuckPct}%</span>
        </div>
      </div>
    </div>
  );
};
