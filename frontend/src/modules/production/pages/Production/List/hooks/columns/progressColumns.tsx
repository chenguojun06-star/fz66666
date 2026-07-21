import React from 'react';
import type { ProductionOrder } from '@/types/production';
import LiquidProgressBar from '@/components/common/LiquidProgressBar';
import BudgetDaysEditor from '@/components/common/BudgetDaysEditor';
import { isDirectCuttingOrder, isOrderFrozenByStatus } from '@/utils/api';
import {
  hasSecondaryProcessForOrder,
  renderStageProgressCell,
} from '../riskBadgeRenderers';
import type { StageProgressContext } from '../riskBadgeRenderers';
import type { UseProductionColumnsProps } from './types';

export function buildProgressColumns({
  openNodeDetail,
  openProcessDetail,
  renderCompletionTimeTag,
  getStageCompletionTime,
  onOpenInspectDrawer,
}: UseProductionColumnsProps): any[] {
  const stageProgressCtx: StageProgressContext = {
    openNodeDetail,
    openProcessDetail,
    renderCompletionTimeTag,
    getStageCompletionTime,
    onOpenInspectDrawer,
  };

  return [
    {
      title: '采购',
      dataIndex: 'procurementCompletionRate',
      key: 'procurementSummary',
      width: 90,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => {
        const directCutting = isDirectCuttingOrder(record as any);
        const frozen = isOrderFrozenByStatus(record);
        const isCompletedOrClosed = record.status === 'completed' || String(record.status || '') === 'closed';
        const colorStatus = isCompletedOrClosed ? 'normal' : (frozen ? 'default' : 'normal');

        if (directCutting) {
          return (
            <div
              style={{ cursor: 'default', padding: '4px', opacity: 0.8 }}
              onClick={(e) => { e.stopPropagation(); }}
            >
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: '2px', textAlign: 'center' }}>
                无采购
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '2px', textAlign: 'center' }}>
                -/-
              </div>
              <LiquidProgressBar percent={0} width="100%" height={16} status="default" />
            </div>
          );
        }

        const procurePercent = (rate || 0) > 0 ? 100 : 0;
        return (
          <div
            style={{ cursor: frozen ? 'default' : 'pointer', padding: '4px', transition: 'background 0.2s', opacity: isCompletedOrClosed ? 0.75 : (frozen ? 0.6 : 1) }}
            onClick={(e) => {
              e.stopPropagation();
              if (frozen) return;
              if (openNodeDetail) {
                const procureCompleted = (rate || 0) > 0 ? 1 : 0;
                openNodeDetail(record, 'procurement', '采购', { done: procureCompleted, total: 1, percent: procurePercent, remaining: procureCompleted > 0 ? 0 : 1 });
              } else {
                openProcessDetail(record, 'procurement');
              }
            }}
            onMouseEnter={(e) => { if (!frozen) e.currentTarget.style.background = 'var(--color-bg-container)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
          >
            {renderCompletionTimeTag(record, '采购', rate || 0)}
            <LiquidProgressBar percent={procurePercent} width="100%" height={16} status={colorStatus} />
            <BudgetDaysEditor
              record={record}
              nodeName="采购"
              stageEndTime={getStageCompletionTime?.(record, '采购', rate || 0) || undefined}
              isCompletedOrClosed={isCompletedOrClosed}
              isProcureNode
            />
          </div>
        );
      },
    },
    {
      title: '裁剪',
      dataIndex: 'cuttingCompletionRate',
      key: 'cuttingSummary',
      width: 90,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => renderStageProgressCell(rate, record, 'cutting', '裁剪', stageProgressCtx),
    },
    {
      title: '二次工艺',
      dataIndex: 'secondaryProcessRate',
      key: 'secondaryProcessSummary',
      width: 70,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => {
        if (!hasSecondaryProcessForOrder(record)) {
          return (
            <div style={{ padding: '4px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', opacity: 0.7 }}>无二次工艺</span>
            </div>
          );
        }
        return renderStageProgressCell(rate, record, 'secondaryProcess', '二次工艺', stageProgressCtx);
      },
    },
    {
      title: '车缝',
      dataIndex: 'carSewingCompletionRate',
      key: 'carSewingSummary',
      width: 90,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => renderStageProgressCell(rate, record, 'carSewing', '车缝', stageProgressCtx),
    },
    {
      title: '尾部',
      dataIndex: 'tailProcessRate',
      key: 'tailProcessSummary',
      width: 90,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => renderStageProgressCell(rate, record, 'tailProcess', '尾部', stageProgressCtx),
    },
  ];
}
