import React from 'react';
import { Tooltip, Badge } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import type { ProductionOrder } from '@/types/production';
import type { DeliveryRiskItem } from '@/services/intelligence/intelligenceApi';
import { isOrderFrozenByStatus } from '@/utils/api';
import LiquidProgressBar from '@/components/common/LiquidProgressBar';
import { getProcessesByNodeFromOrder } from '../../ProgressDetail/utils';

export const PROGRESS_CELL_BASE: React.CSSProperties = { padding: '4px', transition: 'background 0.2s' };
export const COUNT_TEXT_STYLE: React.CSSProperties = { fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px', textAlign: 'center' };

export function hasSecondaryProcessForOrder(record: ProductionOrder): boolean {
  if ((record as any).hasSecondaryProcess) return true;
  if ((record as any).secondaryProcessStartTime || (record as any).secondaryProcessEndTime) return true;
  const nodes = record.progressNodeUnitPrices;
  if (!Array.isArray(nodes) || nodes.length === 0) return false;
  return nodes.some((n: any) => {
    if (String(n.parentNode || '').trim() === '二次工艺') return true;
    return false;
  });
}

export function getNodeProcessList(record: ProductionOrder, nodeName: string): { name: string; unitPrice?: number; processCode?: string }[] {
  const byParent = getProcessesByNodeFromOrder(record);
  if (nodeName === '二次工艺') {
    const exactChildren = byParent['二次工艺'] || [];
    const STD_STAGES = new Set(['采购', '裁剪', '车缝', '尾部', '入库', '二次工艺']);
    const orphanChildren = Object.entries(byParent)
      .filter(([stage]) => !STD_STAGES.has(stage))
      .flatMap(([, nodes]) => nodes || []);
    return [...exactChildren, ...orphanChildren].map(c => ({ name: c.name, unitPrice: c.unitPrice, processCode: c.processCode }));
  }
  let children = byParent[nodeName];
  if (!children?.length) {
    const CHINESE_STAGE_MAP: Record<string, string[]> = {
      '裁剪': ['裁剪'],
      '车缝': ['车缝', '整件', '缝制', '缝纫'],
      '尾部': ['尾部', '整烫', '剪线', '包装', '质检'],
      '入库': ['入库', '质检入库'],
      '采购': ['采购', '物料', '备料'],
      '二次工艺': ['二次工艺', '绣花', '印花'],
    };
    const altNames = CHINESE_STAGE_MAP[nodeName] || [];
    for (const alt of altNames) {
      if (byParent[alt]?.length) {
        children = byParent[alt];
        break;
      }
    }
  }
  return children?.length ? children.map(c => ({ name: c.name, unitPrice: c.unitPrice, processCode: c.processCode })) : [];
}

export interface StageProgressContext {
  openNodeDetail?: (record: ProductionOrder, nodeType: string, nodeName: string, stats?: { done: number; total: number; percent: number; remaining: number }, unitPrice?: number, processList?: { name: string; unitPrice?: number; processCode?: string }[]) => void;
  openProcessDetail: (record: ProductionOrder, type: string) => void;
  renderCompletionTimeTag: (record: ProductionOrder, stage: string, rate: number, position?: string) => React.ReactNode;
}

export function renderStageProgressCell(
  rate: number,
  record: ProductionOrder,
  nodeType: string,
  nodeName: string,
  ctx: StageProgressContext,
) {
  const total = Number(record.cuttingQuantity || record.orderQuantity) || 0;
  const completed = Math.round((rate || 0) * total / 100);
  const percent = rate || 0;
  const frozen = isOrderFrozenByStatus(record);
  const isCompletedOrClosed = record.status === 'completed' || String(record.status || '') === 'closed';
  const colorStatus = isCompletedOrClosed ? 'normal' : (frozen ? 'default' : 'normal');

  return (
    <div
      style={{ ...PROGRESS_CELL_BASE, cursor: frozen ? 'default' : 'pointer', opacity: isCompletedOrClosed ? 0.75 : (frozen ? 0.6 : 1) }}
      onClick={(e) => {
        e.stopPropagation();
        if (frozen) return;
        if (ctx.openNodeDetail) {
          const processList = getNodeProcessList(record, nodeName);
          ctx.openNodeDetail(record, nodeType, nodeName, { done: completed, total, percent, remaining: Math.max(0, total - completed) }, undefined, processList);
        } else {
          ctx.openProcessDetail(record, nodeType);
        }
      }}
      onMouseEnter={(e) => { if (!frozen) e.currentTarget.style.background = 'var(--color-bg-subtle)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
    >
      {ctx.renderCompletionTimeTag(record, nodeName, percent)}
      <div style={COUNT_TEXT_STYLE}>{completed}/{total}</div>
      <LiquidProgressBar percent={percent} width="100%" height={16} status={colorStatus} />
    </div>
  );
}

export function renderAiRiskBadge(aiRisk: DeliveryRiskItem | undefined, orderNo: string, deliveryRiskMap?: Map<string, DeliveryRiskItem>) {
  const risk = aiRisk || deliveryRiskMap?.get(orderNo);
  if (!risk || risk.riskLevel === 'safe') return null;
  return risk;
}

export function renderStagnantBadge(stagnantDays: number | undefined) {
  if (stagnantDays === undefined) return null;
  return (
    <div className="stagnant-pulse-badge" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span className="stagnant-pulse-dot" />
      <span>停滞 {stagnantDays} 天</span>
    </div>
  );
}

export function renderSlaStatus(record: ProductionOrder) {
  const slaMap: Record<string, { color: string; text: string }> = {
    on_track: { color: '#52c41a', text: '正常' },
    at_risk: { color: '#faad14', text: '预警' },
    breached: { color: '#ff4d4f', text: '超期' },
    completed: { color: '#1890ff', text: '达标' },
  };
  const sla = slaMap[record.deliverySlaStatus || ''] || null;
  if (!sla) return null;
  return (
    <span style={{ fontSize: 10, fontWeight: 600, color: sla.color }}>
      SLA: {sla.text}{record.actualDeliveryDays != null ? ` ${record.actualDeliveryDays}天` : ''}
    </span>
  );
}

export function renderMerchandiserCell(v: any, record: ProductionOrder, onOpenRemark?: (record: ProductionOrder, defaultRole?: string) => void) {
  const name = String(v || '').trim();
  const remark = String((record as unknown as Record<string, unknown>).remarks || '').trim();
  const tsMatch = remark.match(/^\[(\d{2}-\d{2} \d{2}:\d{2})\]\s*/);
  const remarkTime = tsMatch ? tsMatch[1] : '';
  const remarkBody = tsMatch ? remark.slice(tsMatch[0].length) : remark;

  return (
    <div
      style={{ position: 'relative', lineHeight: 1.3, cursor: 'pointer' }}
      onClick={() => onOpenRemark?.(record, '跟单员 — ' + name)}
    >
      {remarkTime && (
        <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 2 }}>
          {remarkTime}
        </div>
      )}
      <Tooltip title={remark ? `备注：${remark}` : '点击添加备注'} placement="top">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontWeight: 500, color: '#1f2937' }}>{name || '-'}</span>
          {remark && (
            <Badge dot color="var(--color-text-tertiary)" offset={[0, -2]}>
              <ExclamationCircleOutlined style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }} />
            </Badge>
          )}
        </div>
      </Tooltip>
      {remarkBody && (
        <Tooltip title={remarkBody} placement="bottom">
          <div style={{
            fontSize: 10, color: 'var(--color-text-secondary)', fontWeight: 500, lineHeight: 1.2, marginTop: 2,
            maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {remarkBody.length > 6 ? remarkBody.substring(0, 6) + '...' : remarkBody}
          </div>
        </Tooltip>
      )}
    </div>
  );
}

