import React from 'react';
import { Tag } from 'antd';
import type { ProductionOrder } from '@/types/production';
import { displayOrderStatus, displayDate } from '@/utils/display';
import { getRemainingDaysDisplay } from '@/utils/progressColor';
import { calcOrderProgress } from '@/modules/production/utils/calcOrderProgress';
import type { UseProductionColumnsProps } from './types';

export function buildStatusColumns({
  stagnantOrderIds,
  deliveryRiskMap,
}: UseProductionColumnsProps): any[] {
  return [
    {
      title: '状态/交期',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: ProductionOrder['status'], record: ProductionOrder) => {
        const { text, color } = displayOrderStatus(status);
        const stagnantDays = stagnantOrderIds?.get(String(record.id));
        const progress = calcOrderProgress(record);
        const deliveryDate = displayDate(record.plannedEndDate, 'month-day');
        const remain = getRemainingDaysDisplay(record.plannedEndDate as string, record.createTime, record.actualEndDate, record.status);
        const aiRisk = deliveryRiskMap?.get(String(record.orderNo || ''));
        const slaMap: Record<string, { color: string; label: string }> = {
          on_track: { color: 'var(--color-success)', label: '正常' },
          at_risk: { color: 'var(--color-warning)', label: '预警' },
          breached: { color: 'var(--color-danger)', label: '超期' },
          completed: { color: 'var(--color-info)', label: '达标' },
        };
        const sla = slaMap[record.deliverySlaStatus || ''] || null;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <Tag color={color} style={{ margin: 0, fontSize: 12, lineHeight: '18px', padding: '0 4px' }}>{text}</Tag>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>{progress}%</span>
              {deliveryDate !== '-' && <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{deliveryDate}</span>}
              {remain.text && remain.text !== '-' && (
                <span style={{ fontSize: 12, fontWeight: 600, color: remain.color }}>{remain.text}</span>
              )}
              {record.isQuickResponse && <Tag color="volcano" style={{ margin: 0, fontSize: 12, lineHeight: '18px', padding: '0 4px' }}>快反</Tag>}
            </div>
            {stagnantDays !== undefined && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--color-danger)', animation: 'pulse-dot 1.5s infinite' }} />
                <span style={{ fontSize: 12, color: 'var(--color-danger)', fontWeight: 500 }}>停滞{stagnantDays}天</span>
              </div>
            )}
            {sla && (
              <span style={{ fontSize: 12, fontWeight: 500, color: sla.color }}>
                SLA:{sla.label}{record.actualDeliveryDays != null ? ` ${record.actualDeliveryDays}天` : ''}
              </span>
            )}
            {aiRisk && aiRisk.riskLevel !== 'safe' && aiRisk.predictedEndDate && (
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                AI预测 {displayDate(aiRisk.predictedEndDate, 'month-day')}{aiRisk.riskLevel === 'overdue' ? ' ⚠' : ''}
              </span>
            )}
          </div>
        );
      },
    },
  ];
}
