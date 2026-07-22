import React, { useState, useEffect } from 'react';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type {
  BottleneckDetectionResponse, DeliveryRiskResponse, DeliveryRiskItem,
  AnomalyItem, DefectTraceResponse,
} from '@/services/intelligence/intelligenceApi';
import type { ProductionOrder } from '@/types/production';
import { calcOrderProgress } from '@/modules/production/utils/calcOrderProgress';
import {
  sev2c, risk2badge,
  STAGE_FIELDS, getAiTip,
} from '../IntelligenceWidgets';

export const OrderPop: React.FC<{ order: ProductionOrder }> = ({ order }) => {
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
      <div className="order-pop-header">
        <span className="order-pop-no">{order.orderNo}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {intel.riskItem && (() => {
            const b = risk2badge(intel.riskItem.riskLevel);
            return (
              <span style={{ fontSize: 14, fontWeight: 700, color: b.color,
                border: `1px solid ${b.color}55`, padding: '1px 6px', borderRadius: 3 }}>
                {b.label}
              </span>
            );
          })()}
          {daysLeft !== null && (
            <span className="order-pop-days" style={{
              color: daysLeft < 0 ? '#e03030' : daysLeft <= 3 ? '#f7a600' : '#39ff14',
            }}>
              {daysLeft < 0 ? ` 逾期${-daysLeft}天` : daysLeft === 0 ? '今日交货' : `剩 ${daysLeft} 天`}
            </span>
          )}
        </div>
      </div>

      <div className="order-pop-meta">
        <span> {order.factoryName}</span>
        <span> {order.styleName}</span>
        <span> {order.orderQuantity} 件</span>
      </div>

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

      {!intel.loading && intel.bottleneck?.hasBottleneck && (
        <div style={{ margin: '8px 0 6px', padding: '6px 8px',
          background: 'rgba(224,48,48,0.04)', borderRadius: 5,
          border: '1px solid rgba(224,48,48,0.15)' }}>
          <div style={{ fontSize: 14, color: '#e03030', fontWeight: 700,
            marginBottom: 5, letterSpacing: 0.5 }}> 工序瓶颈 Top{intel.bottleneck.items.length > 1 ? '2' : '1'}</div>
          {intel.bottleneck.items.slice(0, 2).map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center',
              gap: 6, marginBottom: i < 1 ? 3 : 0, fontSize: 14 }}>
              <span style={{ color: sev2c(b.severity), fontWeight: 700, minWidth: 34 }}>{b.stageName}</span>
              <span style={{ color: '#7aaec8', flex: 1 }}>积压 {b.backlog} 件</span>
              <span style={{ color: sev2c(b.severity), fontSize: 14,
                border: `1px solid ${sev2c(b.severity)}44`, padding: '0 4px', borderRadius: 3 }}>
                {b.severity === 'critical' ? '严重' : b.severity === 'warning' ? '预警' : '正常'}
              </span>
            </div>
          ))}
          {intel.bottleneck.items[0]?.suggestion && (
            <div style={{ fontSize: 14, color: '#8ab4c8', marginTop: 5, lineHeight: 1.5 }}>
               {intel.bottleneck.items[0].suggestion}
            </div>
          )}
        </div>
      )}

      {!intel.loading && intel.riskItem && (
        <div style={{ marginBottom: 6, padding: '6px 8px',
          background: `${risk2badge(intel.riskItem.riskLevel).color}08`,
          borderRadius: 5, border: `1px solid ${risk2badge(intel.riskItem.riskLevel).color}22` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 14, color: risk2badge(intel.riskItem.riskLevel).color,
              fontWeight: 700 }}> 交期风险评估</span>
            <span style={{ fontSize: 14, color: '#7aaec8' }}>
              预测: {intel.riskItem.predictedEndDate?.slice(0, 10) ?? '--'}
            </span>
          </div>
          <div style={{ fontSize: 14, color: '#8ab4c8', lineHeight: 1.55 }}>
            {intel.riskItem.riskDescription}
          </div>
          {(intel.riskItem.requiredDailyOutput || intel.riskItem.currentDailyOutput) ? (
            <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 14 }}>
              <span style={{ color: '#7aaec8' }}>日产需 <b style={{ color: '#f7a600' }}>{intel.riskItem.requiredDailyOutput}</b> 件</span>
              <span style={{ color: '#7aaec8' }}>当前 <b style={{ color: '#00e5ff' }}>{intel.riskItem.currentDailyOutput}</b> 件</span>
            </div>
          ) : null}
        </div>
      )}

      {!intel.loading && intel.anomalies.length > 0 && (
        <div style={{ marginBottom: 6, padding: '6px 8px',
          background: 'rgba(255,200,0,0.04)', borderRadius: 5,
          border: '1px solid rgba(255,200,0,0.12)' }}>
          <div style={{ fontSize: 14, color: '#f7a600', fontWeight: 700, marginBottom: 4 }}>
             异常行为 ({intel.anomalies.length})
          </div>
          {intel.anomalies.map((a, i) => (
            <div key={i} style={{
              fontSize: 14, lineHeight: 1.5, marginBottom: i < intel.anomalies.length - 1 ? 3 : 0,
              color: ({ critical: '#e03030', warning: '#f7a600', info: '#00e5ff' } as Record<string, string>)[a.severity] ?? '#888',
            }}>
              · <b>{a.title}</b>: {a.description}
            </div>
          ))}
        </div>
      )}
      {!intel.loading && intel.anomalies.length === 0 && (
        <div style={{ marginBottom: 6, padding: '5px 8px',
          background: 'rgba(57,255,20,0.03)', borderRadius: 5,
          border: '1px solid rgba(57,255,20,0.10)', fontSize: 14, color: '#5a9a6a' }}>
           暂无异常行为
        </div>
      )}

      {intel.loading && (
        <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 14, color: '#4a8aaa' }}>
          ⁙ 智能分析中...
        </div>
      )}

      {!intel.loading && intel.defectTrace && (
        <div style={{ marginBottom: 6, padding: '6px 8px',
          background: 'rgba(180,80,255,0.05)', borderRadius: 5,
          border: '1px solid rgba(180,80,255,0.18)' }}>
          <div style={{ fontSize: 14, color: '#c084fc', fontWeight: 700, marginBottom: 4 }}> 缺陷溯源</div>
          {intel.defectTrace.workers?.slice(0, 2).map((w, i) => (
            <div key={i} style={{ fontSize: 14, color: '#a78bfa', marginBottom: 2 }}>
               {w.operatorName}：缺陷率 <b style={{ color: '#f472b6' }}>{(w.defectRate * 100).toFixed(1)}%</b>
              {w.worstProcess ? ` · ${w.worstProcess}` : ''}
            </div>
          ))}
          {intel.defectTrace.hotProcesses?.slice(0, 1).map((p, i) => (
            <div key={i} style={{ fontSize: 14, color: '#818cf8', marginTop: 2 }}>
               高发工序：{p.processName}（{p.defectCount} 件）
            </div>
          ))}
          {intel.defectTrace.overallDefectRate !== undefined && (
            <div style={{ fontSize: 14, color: '#9d87c0', marginTop: 4 }}> 总缺陷率：{(intel.defectTrace.overallDefectRate * 100).toFixed(1)}%（{intel.defectTrace.totalDefects} 件/{intel.defectTrace.totalScans} 件）</div>
          )}
        </div>
      )}

      <div className="order-pop-ai"> AI：{aiTip}</div>
    </div>
  );
};
