import { useMemo } from 'react';
import { ProductionOrder } from '@/types/production';
import type { DeliveryRiskItem } from '@/services/intelligence/intelligenceApi';
import { usePredictFinishHint } from './usePredictFinishHint';
import {
  ShipmentSumCell,
  createOrderSummaryRender,
  createProgressNodesRender,
  formatCompletionTime,
} from './cellRenderers';

interface UseProgressColumnsParams {
  orderSortField: string;
  orderSortOrder: 'asc' | 'desc';
  handleOrderSort: (field: string, order: 'asc' | 'desc') => void;
  boardStatsByOrder: Record<string, Record<string, number>>;
  boardTimesByOrder: Record<string, Record<string, string>>;
  progressNodesByStyleNo: Record<string, import('../types').ProgressNode[]>;
  openNodeDetail: (
    order: ProductionOrder,
    nodeType: string,
    nodeName: string,
    stats?: { done: number; total: number; percent: number; remaining: number },
    unitPrice?: number,
    processList?: { id?: string; processCode?: string; code?: string; name: string; unitPrice?: number }[]
  ) => void;
  isSupervisorOrAbove: boolean;
  handleCloseOrder: (order: ProductionOrder) => void;
  setPrintingRecord: (record: ProductionOrder) => void;
  handlePrintLabel: (record: ProductionOrder) => void | Promise<void>;
  setQuickEditRecord: (record: ProductionOrder | null) => void;
  setQuickEditVisible: (v: boolean) => void;
  openRemarkModal: (orderNo: string, merchandiser?: string) => void;
  stagnantOrderIds?: Map<string, number>;
  deliveryRiskMap?: Map<string, DeliveryRiskItem>;
  onShareOrder?: (order: ProductionOrder) => void;
  canManageOrderLifecycle?: boolean;
  isFactoryAccount?: boolean;
  onFactoryShip?: (order: ProductionOrder) => void;
}

export const useProgressColumns = ({
  orderSortField,
  orderSortOrder,
  handleOrderSort,
  boardStatsByOrder,
  boardTimesByOrder,
  progressNodesByStyleNo,
  openNodeDetail,
  isSupervisorOrAbove,
  handleCloseOrder,
  setPrintingRecord,
  handlePrintLabel,
  setQuickEditRecord,
  setQuickEditVisible,
  openRemarkModal,
  stagnantOrderIds,
  deliveryRiskMap,
  onShareOrder,
  canManageOrderLifecycle = false,
  isFactoryAccount = false,
  onFactoryShip,
}: UseProgressColumnsParams) => {
  const { getPredictHint, triggerPredict } = usePredictFinishHint(formatCompletionTime);

  const columns = useMemo<any[]>(() => [
    {
      title: '',
      key: 'orderSummary',
      width: 340,
      align: 'left' as const,
      render: createOrderSummaryRender({
        stagnantOrderIds,
        openRemarkModal,
        deliveryRiskMap,
      }),
    },
    {
      title: '',
      key: 'progressNodes',
      align: 'left' as const,
      onCell: () => ({ style: { overflow: 'visible' } }),
      render: createProgressNodesRender({
        progressNodesByStyleNo,
        boardStatsByOrder,
        boardTimesByOrder,
        openNodeDetail,
        setQuickEditRecord,
        setQuickEditVisible,
        setPrintingRecord,
        handlePrintLabel,
        isFactoryAccount,
        onFactoryShip,
        canManageOrderLifecycle,
        handleCloseOrder,
        onShareOrder,
        getPredictHint,
        triggerPredict,
      }),
    },
    ...(isFactoryAccount ? [{
      title: '已发数量',
      key: 'shipmentSum',
      width: 160,
      render: (_: any, record: ProductionOrder) => (
        <ShipmentSumCell orderId={String(record.id)} />
      ),
    }] : []),
  ], [
    orderSortField, orderSortOrder, handleOrderSort,
    boardStatsByOrder, boardTimesByOrder, progressNodesByStyleNo,
    openNodeDetail, isSupervisorOrAbove, handleCloseOrder,
    setPrintingRecord, handlePrintLabel, setQuickEditRecord, setQuickEditVisible,
    openRemarkModal,
    getPredictHint, triggerPredict,
    deliveryRiskMap, onShareOrder,
    isFactoryAccount, onFactoryShip,
  ]);

  return { columns };
};

export type { UseProgressColumnsParams };
