import type { ProductionOrder } from '@/types/production';
import {
  renderStageProgressCell,
} from '../riskBadgeRenderers';
import type { StageProgressContext } from '../riskBadgeRenderers';
import type { UseProductionColumnsProps } from './types';

export function buildQuantityColumns({
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
      title: '裁剪数量',
      dataIndex: 'cuttingQuantity',
      key: 'cuttingQuantity',
      width: 70,
      align: 'right' as const,
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
    {
      title: '扎数',
      dataIndex: 'cuttingBundleCount',
      key: 'cuttingBundleCount',
      width: 60,
      align: 'right' as const,
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
    {
      title: '完成数量',
      dataIndex: 'completedQuantity',
      key: 'completedQuantity',
      width: 80,
      align: 'right' as const,
    },
    {
      title: '入库',
      dataIndex: 'warehousingQualifiedQuantity',
      key: 'warehousingQualifiedQuantity',
      width: 90,
      align: 'center' as const,
      render: (_: unknown, record: ProductionOrder) => {
        const qualified = Number(record.warehousingQualifiedQuantity ?? 0) || 0;
        const total = Number(record.cuttingQuantity || record.orderQuantity) || 1;
        const rate = Math.min(100, Math.round((qualified / total) * 100));
        return renderStageProgressCell(rate, record, 'warehousing', '入库', stageProgressCtx);
      },
    },
    {
      title: '次品数',
      dataIndex: 'unqualifiedQuantity',
      key: 'unqualifiedQuantity',
      width: 70,
      align: 'right' as const,
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
    {
      title: '返修数',
      dataIndex: 'repairQuantity',
      key: 'repairQuantity',
      width: 70,
      align: 'right' as const,
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
    {
      title: '库存',
      dataIndex: 'inStockQuantity',
      key: 'inStockQuantity',
      width: 70,
      align: 'right' as const,
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
  ];
}