export function renderWarehousingCell(record: ProductionOrder, openProcessDetail: (record: ProductionOrder, type: string) => void, renderCompletionTimeTag: (record: ProductionOrder, stage: string, rate: number, position?: string) => React.ReactNode) {
  const qualified = Number(record.warehousingQualifiedQuantity ?? 0) || 0;
  const total = Number(record.cuttingQuantity || record.orderQuantity) || 1;
  const rate = Math.min(100, Math.round((qualified / total) * 100));
  const frozen = isOrderFrozenByStatus(record);
  const isCompletedOrClosed = record.status === 'completed' || String(record.status || '') === 'closed';

  const getColor = () => {
    if (isCompletedOrClosed) return 'var(--color-success)';
    if (frozen) return 'var(--color-border)';
    if (rate === 100) return 'var(--color-success)';
    if (rate > 0) return 'var(--color-primary)';
    return 'var(--color-border)';
  };

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', cursor: frozen ? 'default' : 'pointer', padding: '4px 0', opacity: isCompletedOrClosed ? 0.75 : (frozen ? 0.6 : 1) }}
      onClick={(e) => { e.stopPropagation(); if (!frozen) openProcessDetail(record, 'warehousing'); }}
    >
      {renderCompletionTimeTag(record, '入库', rate || 0, 'left')}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--neutral-text)' }}>{qualified}/{total}</span>
        <div style={{ position: 'relative', width: '42px', height: '42px' }}>
          <svg width="42" height="42" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="21" cy="21" r="19" fill="none" stroke="var(--color-bg-subtle)" strokeWidth="3" />
            <circle cx="21" cy="21" r="19" fill="none" stroke={getColor()} strokeWidth="3"
              strokeDasharray={`${(rate / 100) * 119.38} 119.38`} strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.3s ease' }} />
          </svg>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '10px', fontWeight: 700, color: getColor() }}>
            {rate}%
          </div>
        </div>
      </div>
    </div>
  );
}
