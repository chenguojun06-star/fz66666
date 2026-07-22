import React from 'react';
import { isDirectCuttingOrder, isOrderFrozenByStatus } from '@/utils/api';
import { ProductionOrder } from '@/types/production';
import { ProgressNode } from '../types';
import {
  stripWarehousingNode,
  resolveNodesForListOrder,
  getProcessesByNodeFromOrder,
  defaultNodes,
} from '../utils';
import { calcNodeData, buildProcessListForNode } from './nodeCalculations';
import { OrderStartNode } from './OrderStartNode';
import { ProgressNodeItem } from './ProgressNodeItem';
import { ProgressActions } from './ProgressActions';

export interface ProgressNodesContext {
  progressNodesByStyleNo: Record<string, ProgressNode[]>;
  boardStatsByOrder: Record<string, Record<string, number>>;
  boardTimesByOrder: Record<string, Record<string, string>>;
  processWorkerNamesByOrder: Record<string, Record<string, string[]>>;
  openNodeDetail: (
    order: ProductionOrder,
    nodeType: string,
    nodeName: string,
    stats?: { done: number; total: number; percent: number; remaining: number },
    unitPrice?: number,
    processList?: { id?: string; processCode?: string; code?: string; name: string; unitPrice?: number }[]
  ) => void;
  setQuickEditRecord: (record: ProductionOrder | null) => void;
  setQuickEditVisible: (v: boolean) => void;
  setPrintingRecord: (record: ProductionOrder) => void;
  handlePrintLabel: (record: ProductionOrder) => void | Promise<void>;
  labelPrintLoading?: boolean;
  isFactoryAccount?: boolean;
  onFactoryShip?: (order: ProductionOrder) => void;
  canManageOrderLifecycle?: boolean;
  handleCloseOrder: (order: ProductionOrder) => void;
  onShareOrder?: (order: ProductionOrder) => void;
  openKanban: (order: ProductionOrder) => void;
  getPredictHint: (orderId: string, stageName: string, percent: number) => string;
  triggerPredict: (params: { orderId: string; orderNo?: string; stageName: string; currentProgress: number }) => void;
}

export function createProgressNodesRender(ctx: ProgressNodesContext) {
  const {
    progressNodesByStyleNo,
    boardStatsByOrder,
    boardTimesByOrder,
    processWorkerNamesByOrder,
    openNodeDetail,
    setQuickEditRecord,
    setQuickEditVisible,
    setPrintingRecord,
    handlePrintLabel,
    labelPrintLoading,
    isFactoryAccount,
    onFactoryShip,
    canManageOrderLifecycle,
    handleCloseOrder,
    onShareOrder,
    getPredictHint,
    triggerPredict,
    openKanban,
  } = ctx;
  return (_: any, record: ProductionOrder) => {
    const frozen = isOrderFrozenByStatus(record);
    const isCompletedOrClosed = record.status === 'completed' || String(record.status || '') === 'closed';
    const ns = stripWarehousingNode(resolveNodesForListOrder(record, progressNodesByStyleNo, defaultNodes))
      .filter(n => !isDirectCuttingOrder(record) || !/采购|物料|备料|辅料|面料/.test(n.name || ''));
    const totalQty = Number(record.cuttingQuantity || record.orderQuantity) || 0;
    const nodeDoneMap = boardStatsByOrder[String(record.id || '')];
    const nodeTimeMap = boardTimesByOrder[String(record.id || '')];
    const nodeWorkerNamesMap = processWorkerNamesByOrder[String(record.id || '')];
    const progressTrackMinWidth = Math.max((ns.length + 1) * 92, 420);

    if (!ns || ns.length === 0) {
      return (
        <div style={{ color: 'var(--neutral-text-disabled)', fontSize: 'var(--font-size-base)', padding: '20px 0' }}>
          暂无工序进度数据
        </div>
      );
    }

    const handleNodeClick = (node: ProgressNode) => {
      if (frozen) return;
      const { processList, effectiveNodeType } = buildProcessListForNode(
        node,
        record,
        ns,
        progressNodesByStyleNo,
        getProcessesByNodeFromOrder,
      );
      const nodeData = calcNodeData(node, record, totalQty, nodeDoneMap, nodeTimeMap, nodeWorkerNamesMap, isCompletedOrClosed, frozen);
      openNodeDetail(
        record,
        effectiveNodeType,
        nodeData.nodeName,
        { done: nodeData.completedQty, total: totalQty, percent: nodeData.percent, remaining: nodeData.remaining },
        node.unitPrice,
        processList,
      );
    };

    const handleNodeMouseEnter = (node: ProgressNode, nodeData: ReturnType<typeof calcNodeData>) => {
      if (frozen) return;
      void triggerPredict({
        orderId: String(record.id || '').trim(),
        orderNo: String(record.orderNo || '').trim() || undefined,
        stageName: nodeData.nodeName,
        currentProgress: nodeData.percent,
      });
    };

    return (
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        width: '100%',
        alignSelf: 'stretch',
      }}>
        <div style={{
          display: 'flex',
          flex: 1,
          gap: 0,
          alignItems: 'stretch',
          padding: '0 12px',
          minWidth: progressTrackMinWidth,
          overflow: 'visible',
        }}>
          <OrderStartNode
            record={record}
            totalQty={totalQty}
            frozen={frozen}
            isCompletedOrClosed={isCompletedOrClosed}
          />
          {ns.map((node: ProgressNode, index: number) => {
            const nodeData = calcNodeData(
              node,
              record,
              totalQty,
              nodeDoneMap,
              nodeTimeMap,
              nodeWorkerNamesMap,
              isCompletedOrClosed,
              frozen,
            );
            const predictHint = getPredictHint(String(record.id || ''), nodeData.nodeName, nodeData.percent);
            return (
              <ProgressNodeItem
                key={node.id || index}
                node={node}
                index={index}
                total={ns.length}
                record={record}
                nodeData={nodeData}
                frozen={frozen}
                isCompletedOrClosed={isCompletedOrClosed}
                predictHint={predictHint}
                onClick={() => handleNodeClick(node)}
                onMouseEnter={() => handleNodeMouseEnter(node, nodeData)}
              />
            );
          })}
        </div>
        <ProgressActions
          record={record}
          frozen={frozen}
          openKanban={openKanban}
          setQuickEditRecord={setQuickEditRecord}
          setQuickEditVisible={setQuickEditVisible}
          setPrintingRecord={setPrintingRecord}
          handlePrintLabel={handlePrintLabel}
          labelPrintLoading={labelPrintLoading}
          isFactoryAccount={isFactoryAccount}
          onFactoryShip={onFactoryShip}
          canManageOrderLifecycle={canManageOrderLifecycle}
          handleCloseOrder={handleCloseOrder}
          onShareOrder={onShareOrder}
        />
      </div>
    );
  };
}
